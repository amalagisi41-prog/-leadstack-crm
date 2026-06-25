"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const PRESETS = [
  "Price / budget",
  "Timing",
  "Chose a competitor",
  "No response",
  "Not a fit",
];

interface LostReasonDialogProps {
  open: boolean;
  dealTitle?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}

export function LostReasonDialog({
  open,
  dealTitle,
  onCancel,
  onConfirm,
}: LostReasonDialogProps) {
  const [preset, setPreset] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPreset(null);
      setNote("");
      setSaving(false);
    }
  }, [open]);

  async function handleConfirm() {
    const reason = [preset, note.trim()].filter(Boolean).join(" — ");
    setSaving(true);
    try {
      await onConfirm(reason);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark deal as Lost</DialogTitle>
          <DialogDescription>
            {dealTitle
              ? `Why did "${dealTitle}" fall through?`
              : "Why did this deal fall through?"}{" "}
            Reason is optional but helpful for your win/loss reporting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(preset === p ? null : p)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  preset === p
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lost-note">Notes</Label>
            <Textarea
              id="lost-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional — any context that will help later."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? "Saving…" : "Mark as Lost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
