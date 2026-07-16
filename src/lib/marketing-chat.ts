const MARKETING_CHAT_PUBLIC_ROUTES = new Set([
  "/",
  "/about",
  "/help",
  "/playbook",
  "/security",
  "/terms",
  "/privacy",
  "/signup",
  "/login",
]);

export function getMarketingWebChatSubAccountId(): string | null {
  const value =
    process.env.NEXT_PUBLIC_MARKETING_WEB_CHAT_SUBACCOUNT_ID?.trim() || "";
  return value || null;
}

export function shouldRenderMarketingChat(
  pathname: string | null | undefined,
): boolean {
  const subAccountId = getMarketingWebChatSubAccountId();
  if (!subAccountId || !pathname) return false;
  if (MARKETING_CHAT_PUBLIC_ROUTES.has(pathname)) return true;
  return pathname.startsWith("/compare/");
}

export function isMarketingWebChatSubAccount(
  subAccountId: string | null | undefined,
): boolean {
  const marketingSubAccountId = getMarketingWebChatSubAccountId();
  return !!subAccountId && !!marketingSubAccountId && subAccountId === marketingSubAccountId;
}
