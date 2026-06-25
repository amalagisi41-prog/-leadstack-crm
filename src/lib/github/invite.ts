import "server-only";

// Stub — see publish/README.md. Typed no-op for the buyer's clone.
// The real implementation lives in main and powers the post-payment
// auto-invite flow on /thank-you, which is itself stubbed in the
// buyer's tree (LeadStack-marketing-only).

export type AddToTeamResult =
  | { status: "invited" }
  | { status: "already_member" }
  | { status: "failed"; reason: string; httpStatus: number };

export function isGithubInviteConfigured(): boolean {
  return false;
}

export async function addToTeam(_input: {
  username: string;
}): Promise<AddToTeamResult> {
  return { status: "failed", reason: "disabled", httpStatus: 0 };
}
