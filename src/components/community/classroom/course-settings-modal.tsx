"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/community/image-upload";
import type { Course, CourseAccess } from "@/types/community";

const SELECT =
  "h-9 w-full rounded-md border border-input bg-background text-foreground px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&>option]:bg-background [&>option]:text-foreground";

/**
 * Course details modal — create a new course or edit an existing one's
 * settings (image, title, description, access, publish). The course editor
 * itself stays focused on lessons; settings live here, Skool-style.
 */
export function CourseSettingsModal({
  mode,
  saId,
  groupId,
  course,
  open,
  onOpenChange,
  onSaved,
}: {
  mode: "create" | "edit";
  saId: string;
  groupId: string;
  course?: Course | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: (courseId: string) => void;
}) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [access, setAccess] = useState<CourseAccess>("open");
  const [requiredLevel, setRequiredLevel] = useState(2);
  const [price, setPrice] = useState("");
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);

  // Sync form from the course each time the modal opens (edit) or resets (create).
  useEffect(() => {
    if (!open) return;
    setThumbnailUrl(course?.thumbnailUrl ?? null);
    setTitle(course?.title ?? "");
    setDescription(course?.description ?? "");
    setAccess(course?.access ?? "open");
    setRequiredLevel(course?.requiredLevel ?? 2);
    setPrice(course?.priceCents != null ? (course.priceCents / 100).toString() : "");
    setPublished(course?.published ?? false);
  }, [open, course]);

  async function save() {
    if (!title.trim()) {
      toast.error("Enter a course title");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        thumbnailUrl,
        access,
        requiredLevel: access === "level" ? requiredLevel : null,
        priceCents:
          access === "purchase" && price.trim()
            ? Math.round(parseFloat(price) * 100)
            : null,
        published,
      };
      const url =
        mode === "create"
          ? `/api/sub-accounts/${saId}/community/${groupId}/courses`
          : `/api/sub-accounts/${saId}/community/${groupId}/courses/${course!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        course?: { id: string };
      };
      if (!res.ok || d.ok === false) throw new Error(d.error ?? "Couldn't save");
      const id = mode === "create" ? d.course?.id : course!.id;
      if (!id) throw new Error("Couldn't save");
      toast.success(mode === "create" ? "Course created." : "Course saved.");
      onOpenChange(false);
      onSaved(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New course" : "Course settings"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <ImageUpload
            label="Course image"
            hint="Shown on the course card in the classroom. 16:9 works best."
            value={thumbnailUrl}
            onChange={setThumbnailUrl}
            onUploadingChange={setImgUploading}
            saId={saId}
            groupId={groupId}
            kind="course"
            aspect="video"
          />
          <div className="space-y-1.5">
            <Label htmlFor="m-title">Course title</Label>
            <Input
              id="m-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-desc">Description</Label>
            <Textarea
              id="m-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="m-access">Access</Label>
              <select
                id="m-access"
                className={SELECT}
                value={access}
                onChange={(e) => setAccess(e.target.value as CourseAccess)}
              >
                <option value="open">Open to all members</option>
                <option value="level">Level-locked</option>
                <option value="purchase">One-time purchase</option>
              </select>
            </div>
            {access === "level" && (
              <div className="space-y-1.5">
                <Label htmlFor="m-level">Required level</Label>
                <select
                  id="m-level"
                  className={SELECT}
                  value={requiredLevel}
                  onChange={(e) => setRequiredLevel(Number(e.target.value))}
                >
                  {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <option key={n} value={n}>
                      Level {n}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {access === "purchase" && (
              <div className="space-y-1.5">
                <Label htmlFor="m-price">Price</Label>
                <Input
                  id="m-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="49.00"
                  className="w-28"
                />
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="h-4 w-4"
            />
            Published (visible to members)
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || imgUploading}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            {imgUploading
              ? "Uploading image…"
              : mode === "create"
                ? "Create course"
                : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
