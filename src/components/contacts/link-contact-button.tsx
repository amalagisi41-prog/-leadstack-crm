"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContactPicker } from "@/components/quotes/contact-picker";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import type { Contact } from "@/types/contacts";

/**
 * "Link to existing contact" — the scoped contact-merge entry point, shown only
 * on a Facebook/Instagram contact (one carrying a `metaUserId`). A DM creates a
 * stub contact with only a Meta id; if that turns out to be someone already in
 * the CRM, an admin picks the existing contact here and the stub's
 * conversation + history + records move onto them (server-side at
 * /api/contacts/[id]/link), then the stub is removed. Self-gates to `null` when
 * not applicable, so it can be dropped into the header unconditionally.
 */
export function LinkContactButton({ contact }: { contact: Contact }) {
  const { subAccountId, agencyId, isAdmin, saPath } = useSubAccount();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [targetId, setTargetId] = useState("");
  const [linking, setLinking] = useState(false);

  const isMeta = !!contact.metaUserId;

  useEffect(() => {
    if (!open || !agencyId) return;
    const unsub = subscribeToContacts({ agencyId, subAccountId }, (list) =>
      // Can't merge into itself; drop the stub from the list.
      setContacts(list.filter((c) => c.id !== contact.id)),
    );
    return () => unsub();
  }, [open, agencyId, subAccountId, contact.id]);

  if (!isAdmin || !isMeta) return null;

  const target = contacts.find((c) => c.id === targetId) ?? null;

  async function handleLink() {
    if (!targetId) return;
    setLinking(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetContactId: targetId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        targetContactId?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Couldn't link this contact.");
      }
      toast.success("Merged into the existing contact.");
      setOpen(false);
      // The stub is gone — send the operator to the survivor.
      router.push(saPath(`/contacts/${targetId}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't link contact.");
    } finally {
      setLinking(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setTargetId("");
          setOpen(true);
        }}
        title="Link this Facebook/Instagram contact into an existing one"
      >
        <Link2 className="mr-1 h-3.5 w-3.5" />
        Link
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!linking) setOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link to an existing contact</DialogTitle>
            <DialogDescription>
              This contact came from Facebook/Instagram and has no email or
              phone. Pick the existing contact who is the same person — their
              Messenger/Instagram conversation, messages, and any linked records
              move onto that contact, and this duplicate is removed. This
              can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="py-1">
            <ContactPicker
              contacts={contacts}
              value={targetId}
              onChange={setTargetId}
              title="Pick the existing contact"
              placeholder="Choose the contact to merge into…"
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={linking}
            >
              Cancel
            </Button>
            <Button onClick={handleLink} disabled={!targetId || linking}>
              {linking ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Merging…
                </>
              ) : (
                `Merge into ${target?.name || "contact"}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
