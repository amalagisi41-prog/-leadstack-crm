import "server-only";

export async function mintGitpageAgencyCode(
  _params: { email: string },
): Promise<{ code: string; expiresAt: number } | null> {
  return null;
}
