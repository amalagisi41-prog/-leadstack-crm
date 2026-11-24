/** Client-safe: where the Connect screen sends users to link their Google account. */
export function googleAccountConnectPath(subAccountId: string): string {
  return `/api/sub-accounts/${subAccountId}/google/connect`;
}
