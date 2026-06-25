"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addNote } from "@/lib/firestore/contacts";
import { useAuth } from "@/hooks/use-auth";

export function AddNoteInput({ contactId }: { contactId: string }) {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || !user) return;

    setSaving(true);
    try {
      await addNote(contactId, trimmed, user.uid);
      setContent("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Pencil className="h-4 w-4 text-muted-foreground" />
        Add a note
      </div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Call recap, next steps, anything worth remembering…"
        className="min-h-20"
      />
      <div className="mt-2 flex justify-end">
        <Button type="submit" size="sm" disabled={saving || !content.trim()}>
          {saving ? "Saving…" : "Save Note"}
        </Button>
      </div>
    </form>
  );
}
