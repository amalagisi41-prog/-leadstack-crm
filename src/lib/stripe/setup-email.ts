import "server-only";

// Stub — see publish/README.md. Typed no-op for the buyer's clone.
// The real implementation lives in main and sends the LeadStack
// post-GitHub-invite setup walkthrough; not relevant to a buyer who
// has already cloned the codebase.
export async function sendRepoAccessSetupEmail(_params: {
  to: string;
  githubUsername: string;
  templateRepoUrl: string;
}): Promise<string | null> {
  return null;
}
