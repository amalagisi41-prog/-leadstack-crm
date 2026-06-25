"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Contact } from "@/types/contacts";
import type { WhatsappTemplateDoc } from "@/types/whatsapp-templates";

/**
 * Inline panel to send an APPROVED WhatsApp template to a contact — the
 * compliant way to message outside the 24-hour window. Lists approved
 * templates, collects values for any `manual` variables (merge-tag variables
 * auto-fill server-side from the contact), and POSTs the send.
 */
export function WhatsappTemplateSender({
  contact,
  onSent,
}: {
  contact: Contact;
  onSent?: () => void;
}) {
  const { subAccountId } = useSubAccount();
  const [templates, setTemplates] = useState<
    (WhatsappTemplateDoc & { id: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("");
  const [manualValues, setManualValues] = useState<Record<number, string>>({});
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/whatsapp-templates`,
      );
      const data = (await res.json().catch(() => ({}))) as {
        templates?: (WhatsappTemplateDoc & { id: string })[];
      };
      const approved = (data.templates ?? []).filter(
        (t) => t.status === "approved",
      );
      setTemplates(approved);
    } catch {
      toast.error("Couldn't load templates.");
    } finally {
      setLoading(false);
    }
  }, [subAccountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = templates.find((t) => t.id === selectedId) ?? null;
  const manualVars = selected?.variables.filter((v) => v.source === "manual") ?? [];

  async function handleSend() {
    if (!selected) return;
    // Require every manual variable to be filled.
    for (const v of manualVars) {
      if (!(manualValues[v.position] ?? "").trim()) {
        toast.error(`Fill in "${v.label}".`);
        return;
      }
    }
    setSending(true);
    try {
      const res = await fetch("/api/comms/whatsapp/send-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          templateId: selected.id,
          manualValues: Object.fromEntries(
            Object.entries(manualValues).map(([k, v]) => [k, v]),
          ),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't send.");
      toast.success("Template sent.");
      setSelectedId("");
      setManualValues({});
      onSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <p className="px-4 py-3 text-xs text-muted-foreground">Loading templates…</p>
    );
  }

  if (templates.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-muted-foreground">
        No approved templates yet. Create + submit one under AI Agents →
        WhatsApp → Templates to message outside the 24-hour window.
      </p>
    );
  }

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="space-y-1.5">
        <Label htmlFor="wa-tpl-select" className="text-xs">
          Approved template
        </Label>
        <select
          id="wa-tpl-select"
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setManualValues({});
          }}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        >
          <option value="">Select a template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.displayName}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <>
          <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
            {selected.body}
          </p>
          {manualVars.map((v) => (
            <div key={v.position} className="space-y-1">
              <Label htmlFor={`wa-var-${v.position}`} className="text-xs">
                {v.label}
              </Label>
              <Input
                id={`wa-var-${v.position}`}
                value={manualValues[v.position] ?? ""}
                onChange={(e) =>
                  setManualValues((prev) => ({
                    ...prev,
                    [v.position]: e.target.value,
                  }))
                }
                placeholder={v.sampleValue}
              />
            </div>
          ))}
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSend} disabled={sending}>
              {sending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1 h-3.5 w-3.5" />
              )}
              Send template
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
