import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { COMMUNITY_BG, COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { ProfileEditor } from "@/components/community/profile-editor";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string }>;
}) {
  const { saId, groupSlug } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, member } = access;
  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;

  return (
    <div className="min-h-screen" style={{ backgroundColor: COMMUNITY_BG }}>
      <ProfileEditor
        saId={saId}
        groupSlug={group.slug}
        brand={brand}
        initial={{
          displayName:
            member.displayName?.trim() || member.email.split("@")[0] || "",
          avatarUrl: member.avatarUrl,
          bio: member.bio ?? "",
          email: member.email,
        }}
      />
    </div>
  );
}
