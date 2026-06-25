"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Circle, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PlayerLesson {
  id: string;
  title: string;
  sectionId: string | null;
  embedUrl: string | null;
  /** Sanitized lesson body HTML (already run through renderLessonBodyHtml). */
  body: string;
  resourceLinks: { label: string; url: string }[];
}
export interface PlayerSection {
  id: string;
  title: string;
}

export function LessonPlayer({
  saId,
  groupId,
  groupSlug,
  courseId,
  brand,
  sections,
  lessons,
  currentLessonId,
  completedIds: initialCompleted,
}: {
  saId: string;
  groupId: string;
  groupSlug: string;
  courseId: string;
  brand: string;
  sections: PlayerSection[];
  lessons: PlayerLesson[];
  currentLessonId: string;
  completedIds: string[];
}) {
  const router = useRouter();
  const [completed, setCompleted] = useState<Set<string>>(
    new Set(initialCompleted),
  );
  const [saving, setSaving] = useState(false);

  const current = lessons.find((l) => l.id === currentLessonId) ?? lessons[0];
  const idx = lessons.findIndex((l) => l.id === current.id);
  const next = lessons[idx + 1] ?? null;
  const lessonHref = (id: string) =>
    `/c/${saId}/${groupSlug}/classroom/${courseId}/${id}`;

  const sectionIds = new Set(sections.map((s) => s.id));
  const inSection = (sid: string | null) =>
    lessons.filter((l) =>
      sid === null
        ? !l.sectionId || !sectionIds.has(l.sectionId)
        : l.sectionId === sid,
    );
  const other = inSection(null);

  async function completeAndContinue() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/community/${saId}/${groupId}/courses/${courseId}/lessons/${current.id}/complete`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error();
      setCompleted((prev) => new Set(prev).add(current.id));
      if (next) {
        router.push(lessonHref(next.id));
      } else {
        toast.success("Course complete! 🎉");
        router.refresh();
      }
    } catch {
      toast.error("Couldn't save progress");
    } finally {
      setSaving(false);
    }
  }

  const NavLesson = ({ l }: { l: PlayerLesson }) => {
    const isCurrent = l.id === current.id;
    return (
      <Link
        href={lessonHref(l.id)}
        style={
          isCurrent
            ? {
                backgroundColor: `color-mix(in srgb, ${brand} 14%, white)`,
                color: brand,
              }
            : undefined
        }
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          isCurrent
            ? "font-medium"
            : "text-[#3a3a44] hover:bg-black/[0.04]",
        )}
      >
        {completed.has(l.id) ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: brand }} />
        ) : (
          <Circle className="h-4 w-4 shrink-0 text-[#c4c4c4]" />
        )}
        <span className="truncate">{l.title}</span>
      </Link>
    );
  };

  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <aside className="space-y-3">
        {sections.map((s) => {
          const ls = inSection(s.id);
          if (ls.length === 0) return null;
          return (
            <div key={s.id}>
              <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-[#909090]">
                {s.title}
              </p>
              <div className="space-y-0.5">
                {ls.map((l) => (
                  <NavLesson key={l.id} l={l} />
                ))}
              </div>
            </div>
          );
        })}
        {other.length > 0 && (
          <div className="space-y-0.5">
            {other.map((l) => (
              <NavLesson key={l.id} l={l} />
            ))}
          </div>
        )}
      </aside>

      <div className="min-w-0 space-y-4 rounded-2xl border border-[#E4E4E4] bg-white p-5 shadow-sm sm:p-6">
        {current.embedUrl && (
          <div className="aspect-video w-full overflow-hidden rounded-xl border border-[#E4E4E4] bg-black">
            <iframe
              src={current.embedUrl}
              title={current.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
        )}

        <h1 className="text-xl font-semibold text-[#202124]">{current.title}</h1>

        {current.body && (
          <div
            className="prose prose-sm max-w-none leading-relaxed prose-headings:text-[#202124] prose-p:text-[#3a3a44] prose-li:text-[#3a3a44] prose-strong:text-[#202124] prose-a:text-[color:var(--brand)]"
            style={{ ["--brand" as string]: brand }}
            dangerouslySetInnerHTML={{ __html: current.body }}
          />
        )}

        {current.resourceLinks.length > 0 && (
          <div className="rounded-lg border border-[#E4E4E4] bg-[#F8F7F5] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#909090]">
              Resources
            </p>
            <ul className="space-y-1">
              {current.resourceLinks.map((r, i) => (
                <li key={i}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-sm hover:underline"
                    style={{ color: brand }}
                  >
                    {r.label} <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={completeAndContinue}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: brand }}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {completed.has(current.id)
            ? next
              ? "Next lesson"
              : "Completed"
            : next
              ? "Complete & continue"
              : "Complete"}
        </button>
      </div>
    </div>
  );
}
