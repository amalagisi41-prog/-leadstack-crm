import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Server-only record that a person's AI client actually completed the MCP
 * OAuth handshake. The guided setup reads this to confirm a connection
 * instead of trusting that the user clicked "I did it".
 */
export interface McpConnectionRecord {
  clientName: string | null;
  connectedAt: number;
  lastUsedAt: number | null;
}

function ref(uid: string) {
  return getAdminDb().doc(`mcpConnections/${uid}`);
}

export async function recordMcpConnection(uid: string, clientName: string | null): Promise<void> {
  await ref(uid).set(
    { clientName, connectedAt: Date.now(), lastUsedAt: null },
    { merge: true },
  );
}

export async function touchMcpConnection(uid: string): Promise<void> {
  await ref(uid).set({ lastUsedAt: Date.now() }, { merge: true });
}

export async function readMcpConnection(uid: string): Promise<McpConnectionRecord | null> {
  const snap = await ref(uid).get();
  const data = snap.data();
  if (!snap.exists || typeof data?.connectedAt !== "number") return null;
  return {
    clientName: typeof data.clientName === "string" ? data.clientName : null,
    connectedAt: data.connectedAt,
    lastUsedAt: typeof data.lastUsedAt === "number" ? data.lastUsedAt : null,
  };
}
