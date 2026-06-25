"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  ExternalLink,
  Pencil,
  Copy,
  Trash2,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToForms, createForm, deleteForm } from "@/lib/firestore/forms";
import { toDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { LeadForm } from "@/types/forms";

export default function FormsPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, saPath } = useSubAccount();
  const [forms, setForms] = useState<LeadForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    setLoading(true);
    const unsub = subscribeToForms(
      { agencyId, subAccountId },
      (list) => {
        setForms(list);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [user, agencyId, subAccountId, authLoading]);

  async function handleCreate() {
    if (!user || !agencyId || !newName.trim()) return;
    setCreating(true);
    try {
      const id = await createForm(
        { agencyId, subAccountId },
        user.uid,
        newName.trim(),
      );
      toast.success("Form created");
      setCreateOpen(false);
      setNewName("");
      window.location.href = saPath(`/forms/${id}`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't create form. Try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateContact() {
    if (!user || !agencyId || creating) return;
    setCreating(true);
    try {
      const id = await createForm(
        { agencyId, subAccountId },
        user.uid,
        "Contact us",
        "contact",
      );
      toast.success("Contact form created");
      window.location.href = saPath(`/forms/${id}`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't create contact form. Try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(form: LeadForm) {
    if (!confirm(`Delete form "${form.name}"?`)) return;
    try {
      await deleteForm(form.id);
      toast.success("Form deleted");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't delete form.");
    }
  }

  function copyLink(form: LeadForm) {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    navigator.clipboard.writeText(`${origin}/f/${form.id}`);
    toast.success("Public link copied");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Forms</h1>
          <p className="text-sm text-muted-foreground">
            Public lead-capture forms. Every submission becomes a contact.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={handleCreateContact}
            disabled={creating}
          >
            <MessageSquare className="mr-1 h-4 w-4" />
            Contact form
          </Button>
          <Button onClick={() => setCreateOpen(true)} disabled={creating}>
            <Plus className="mr-1 h-4 w-4" />
            New Form
          </Button>
        </div>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : forms.length === 0 ? (
        <EmptyState
          onCreate={() => setCreateOpen(true)}
          onCreateContact={handleCreateContact}
          creating={creating}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {forms.map((form) => (
            <FormCard
              key={form.id}
              form={form}
              editHref={saPath(`/forms/${form.id}`)}
              onCopy={() => copyLink(form)}
              onDelete={() => handleDelete(form)}
            />
          ))}
        </div>
      )}

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New Form</SheetTitle>
            <SheetDescription>
              Give your form a name. You can customize fields next.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 p-4 pt-0">
            <div className="space-y-1.5">
              <Label htmlFor="form-name">Form name</Label>
              <Input
                id="form-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Contact us, Demo request, Newsletter…"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
                {creating ? "Creating…" : "Create & edit"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FormCard({
  form,
  editHref,
  onCopy,
  onDelete,
}: {
  form: LeadForm;
  editHref: string;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const created = toDate(form.createdAt);
  return (
    <div className="group flex flex-col rounded-2xl border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white">
          <FileText className="h-4 w-4" />
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            form.enabled
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {form.enabled ? "Live" : "Paused"}
        </span>
      </div>
      <h3 className="mt-3 truncate font-semibold">{form.name}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {form.fields.length} fields · {form.submissionCount ?? 0} submissions
      </p>
      {created && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Created{" "}
          {created.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <Button size="sm" render={<Link href={editHref} />}>
          <Pencil className="mr-1 h-3.5 w-3.5" />
          Edit
        </Button>
        <Button size="sm" variant="outline" onClick={onCopy}>
          <Copy className="mr-1 h-3.5 w-3.5" />
          Copy link
        </Button>
        <Button
          size="sm"
          variant="outline"
          render={<a href={`/f/${form.id}`} target="_blank" rel="noreferrer" />}
        >
          <ExternalLink className="mr-1 h-3.5 w-3.5" />
          Preview
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="ml-auto text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-2xl border bg-muted/30"
        />
      ))}
    </div>
  );
}

function EmptyState({
  onCreate,
  onCreateContact,
  creating,
}: {
  onCreate: () => void;
  onCreateContact: () => void;
  creating: boolean;
}) {
  return (
    <div className="rounded-2xl border border-dashed bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-pink-500/5 p-12 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white">
        <FileText className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold">Create your first lead form</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Drop a public form on your site. Submissions land as contacts in your
        pipeline automatically.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button
          variant="outline"
          onClick={onCreateContact}
          disabled={creating}
        >
          <MessageSquare className="mr-1 h-4 w-4" />
          Quick contact form
        </Button>
        <Button onClick={onCreate} disabled={creating}>
          <Plus className="mr-1 h-4 w-4" />
          New form
        </Button>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Quick contact form pre-fills Name, Email, Phone, and Message.
      </p>
    </div>
  );
}
