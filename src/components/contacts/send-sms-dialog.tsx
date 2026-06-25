"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { segmentInfo } from "@/lib/comms/sms-segments";
import { cn } from "@/lib/utils";
import type { Contact } from "@/types/contacts";

interface SendSmsDialogProps {
  contact: Contact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SendSmsDialog({
  contact,
  open,
  onOpenChange,
}: SendSmsDialogProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setBody("");
      setApiError(null);
      setErrors({});
    }
  }, [open]);

  const info = useMemo(() => segmentInfo(body), [body]);
  const remainingInSegment =
    info.segments === 0
      ? info.perSegment
      : info.perSegment * info.segments - info.length;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!body.trim()) next.body = "Message is required";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSending(true);
    setApiError(null);
    try {
      const res = await fetch("/api/comms/sms/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          body: body.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setApiError(data.error ?? "Couldn't send. Try again.");
        return;
      }
      toast.success(`SMS sent to ${contact.phone}`);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      setApiError("Network error. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !sending && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <MessageSquare className="h-4 w-4" />
            </span>
            Send SMS
          </DialogTitle>
          <DialogDescription>
            Keep it short — multi-segment messages count as more than one SMS.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sms-to">To</Label>
            <Input
              id="sms-to"
              value={contact.phone}
              disabled
              className="cursor-not-allowed text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="sms-body">
                Message <span className="text-destructive">*</span>
              </Label>
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  info.segments > 1
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground",
                )}
              >
                {info.length} chars ·{" "}
                {info.segments === 0
                  ? "0 segments"
                  : `${info.segments} segment${info.segments === 1 ? "" : "s"}`}
                {info.segments > 0 && ` · ${remainingInSegment} left`}
                {info.encoding === "UCS-2" && " · Unicode"}
              </span>
            </div>
            <Textarea
              id="sms-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hey — quick update on your order…"
              rows={5}
              aria-invalid={!!errors.body}
            />
            {errors.body && (
              <p className="text-xs text-destructive">{errors.body}</p>
            )}
          </div>

          {apiError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {apiError}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send SMS"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
