"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import {
  ArrowLeft,
  FileText,
  Mail,
  MessageSquare,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { toDate } from "@/lib/format";
import type { MessageTemplateDoc } from "@/types";
import { WebsiteStarterTemplates } from "@/components/website-studio/website-starter-templates";

export default function TemplatesListPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, isAdmin, saPath } = useSubAccount();
  const [templates, setTemplates] = useState<MessageTemplateDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    const q = query(
      collection(getFirebaseDb(), "message_templates"),
      where("subAccountId", "==", subAccountId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as MessageTemplateDoc);
        list.sort(
          (a, b) =>
            (toDate(b.createdAt)?.getTime() ?? 0) -
            (toDate(a.createdAt)?.getTime() ?? 0)
        );
        setTemplates(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [user, agencyId, subAccountId, authLoading]);

  async function handleDelete(t: MessageTemplateDoc) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    try {
      await deleteDoc(doc(getFirebaseDb(), "message_templates", t.id));
      toast.success("Template deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <Link
          href={saPath("/broadcasts")}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to automations
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
            <p className="text-muted-foreground text-sm">
              Reusable email and SMS bodies, with merge tags resolved at
              send-time.
            </p>
          </div>
          {isAdmin && (
            <Button render={<Link href={saPath("/templates/new")} />}>
              <Plus className="mr-1 h-4 w-4" />
              New template
            </Button>
          )}
        </div>
      </div>

      <WebsiteStarterTemplates />

      <div className="border-t pt-7">
        <h2 className="text-xl font-bold tracking-tight">
          Email and SMS templates
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Reusable message content for broadcasts and automations.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-muted/30 h-16 animate-pulse rounded-xl border"
            />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li
              key={t.id}
              className="bg-card flex items-center justify-between gap-3 rounded-xl border p-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={
                    t.type === "email"
                      ? "flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : "flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400"
                  }
                >
                  {t.type === "email" ? (
                    <Mail className="h-4 w-4" />
                  ) : (
                    <MessageSquare className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0">
                  <Link
                    href={saPath(`/templates/${t.id}`)}
                    className="hover:text-primary block truncate font-medium hover:underline"
                  >
                    {t.name}
                  </Link>
                  <p className="text-muted-foreground truncate text-xs">
                    {t.type === "email" && t.subject
                      ? `Subject: ${t.subject}`
                      : t.body.slice(0, 80) + (t.body.length > 80 ? "…" : "")}
                  </p>
                </div>
              </div>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(t)}
                  className="text-destructive hover:text-destructive"
                  aria-label="Delete template"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-card/50 rounded-2xl border border-dashed p-10 text-center">
      <div className="bg-primary/10 text-primary mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl">
        <FileText className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold">No templates yet</h3>
      <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
        Create an email or SMS template to use in an automation. Tags like{" "}
        <code>{"{{contact.firstName}}"}</code> get filled in at send-time.
      </p>
    </div>
  );
}
