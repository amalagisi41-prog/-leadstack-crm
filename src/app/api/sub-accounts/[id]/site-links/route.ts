import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getSubAccountSiteLinks } from "@/lib/public-site/site-links";

/**
 * GET — this sub-account's real public footprint (gitpage home, IDX
 * listings search, published booking pages). Powers the Website Studio's
 * cta_link quick-pick and "Your other pages" card. Any active member may
 * read (matches the read access level of the underlying collections).
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;

  const links = await getSubAccountSiteLinks(id);
  return NextResponse.json(links);
}
