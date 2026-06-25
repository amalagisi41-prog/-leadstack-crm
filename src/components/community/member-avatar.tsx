import type { AuthorView } from "@/types/community";

const COMMUNITY_DEFAULT_BRAND = "#202124";

/**
 * Round member avatar with the Skool-style numeric level badge overlaid at the
 * bottom-right. Initials when no image. Server-safe (pure presentational).
 */
export function MemberAvatar({
  author,
  size = 36,
  brand = COMMUNITY_DEFAULT_BRAND,
}: {
  author: AuthorView;
  size?: number;
  brand?: string;
}) {
  const initial = author.displayName.charAt(0).toUpperCase() || "?";
  const badge = Math.round(size * 0.42);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={author.avatarUrl}
          alt={author.displayName}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
          style={{ backgroundColor: brand, fontSize: size * 0.42 }}
        >
          {initial}
        </div>
      )}
      <span
        className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border-2 border-white bg-[#202124] font-semibold text-white"
        style={{
          width: badge,
          height: badge,
          fontSize: badge * 0.6,
          lineHeight: 1,
        }}
        title={`Level ${author.level}`}
      >
        {author.level}
      </span>
    </div>
  );
}
