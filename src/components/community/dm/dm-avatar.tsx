export function DmAvatar({
  name,
  avatarUrl,
  size = 40,
  brand,
}: {
  name: string;
  avatarUrl: string | null;
  size?: number;
  brand: string;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, backgroundColor: brand, fontSize: size * 0.42 }}
    >
      {name.charAt(0).toUpperCase() || "?"}
    </div>
  );
}
