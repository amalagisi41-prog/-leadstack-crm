"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Mail, MessageSquare, Sparkles } from "lucide-react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import {
  TemplateEditor,
  type TemplateFormValues,
} from "@/components/automations/template-editor";
import { TEMPLATE_PRESETS } from "@/lib/automations/template-presets";

/**
 * Quick-start preset chips. The preset content lives in
 * `lib/automations/template-presets.ts` so server-side seeding (run on
 * sub-account creation) and this client-side "Start from a preset" UI use
 * the same source of truth.
 *
 * The icon mapping is UI-only and stays here.
 */
const PRESET_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
};

const PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  icon: typeof Mail;
  values: TemplateFormValues;
}> = TEMPLATE_PRESETS.map((p) => ({
  id: p.id,
  label: p.label,
  description: p.description,
  icon: PRESET_ICONS[p.type] ?? Mail,
  values: {
    type: p.type,
    name: p.label,
    subject: p.subject,
    body: p.body,
  },
}));

const BLANK: TemplateFormValues = {
  type: "sms",
  name: "",
  subject: "",
  body: "",
};

export default function NewTemplatePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { agencyId, subAccountId, isAdmin, saPath, loading } = useSubAccount();
  const [initial, setInitial] = useState<TemplateFormValues>(BLANK);
  // The TemplateEditor only reads `initial` once (on mount) — bumping this
  // key remounts it with the new starting values when a preset is picked.
  const [editorKey, setEditorKey] = useState(0);

  function applyPreset(values: TemplateFormValues) {
    setInitial(values);
    setEditorKey((k) => k + 1);
  }

  if (!loading && !isAdmin) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Only sub-account admins can manage templates.
        </p>
        <Button
          variant="outline"
          size="sm"
          render={<Link href={saPath("/templates")} />}
          className="mt-4"
        >
          Back
        </Button>
      </div>
    );
  }

  async function handleSubmit(values: TemplateFormValues) {
    if (!user || !agencyId) {
      throw new Error("Not signed in.");
    }
    const ref = await addDoc(
      collection(getFirebaseDb(), "message_templates"),
      {
        type: values.type,
        name: values.name,
        subject: values.type === "email" ? values.subject : null,
        body: values.body,
        agencyId,
        subAccountId,
        createdByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    );
    // Persist the doc id into the doc itself so server reads can use it
    // without a query (matches the pattern elsewhere in the codebase).
    const { updateDoc, doc } = await import("firebase/firestore");
    await updateDoc(doc(getFirebaseDb(), "message_templates", ref.id), {
      id: ref.id,
    });
    toast.success(`Template "${values.name}" created.`);
    router.push(saPath(`/templates/${ref.id}`));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href={saPath("/templates")}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to templates
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">New template</h1>
        <p className="text-sm text-muted-foreground">
          Pick a channel, write a body, and use merge tags for personalisation.
        </p>
      </div>

      <section className="rounded-2xl border bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-pink-500/5 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Start from a preset</h2>
            <p className="text-[11px] text-muted-foreground">
              One-click starting point. Edit anything below before saving.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const Icon = p.icon;
            return (
              <Button
                key={p.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyPreset(p.values)}
                title={p.description}
              >
                <Icon className="mr-1 h-3.5 w-3.5" />
                {p.label}
              </Button>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => applyPreset(BLANK)}
            className="text-muted-foreground"
            title="Start blank"
          >
            Clear
          </Button>
        </div>
      </section>

      <TemplateEditor
        key={editorKey}
        initial={initial}
        submitLabel="Create template"
        onSubmit={handleSubmit}
      />
    </div>
  );
}
