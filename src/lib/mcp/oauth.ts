import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

const CODE_TTL_SECONDS = 5 * 60;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

type SignedPayload = {
  type: "client" | "code" | "access";
  exp: number;
  [key: string]: unknown;
};

function secret(): string {
  const value = process.env.MCP_OAUTH_SECRET ?? process.env.COOKIE_SECRET_CURRENT;
  if (!value) throw new Error("MCP_OAUTH_SECRET is not configured.");
  return value;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function sign(payload: SignedPayload): string {
  const encoded = encode(payload);
  const mac = createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${mac}`;
}

function clientStorageKey(clientId: string): string {
  return createHash("sha256").update(clientId).digest("hex");
}

function verify<T extends SignedPayload>(value: string, type: T["type"]): T | null {
  const [encoded, suppliedMac] = value.split(".");
  if (!encoded || !suppliedMac) return null;
  const expectedMac = createHmac("sha256", secret()).update(encoded).digest("base64url");
  const left = Buffer.from(suppliedMac);
  const right = Buffer.from(expectedMac);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const payload = decode<T>(encoded);
  if (!payload || payload.type !== type || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export type RegisteredClient = {
  client_id: string;
  redirect_uris: string[];
  client_name?: string;
};

export async function registerClient(input: { redirectUris: string[]; clientName?: string }): Promise<RegisteredClient> {
  const redirectUris = input.redirectUris.filter((uri) => {
    try {
      const url = new URL(uri);
      return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
    } catch {
      return false;
    }
  });
  if (!redirectUris.length) throw new Error("At least one HTTPS or localhost redirect URI is required.");
  const payload = {
    type: "client" as const,
    exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    redirectUris,
    clientName: input.clientName,
  };
  const clientId = sign(payload);
  await getAdminDb().doc(`mcpOauthClients/${clientStorageKey(clientId)}`).set({
    clientId,
    redirectUris,
    clientName: input.clientName ?? null,
    createdAt: Date.now(),
  });
  return { client_id: clientId, redirect_uris: redirectUris, client_name: input.clientName };
}

export async function readClient(clientId: string): Promise<RegisteredClient | null> {
  const payload = verify<SignedPayload & { redirectUris: string[]; clientName?: string }>(clientId, "client");
  if (payload && Array.isArray(payload.redirectUris)) {
    return { client_id: clientId, redirect_uris: payload.redirectUris, client_name: payload.clientName };
  }
  const snapshot = await getAdminDb().doc(`mcpOauthClients/${clientStorageKey(clientId)}`).get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.clientId !== clientId || !Array.isArray(data.redirectUris)) return null;
  return {
    client_id: clientId,
    redirect_uris: data.redirectUris.filter((uri: unknown): uri is string => typeof uri === "string"),
    client_name: typeof data.clientName === "string" ? data.clientName : undefined,
  };
}

export async function createAuthorizationCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  uid: string;
  email: string;
}): Promise<string> {
  const nonce = randomBytes(24).toString("base64url");
  const code = sign({
    type: "code",
    exp: Math.floor(Date.now() / 1000) + CODE_TTL_SECONDS,
    ...input,
    nonce,
  });
  await getAdminDb().doc(`mcpOauthCodes/${nonce}`).set({ ...input, expiresAt: Date.now() + CODE_TTL_SECONDS * 1000, usedAt: null });
  return code;
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{ accessToken: string; expiresIn: number; uid: string; email: string } | null> {
  const payload = verify<SignedPayload & {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    uid: string;
    email: string;
  }>(input.code, "code");
  if (!payload || payload.clientId !== input.clientId || payload.redirectUri !== input.redirectUri) return null;
  const stored = await getAdminDb().runTransaction(async (transaction) => {
    const ref = getAdminDb().doc(`mcpOauthCodes/${String(payload.nonce)}`);
    const snap = await transaction.get(ref);
    const data = snap.data();
    if (!snap.exists || data?.usedAt || typeof data?.expiresAt !== "number" || data.expiresAt < Date.now()) return null;
    transaction.update(ref, { usedAt: Date.now() });
    return data;
  });
  if (!stored) return null;
  const challenge = createHash("sha256").update(input.codeVerifier).digest("base64url");
  if (challenge !== payload.codeChallenge) return null;
  const accessToken = sign({
    type: "access",
    exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS,
    uid: payload.uid,
    email: payload.email,
  });
  return { accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, uid: payload.uid, email: payload.email };
}

export function readAccessToken(token: string): { uid: string; email: string } | null {
  const payload = verify<SignedPayload & { uid: string; email: string }>(token, "access");
  if (!payload?.uid) return null;
  return { uid: payload.uid, email: payload.email ?? "" };
}

export async function readSessionCaller(): Promise<{ uid: string; email: string } | null> {
  const sessionCookie = (await cookies()).get("__session")?.value;
  if (!sessionCookie) return null;
  const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true).catch(() => null);
  return decoded?.uid ? { uid: decoded.uid, email: decoded.email ?? "" } : null;
}

export async function readRequestCaller(request: Request): Promise<{ uid: string; email: string } | null> {
  const uid = request.headers.get("x-user-uid");
  if (uid) return { uid, email: request.headers.get("x-user-email") ?? "" };
  return readSessionCaller();
}
