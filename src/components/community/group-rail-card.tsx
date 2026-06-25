import { Link2 } from "lucide-react";
import { MemberAvatar } from "@/components/community/member-avatar";
import type { AuthorView, CommunityGroup } from "@/types/community";

/**
 * The Skool-style group info card for the feed right rail: card image, name +
 * handle, description, admin links, a Members / Online / Admins stat row, and a
 * row of member avatars. Presentational — server-rendered.
 */
export function GroupRailCard({
  group,
  brand,
  memberCount,
  onlineCount,
  adminCount,
  avatars,
}: {
  group: CommunityGroup;
  brand: string;
  memberCount: number;
  onlineCount: number;
  adminCount: number;
  avatars: AuthorView[];
}) {
  const image = group.cardImageUrl ?? group.coverUrl;
  const desc = group.tagline?.trim() || group.about;
  const links = group.links ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-[#E4E4E4] bg-white">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="aspect-video w-full object-cover" />
      ) : (
        <div
          className="flex aspect-video w-full items-center justify-center text-lg font-semibold text-white"
          style={{ backgroundColor: brand }}
        >
          {group.name.charAt(0)}
        </div>
      )}

      <div className="p-4">
        <h2 className="text-base font-semibold text-[#202124]">{group.name}</h2>
        <p className="text-xs text-[#909090]">/{group.slug}</p>
        {desc && (
          <p className="mt-2 line-clamp-4 text-sm text-[#3a3a44]">{desc}</p>
        )}

        {links.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {links.map((l, i) => (
              <a
                key={i}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-sm hover:underline"
                style={{ color: brand }}
              >
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{l.label}</span>
              </a>
            ))}
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 divide-x divide-[#f0f0f0] border-y border-[#f0f0f0] py-2 text-center">
          <Stat n={memberCount} label="Members" />
          <Stat n={onlineCount} label="Online" />
          <Stat n={adminCount} label={adminCount === 1 ? "Admin" : "Admins"} />
        </div>

        {avatars.length > 0 && (
          <div className="mt-3 flex -space-x-2">
            {avatars.map((a) => (
              <div key={a.memberId} className="ring-2 ring-white">
                <MemberAvatar author={a} size={32} brand={brand} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="text-sm font-semibold text-[#202124]">{n}</div>
      <div className="text-[10px] uppercase tracking-wide text-[#909090]">
        {label}
      </div>
    </div>
  );
}
