import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { hashApiKey, mintApiKey } from "@/lib/api/keys";
import { LATEST_API_VERSION } from "@/lib/api/versions";
import {
  createApiKey,
  docToResponse,
  listApiKeys,
} from "@/lib/firestore/api-keys";
import type { ApiKeyMode, ApiKeyScope } from "@/types/api";

/**
 * API keys management for a sub-account.
 *
 * GET    — list the sub-account's keys. Query: `?mode=live|test`,
 *          `?includeRevoked=1`. Returns `ApiKeyResponse[]` — never the raw
 *          secret.
 *
 * POST   — mint a new key. Body: { name, mode, scopes? }. Returns the
 *          full `ApiKeyResponse` INCLUDING `secret` — the only moment the
 *          raw key is visible. The UI MUST render the "copy now, you
 *          won't see this again" banner using this value.
 *
 * Auth: sub-account admin (agency owners count). Collaborators can't mint
 * or list keys — keys are an admin tool that grants programmatic access
 * equivalent to or broader than the caller's own session.
 */

const VALID_SCOPES: ApiKeyScope[] = ["admin", "forms-ingest"];
const VALID_MODES: ApiKeyMode[] = ["live", "test"];
const MAX_NAME = 60;

interface CreateBody {
  name?: string;
  mode?: ApiKeyMode;
  scopes?: ApiKeyScope[];
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const url = new URL(request.url);
  const modeParam = url.searchParams.get("mode");
  const includeRevoked = url.searchParams.get("includeRevoked") === "1";

  const mode =
    modeParam && VALID_MODES.includes(modeParam as ApiKeyMode)
      ? (modeParam as ApiKeyMode)
      : undefined;

  const docs = await listApiKeys(subAccountId, { mode, includeRevoked });
  return NextResponse.json({ keys: docs.map(docToResponse) });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json(
      { error: "Key name is required." },
      { status: 400 },
    );
  }
  if (name.length > MAX_NAME) {
    return NextResponse.json(
      { error: `Key name must be ${MAX_NAME} characters or fewer.` },
      { status: 400 },
    );
  }

  if (!body.mode || !VALID_MODES.includes(body.mode)) {
    return NextResponse.json(
      { error: "Mode must be 'live' or 'test'." },
      { status: 400 },
    );
  }

  const scopes: ApiKeyScope[] =
    Array.isArray(body.scopes) && body.scopes.length > 0
      ? body.scopes
      : ["admin"];
  for (const s of scopes) {
    if (!VALID_SCOPES.includes(s)) {
      return NextResponse.json(
        {
          error: `Unknown scope '${s}'. Allowed: ${VALID_SCOPES.join(", ")}.`,
        },
        { status: 400 },
      );
    }
  }
  // forms-ingest is exclusive — it grants write-only access to a single
  // endpoint and pairs poorly with admin. Reject mixed scopes explicitly so
  // operators don't accidentally mint a key with browser-safe CORS that
  // also has full CRUD.
  if (scopes.includes("forms-ingest") && scopes.includes("admin")) {
    return NextResponse.json(
      {
        error:
          "Cannot combine 'admin' and 'forms-ingest' on one key. Mint two keys instead.",
      },
      { status: 400 },
    );
  }

  // Look up the sub-account once to read its agencyId for tenancy stamping.
  // requireSubAccountAdmin already verified the caller's access; this read
  // is purely to denormalise agencyId onto the new key doc.
  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 },
    );
  }
  const subData = subSnap.data()!;
  const agencyId = (subData.agencyId as string) ?? "";
  if (!agencyId) {
    return NextResponse.json(
      { error: "Sub-account is missing agencyId" },
      { status: 500 },
    );
  }

  // Agency-gate check. Sub-account admin needs the agency owner to have
  // flipped `apiAccessEnabledByAgency` on before they can mint keys.
  // Default-deny on missing field so legacy sub-accounts stay locked
  // until the agency owner opens Manage and turns API access on.
  if (subData.apiAccessEnabledByAgency !== true) {
    return NextResponse.json(
      {
        error:
          "API access is disabled for this sub-account. Your agency administrator can enable it from Manage in the agency sub-accounts list.",
      },
      { status: 403 },
    );
  }

  const minted = mintApiKey(body.mode);
  const doc = await createApiKey({
    subAccountId,
    agencyId,
    name,
    mode: body.mode,
    prefix: minted.prefix,
    hashedSecret: hashApiKey(minted.rawKey),
    scopes,
    // Pin the key to the version live at mint time. The auth middleware
    // reads this when no `LeadStack-Version` request header is set, so
    // future breaking API changes don't silently change behaviour for
    // already-issued keys.
    defaultVersion: LATEST_API_VERSION,
    createdByUid: access.uid,
  });

  // The ONLY response that carries the raw key. From here on every read
  // returns secret: undefined.
  return NextResponse.json({
    key: { ...docToResponse(doc), secret: minted.rawKey },
  });
}
