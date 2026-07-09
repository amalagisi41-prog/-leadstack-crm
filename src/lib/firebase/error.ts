/**
 * Human-readable suffix for a thrown Firestore/Auth client SDK error, e.g.
 * "(permission-denied)". Used in toasts so a failed write is diagnosable
 * without opening devtools — several "create X" flows swallowed the real
 * reason and just said "try again," which was invisible to whoever hit it.
 */
export function describeFirestoreError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code) return `(${code})`;
  }
  if (err instanceof Error && err.message) return `(${err.message})`;
  return "Try again.";
}
