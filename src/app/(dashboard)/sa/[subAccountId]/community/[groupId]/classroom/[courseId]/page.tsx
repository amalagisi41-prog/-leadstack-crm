"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  GripVertical,
  Loader2,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import {
  subscribeToCourse,
  subscribeToLessons,
  subscribeToSections,
} from "@/lib/firestore/community-classroom";
import { parseVideoUrl } from "@/lib/community/video-embed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CourseSettingsModal } from "@/components/community/classroom/course-settings-modal";
import { RichTextEditor } from "@/components/community/classroom/rich-text-editor";
import { cn } from "@/lib/utils";
import type { Course, CourseSection, Lesson, ResourceLink } from "@/types/community";

const UNGROUPED = "__ungrouped__";

export default function CourseEditorPage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string; courseId: string }>;
}) {
  const { groupId, courseId } = use(params);
  const { subAccountId } = useSubAccount();
  const router = useRouter();
  const apiBase = `/api/sub-accounts/${subAccountId}/community/${groupId}/courses/${courseId}`;

  const [course, setCourse] = useState<Course | null>(null);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    const u1 = subscribeToCourse(subAccountId, groupId, courseId, (c) => {
      setCourse(c);
      setLoaded(true);
    });
    const u2 = subscribeToSections(subAccountId, groupId, courseId, setSections);
    const u3 = subscribeToLessons(subAccountId, groupId, courseId, setLessons);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [subAccountId, groupId, courseId]);

  useEffect(() => {
    const ordered = [...lessons].sort((a, b) => a.order - b.order);
    setSelectedId((prev) =>
      prev && ordered.some((l) => l.id === prev)
        ? prev
        : (ordered[0]?.id ?? null),
    );
  }, [lessons]);

  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!course) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Course not found.{" "}
        <Link
          href={`/sa/${subAccountId}/community/${groupId}/classroom`}
          className="underline"
        >
          Back to Classroom
        </Link>
      </div>
    );
  }

  async function addSection() {
    await fetch(`${apiBase}/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New section" }),
    });
  }
  async function addLesson(sectionId: string | null) {
    const res = await fetch(`${apiBase}/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New lesson", sectionId }),
    });
    const d = (await res.json().catch(() => ({}))) as { lesson?: { id: string } };
    if (d.lesson?.id) setSelectedId(d.lesson.id);
  }
  async function deleteCourse() {
    if (!confirm("Delete this course and all its lessons?")) return;
    const res = await fetch(apiBase, { method: "DELETE" });
    if (res.ok) {
      toast.success("Course deleted");
      router.push(`/sa/${subAccountId}/community/${groupId}/classroom`);
    }
  }

  const sectionIds = new Set(sections.map((s) => s.id));
  const containerOf = (l: Lesson) =>
    l.sectionId && sectionIds.has(l.sectionId) ? l.sectionId : UNGROUPED;
  const lessonsIn = (container: string) =>
    lessons
      .filter((l) => containerOf(l) === container)
      .sort((a, b) => a.order - b.order);
  const ungrouped = lessonsIn(UNGROUPED);
  const selectedLesson = lessons.find((l) => l.id === selectedId) ?? null;
  const hasLessons = lessons.length > 0;

  // Drag a lesson onto a section (or the "no section" zone) to move it there.
  // Reordering WITHIN a section stays on the up/down arrows.
  async function handleDragEnd(e: DragEndEvent) {
    const lessonId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    const lesson = lessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    const target = overId === UNGROUPED ? null : overId;
    const current = containerOf(lesson) === UNGROUPED ? null : containerOf(lesson);
    if (current === target) return;
    // Append to the end of the target container.
    const maxOrder = lessons.reduce((m, l) => Math.max(m, l.order), 0);
    // Optimistic update so the row jumps immediately.
    setLessons((prev) =>
      prev.map((l) =>
        l.id === lessonId ? { ...l, sectionId: target, order: maxOrder + 1 } : l,
      ),
    );
    setSelectedId(lessonId);
    const res = await fetch(`${apiBase}/lessons/${lessonId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionId: target, order: maxOrder + 1 }),
    });
    if (!res.ok) toast.error("Couldn't move the lesson");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/sa/${subAccountId}/community/${groupId}/classroom`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Classroom
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="h-4 w-4" /> Course settings
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={deleteCourse}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">{course.title}</h1>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        {/* Left — outline (drag a lesson onto a section to move it) */}
        <aside className="space-y-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            {sections.map((section) => (
              <SectionBlock
                key={section.id}
                apiBase={apiBase}
                section={section}
                lessons={lessonsIn(section.id)}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onAddLesson={() => addLesson(section.id)}
              />
            ))}

            {(ungrouped.length > 0 || sections.length > 0) && (
              <DropZone id={UNGROUPED}>
                {sections.length > 0 && (
                  <p className="px-1 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Other lessons
                  </p>
                )}
                {ungrouped.map((l, i) => (
                  <LessonNavRow
                    key={l.id}
                    apiBase={apiBase}
                    lesson={l}
                    siblings={ungrouped}
                    index={i}
                    selected={selectedId === l.id}
                    onSelect={() => setSelectedId(l.id)}
                  />
                ))}
                {ungrouped.length === 0 && (
                  <p className="px-1 py-2 text-xs text-muted-foreground">
                    Drop a lesson here to remove it from its section.
                  </p>
                )}
              </DropZone>
            )}
          </DndContext>

          <div className="flex flex-col gap-1 pt-1">
            <Button size="sm" variant="outline" onClick={addSection}>
              <Plus className="h-4 w-4" /> Section
            </Button>
            <Button size="sm" variant="ghost" onClick={() => addLesson(null)}>
              <Plus className="h-4 w-4" /> Lesson (no section)
            </Button>
          </div>
        </aside>

        {/* Right — editor / empty state */}
        <div>
          {selectedLesson ? (
            <LessonEditor
              key={selectedLesson.id}
              apiBase={apiBase}
              saId={subAccountId}
              groupId={groupId}
              lesson={selectedLesson}
              onDeleted={() => setSelectedId(null)}
            />
          ) : (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-center">
              <GraduationCap className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {hasLessons
                  ? "Select a lesson to edit."
                  : "No lessons yet. Create your first lesson to get started."}
              </p>
              {!hasLessons && (
                <Button onClick={() => addLesson(sections[0]?.id ?? null)}>
                  <Plus className="h-4 w-4" /> Add first lesson
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <CourseSettingsModal
        mode="edit"
        saId={subAccountId}
        groupId={groupId}
        course={course}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSaved={() => {}}
      />
    </div>
  );
}

/** A droppable container that highlights while a lesson hovers over it. */
function DropZone({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border bg-card p-2 transition-colors",
        isOver && "border-primary ring-1 ring-primary",
      )}
    >
      {children}
    </div>
  );
}

function SectionBlock({
  apiBase,
  section,
  lessons,
  selectedId,
  onSelect,
  onAddLesson,
}: {
  apiBase: string;
  section: CourseSection;
  lessons: Lesson[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddLesson: () => void;
}) {
  const [title, setTitle] = useState(section.title);
  const { setNodeRef, isOver } = useDroppable({ id: section.id });

  async function rename() {
    if (title.trim() === section.title) return;
    await fetch(`${apiBase}/sections/${section.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }
  async function remove() {
    if (!confirm("Delete this section? Its lessons move to 'Other'.")) return;
    await fetch(`${apiBase}/sections/${section.id}`, { method: "DELETE" });
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border bg-card p-2 transition-colors",
        isOver && "border-primary ring-1 ring-primary",
      )}
    >
      <div className="mb-1 flex items-center gap-1">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={rename}
          className="h-7 border-0 bg-transparent px-1 text-xs font-semibold uppercase tracking-wide focus-visible:ring-1"
        />
        <button
          onClick={remove}
          className="text-muted-foreground hover:text-destructive"
          title="Delete section"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {lessons.map((l, i) => (
        <LessonNavRow
          key={l.id}
          apiBase={apiBase}
          lesson={l}
          siblings={lessons}
          index={i}
          selected={selectedId === l.id}
          onSelect={() => onSelect(l.id)}
        />
      ))}
      <button
        onClick={onAddLesson}
        className="mt-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" /> Lesson
      </button>
    </div>
  );
}

function LessonNavRow({
  apiBase,
  lesson,
  siblings,
  index,
  selected,
  onSelect,
}: {
  apiBase: string;
  lesson: Lesson;
  siblings: Lesson[];
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: lesson.id });
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : undefined;

  async function move(dir: -1 | 1) {
    const other = siblings[index + dir];
    if (!other) return;
    await Promise.all([
      fetch(`${apiBase}/lessons/${lesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: other.order }),
      }),
      fetch(`${apiBase}/lessons/${other.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: lesson.order }),
      }),
    ]);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-1 rounded-md px-1",
        selected && "bg-primary/10",
        isDragging && "opacity-50",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
        title="Drag to a section"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="flex flex-col opacity-0 group-hover:opacity-100">
        <button
          onClick={() => move(-1)}
          disabled={index === 0}
          className="text-muted-foreground disabled:opacity-30"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          onClick={() => move(1)}
          disabled={index === siblings.length - 1}
          className="text-muted-foreground disabled:opacity-30"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      <button
        onClick={onSelect}
        className={cn(
          "flex-1 truncate py-1.5 text-left text-sm",
          selected ? "font-medium text-primary" : "text-foreground",
        )}
      >
        {lesson.title}
        {!lesson.published && (
          <span className="ml-1.5 text-xs text-muted-foreground">(draft)</span>
        )}
      </button>
    </div>
  );
}

function LessonEditor({
  apiBase,
  saId,
  groupId,
  lesson,
  onDeleted,
}: {
  apiBase: string;
  saId: string;
  groupId: string;
  lesson: Lesson;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(lesson.title);
  const [videoUrl, setVideoUrl] = useState(lesson.videoUrl ?? "");
  const [body, setBody] = useState(lesson.bodyHtml);
  const [published, setPublished] = useState(lesson.published);
  const [links, setLinks] = useState<ResourceLink[]>(lesson.resourceLinks ?? []);
  const [saving, setSaving] = useState(false);

  const parsed = videoUrl.trim() ? parseVideoUrl(videoUrl) : null;
  const videoValid = !videoUrl.trim() || parsed !== null;

  async function save() {
    if (!videoValid) {
      toast.error("Paste a valid YouTube or Vimeo URL");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/lessons/${lesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          videoUrl: videoUrl.trim() || null,
          bodyHtml: body,
          published,
          resourceLinks: links.filter((l) => l.url.trim()),
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Couldn't save");
      }
      toast.success("Lesson saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!confirm("Delete this lesson?")) return;
    await fetch(`${apiBase}/lessons/${lesson.id}`, { method: "DELETE" });
    onDeleted();
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <GraduationCap className="h-4 w-4" /> Lesson
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={remove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Video URL (YouTube or Vimeo)</Label>
        <Input
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=…"
        />
        {!videoValid && (
          <p className="text-xs text-destructive">
            Not a recognized YouTube or Vimeo link.
          </p>
        )}
        {parsed && (
          <div className="aspect-video w-full max-w-md overflow-hidden rounded-lg border bg-black">
            <iframe
              src={parsed.embedUrl}
              title="preview"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Lesson text</Label>
        <RichTextEditor
          value={body}
          onChange={setBody}
          saId={saId}
          groupId={groupId}
        />
      </div>

      <ResourceLinksEditor links={links} onChange={setLinks} />

      <div className="flex items-center justify-between border-t pt-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            className="h-4 w-4"
          />
          Published
        </label>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Save lesson
        </Button>
      </div>
    </div>
  );
}

function ResourceLinksEditor({
  links,
  onChange,
}: {
  links: ResourceLink[];
  onChange: (l: ResourceLink[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Resource links</Label>
      {links.map((l, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={l.label}
            placeholder="Label"
            onChange={(e) => {
              const next = [...links];
              next[i] = { ...next[i], label: e.target.value };
              onChange(next);
            }}
            className="h-8 w-1/3"
          />
          <Input
            value={l.url}
            placeholder="https://…"
            onChange={(e) => {
              const next = [...links];
              next[i] = { ...next[i], url: e.target.value };
              onChange(next);
            }}
            className="h-8 flex-1"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange(links.filter((_, j) => j !== i))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onChange([...links, { label: "", url: "" }])}
      >
        <Plus className="h-4 w-4" /> Add link
      </Button>
    </div>
  );
}
