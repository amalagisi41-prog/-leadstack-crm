/**
 * The setup hub: every AgentStack Method step with its status. Every
 * "See all setup steps" / "Setup" entry point links here, so the full step
 * list is always one click away.
 */
export const SETUP_HUB_PATH = "/agency/get-started";

export function setupHubHref(subAccountId: string | null | undefined): string {
  return subAccountId ? `${SETUP_HUB_PATH}?sa=${encodeURIComponent(subAccountId)}` : SETUP_HUB_PATH;
}
