import { GraduationCap } from "lucide-react";

/**
 * Skool-style course thumbnail: the uploaded image, or a dark placeholder with
 * an icon + the course title when none is set. 16:9. Presentational — used by
 * both the member catalog (light page) and the staff builder list (themed),
 * and looks right in both because the block is always dark like Skool's.
 */
export function CourseThumb({
  thumbnailUrl,
  title,
  brand,
  rounded = "rounded-t-xl",
}: {
  thumbnailUrl: string | null;
  title: string;
  brand: string;
  rounded?: string;
}) {
  return (
    <div
      className={`relative aspect-video w-full overflow-hidden bg-gradient-to-b from-[#23232a] to-[#101013] ${rounded}`}
    >
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt={title}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
          <GraduationCap className="h-8 w-8" style={{ color: brand }} />
          <span className="text-sm font-semibold uppercase tracking-wide text-white/90">
            {title}
          </span>
        </div>
      )}
    </div>
  );
}
