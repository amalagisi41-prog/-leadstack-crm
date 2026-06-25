"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getFirebaseDb } from "@/lib/firebase/client";

interface Person {
  id: string;
  name: string;
  email: string;
}

export function TestDialog({
  saId,
  workflowId,
  open,
  onOpenChange,
}: {
  saId: string;
  workflowId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [contacts, setContacts] = useState<Person[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setContacts(null);
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(getFirebaseDb(), "contacts"),
            where("subAccountId", "==", saId),
            limit(100),
          ),
        );
        setContacts(
          snap.docs.map((d) => ({
            id: d.id,
            name: (d.data().name as string) || "Unnamed",
            email: (d.data().email as string) || "",
          })),
        );
      } catch {
        setContacts([]);
      }
    })();
  }, [open, saId]);

  async function enroll(contactId: string) {
    setBusy(contactId);
    try {
      const res = await fetch(
        `/api/sub-accounts/${saId}/workflows/${workflowId}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId }),
        },
      );
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Couldn't start test");
      toast.success("Test run started — check the Runs tab.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start test");
    } finally {
      setBusy(null);
    }
  }

  const filtered = (contacts ?? []).filter((c) => {
    const t = q.toLowerCase();
    return !t || c.name.toLowerCase().includes(t) || c.email.toLowerCase().includes(t);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Test workflow</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Pick a contact to enroll now. This runs the <strong>saved</strong>{" "}
          version immediately, even on a draft — save first if you have unsaved
          changes.
        </p>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search contacts…"
            className="pl-8"
          />
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {contacts === null ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No contacts found.
            </p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => enroll(c.id)}
                disabled={busy !== null}
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50 disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.email}
                  </span>
                </span>
                {busy === c.id && <Loader2 className="h-4 w-4 animate-spin" />}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
