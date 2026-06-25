"use client";

import { useRef, useState, type FormEvent } from "react";
import { Mail, MessageSquare, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SUPPORTED_TAGS_EMAIL,
  SUPPORTED_TAGS_SMS,
  validateEmailBody,
  validateNoBookingTags,
} from "@/lib/automations/merge-tags";
import type { StepChannel } from "@/types";

export interface TemplateFormValues {
  type: StepChannel;
  name: string;
  subject: string;
  body: string;
}

interface TemplateEditorProps {
  initial: TemplateFormValues;
  /** When true, the type can't be changed (editing an existing template). */
  lockType?: boolean;
  submitLabel: string;
  onSubmit: (values: TemplateFormValues) => Promise<void>;
}

export function TemplateEditor({
  initial,
  lockType = false,
  submitLabel,
  onSubmit,
}: TemplateEditorProps) {
  const [type, setType] = useState<StepChannel>(initial.type);
  const [name, setName] = useState(initial.name);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const supportedTags =
    type === "email" ? SUPPORTED_TAGS_EMAIL : SUPPORTED_TAGS_SMS;

  function insertTag(tag: string) {
    const ta = bodyRef.current;
    const inserted = `{{${tag}}}`;
    if (!ta) {
      setBody((b) => b + inserted);
      return;
    }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = body.slice(0, start) + inserted + body.slice(end);
    setBody(next);
    // Restore caret after the inserted tag on next paint.
    requestAnimationFrame(() => {
      ta.focus();
      const caret = start + inserted.length;
      ta.setSelectionRange(caret, caret);
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedBody = body.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (!trimmedBody) {
      setError("Body is required.");
      return;
    }
    const bookingErr = validateNoBookingTags(trimmedBody);
    if (bookingErr) {
      setError(bookingErr);
      return;
    }
    if (type === "email") {
      const trimmedSubject = subject.trim();
      if (!trimmedSubject) {
        setError("Email templates need a subject line.");
        return;
      }
      const optOutErr = validateEmailBody(trimmedBody);
      if (optOutErr) {
        setError(optOutErr);
        return;
      }
    }

    setSubmitting(true);
    try {
      await onSubmit({
        type,
        name: trimmedName,
        subject: type === "email" ? subject.trim() : "",
        body: trimmedBody,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-2xl border bg-card p-5"
    >
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Channel
        </Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => !lockType && setType("email")}
            disabled={lockType}
            className={
              type === "email"
                ? "flex flex-1 items-center gap-2 rounded-lg border border-primary bg-primary/10 px-3 py-2 text-sm text-primary"
                : "flex flex-1 items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            }
          >
            <Mail className="h-4 w-4" />
            Email
          </button>
          <button
            type="button"
            onClick={() => !lockType && setType("sms")}
            disabled={lockType}
            className={
              type === "sms"
                ? "flex flex-1 items-center gap-2 rounded-lg border border-primary bg-primary/10 px-3 py-2 text-sm text-primary"
                : "flex flex-1 items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            }
          >
            <MessageSquare className="h-4 w-4" />
            SMS
          </button>
        </div>
        {lockType && (
          <p className="text-[11px] text-muted-foreground">
            Channel can&apos;t be changed once created. Make a new template
            for the other channel.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="template-name">Name</Label>
        <Input
          id="template-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Welcome SMS"
        />
        <p className="text-[11px] text-muted-foreground">
          Internal label only — shown in the automation picker.
        </p>
      </div>

      {type === "email" && (
        <div className="space-y-1.5">
          <Label htmlFor="template-subject">Subject</Label>
          <Input
            id="template-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Thanks for reaching out, {{contact.firstName}}"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="template-body">Body</Label>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="ghost" size="sm" className="gap-1" />
              }
            >
              <Sparkles className="h-3 w-3" />
              Insert merge tag
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {supportedTags.map((t) => (
                <DropdownMenuItem
                  key={t.tag}
                  onClick={() => insertTag(t.tag)}
                  className="flex flex-col items-start gap-0.5"
                >
                  <code className="text-xs">{`{{${t.tag}}}`}</code>
                  <span className="text-[10px] text-muted-foreground">
                    {t.description}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Textarea
          id="template-body"
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={type === "email" ? 12 : 6}
          placeholder={
            type === "email"
              ? "Hey {{contact.firstName}},\n\nThanks for reaching out — ...\n\n{{unsubscribeLink}}"
              : "Hey {{contact.firstName}}, thanks for reaching out — quick reply when you can?"
          }
          className="font-mono text-sm"
        />
        {type === "email" && (
          <p className="text-[11px] text-muted-foreground">
            Email bodies must include <code>{"{{unsubscribeLink}}"}</code>.
            Required for compliance.
          </p>
        )}
        {type === "sms" && (
          <p className="text-[11px] text-muted-foreground">
            Keep SMS short. Include a way to opt out (&quot;reply STOP to
            unsubscribe&quot;) if your audience hasn&apos;t given prior consent.
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          <Save className="mr-1 h-3.5 w-3.5" />
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
