"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import {
  TemplateEditor,
  type TemplateFormValues,
} from "@/components/automations/template-editor";
import type { MessageTemplateDoc } from "@/types";

export default function EditTemplatePage() {
  const params = useParams<{ templateId: string }>();
  const id = params.templateId;
  const { isAdmin, saPath, loading: subLoading } = useSubAccount();
  const [template, setTemplate] = useState<MessageTemplateDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      doc(getFirebaseDb(), "message_templates", id),
      (snap) => {
        if (!snap.exists()) {
          setTemplate(null);
        } else {
          setTemplate(snap.data() as MessageTemplateDoc);
        }
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [id]);

  async function handleSubmit(values: TemplateFormValues) {
    await updateDoc(doc(getFirebaseDb(), "message_templates", id), {
      name: values.name,
      subject: values.type === "email" ? values.subject : null,
      body: values.body,
      updatedAt: serverTimestamp(),
    });
    toast.success("Template saved.");
  }

  if (loading || subLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        <div className="h-72 animate-pulse rounded-2xl bg-muted/40" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-dashed bg-card/50 p-10 text-center">
        <FileText className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <h2 className="text-base font-semibold">Template not found</h2>
        <Button
          variant="outline"
          size="sm"
          render={<Link href={saPath("/templates")} />}
          className="mt-4"
        >
          Back to templates
        </Button>
      </div>
    );
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
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          {template.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {template.type === "email" ? "Email template" : "SMS template"}
        </p>
      </div>

      <TemplateEditor
        initial={{
          type: template.type,
          name: template.name,
          subject: template.subject ?? "",
          body: template.body,
        }}
        lockType
        submitLabel={isAdmin ? "Save changes" : "Read-only"}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
