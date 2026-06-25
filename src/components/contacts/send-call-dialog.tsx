"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, PhoneOutgoing } from "lucide-react";
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
import type { Contact } from "@/types/contacts";

interface SendCallDialogProps {
  contact: Contact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Confirm + place an outbound AI voice call to a contact. Requires the
 * operator to acknowledge consent (Phase 1 consent model). Surfaces the
 * compliance gate's machine-readable reason inline when the call is
 * blocked (opted out, outside the calling window, caps hit, etc.).
 */
export function SendCallDialog({
  contact,
  open,
  onOpenChange,
}: SendCallDialogProps) {
  const [consentAck, setConsentAck] = useState(false);
  const [calling, setCalling] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setConsentAck(false);
      setApiError(null);
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!consentAck) {
      setApiError("Confirm you have consent before placing the call.");
      return;
    }
    setCalling(true);
    setApiError(null);
    try {
      const res = await fetch("/api/comms/voice/call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, consentAck: true }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        retryAfterSec?: number | null;
      };
      if (!res.ok || !data.ok) {
        let msg = data.error ?? "Couldn't place the call. Try again.";
        if (typeof data.retryAfterSec === "number" && data.retryAfterSec > 0) {
          const mins = Math.ceil(data.retryAfterSec / 60);
          msg += ` (try again in ~${mins} min)`;
        }
        setApiError(msg);
        return;
      }
      toast.success(`Calling ${contact.phone}…`);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      setApiError("Network error. Try again.");
    } finally {
      setCalling(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !calling && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <PhoneOutgoing className="h-4 w-4" />
            </span>
            Call with AI
          </DialogTitle>
          <DialogDescription>
            The AI voice agent will call this contact and speak the configured
            opener. The call is screened by the compliance gate before it&apos;s
            placed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="call-to">To</Label>
            <Input
              id="call-to"
              value={contact.phone}
              disabled
              className="cursor-not-allowed text-muted-foreground"
            />
          </div>

          <label className="flex items-start gap-2.5 rounded-lg border bg-muted/30 p-3 text-sm">
            <input
              type="checkbox"
              checked={consentAck}
              onChange={(e) => setConsentAck(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer"
            />
            <span>
              I confirm this contact has consented to receive calls from us, and
              that calling them now complies with the rules that apply where
              they are.
            </span>
          </label>

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
              disabled={calling}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={calling || !consentAck}>
              {calling ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Placing call…
                </>
              ) : (
                "Place call"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
