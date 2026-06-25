"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Mail,
  Phone,
  Building2,
  Pencil,
  Tag,
  ArrowLeft,
  CircleDot,
  MapPinned,
  MessageSquare,
  PhoneOutgoing,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SourceBadge } from "@/components/contacts/source-badge";
import { LinkContactButton } from "@/components/contacts/link-contact-button";
import { ContactForm } from "@/components/contacts/contact-form";
import { SendEmailDialog } from "@/components/contacts/send-email-dialog";
import { SendSmsDialog } from "@/components/contacts/send-sms-dialog";
import { SendCallDialog } from "@/components/contacts/send-call-dialog";
import { subscribeToTerritories } from "@/lib/firestore/territories";
import { formatContactDate } from "@/lib/format";
import { useSubAccount } from "@/context/sub-account-context";
import type { Contact, ContactFormData } from "@/types/contacts";
import type { TerritoryDoc } from "@/types";

interface ContactBlocker {
  type: string;
  /** Singular noun; pluralized in the UI by appending "s". */
  label: string;
  count: number;
}

export function ContactProfileHeader({ contact }: { contact: Contact }) {
  const { saPath, subAccount, subAccountId, isAdmin } = useSubAccount();
  const scopingOn = subAccount?.territoryScopingEnabled === true;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  // Show the AI-call button only where the agency has enabled outbound
  // voice. Remaining gates (channel toggle, provisioning, compliance)
  // surface as errors inside the dialog.
  const outboundAvailable = subAccount?.outboundVoiceEnabledByAgency === true;
  // Manual Google review request — only shown once the sub-account has a
  // review link configured (Settings → Google reviews).
  const reviewConfigured = !!subAccount?.googleReviewConfig?.reviewUrl;
  const [reviewSending, setReviewSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteState, setDeleteState] = useState<
    | { phase: "checking" }
    | { phase: "blocked"; blockers: ContactBlocker[] }
    | { phase: "confirm" }
  >({ phase: "checking" });
  const [territories, setTerritories] = useState<TerritoryDoc[]>([]);

  useEffect(() => {
    if (!scopingOn || !subAccountId) {
      setTerritories([]);
      return;
    }
    const unsub = subscribeToTerritories(subAccountId, (list) =>
      setTerritories(list),
    );
    return () => unsub();
  }, [scopingOn, subAccountId]);

  const territoryName = (() => {
    if (!contact.territoryId) return null;
    const match = territories.find((t) => t.id === contact.territoryId);
    if (!match) return null;
    return match.status === "archived"
      ? `${match.name} (archived)`
      : match.name;
  })();

  async function handleSave(data: ContactFormData) {
    // Territory is owned by the contact and fanned out to its
    // deals/quotes/tasks/events via a dedicated admin endpoint, so it's
    // handled separately from the plain field update. Strip it out of
    // the client-SDK write; route a change through the fan-out endpoint.
    const { territoryId, ...rest } = data;
    // Server route (not a direct Firestore write) so contact.updated fires.
    const res = await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rest),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(payload.error ?? "Couldn't update contact.");
      return;
    }

    const territoryChanged =
      scopingOn &&
      isAdmin &&
      (territoryId ?? null) !== (contact.territoryId ?? null);
    if (territoryChanged) {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/contacts/${contact.id}/territory`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ territoryId: territoryId ?? null }),
        },
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(payload.error ?? "Could not move the account's territory.");
        return;
      }
    }

    toast.success("Contact updated");
    setEditing(false);
  }

  async function handleRequestReview() {
    setReviewSending(true);
    try {
      const res = await fetch("/api/comms/review-request/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sent?: boolean;
        reason?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Couldn't send review request.");
      }
      if (data.sent) {
        toast.success("Google review request sent.");
      } else {
        toast.error(reviewSkipMessage(data.reason));
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't send review request.",
      );
    } finally {
      setReviewSending(false);
    }
  }

  const contactName = contact.name || contact.email || "this contact";

  // Open the delete modal and run the dry-run link check. If the contact is
  // linked to anything the modal explains what's blocking it; otherwise it
  // shows a final confirm.
  async function openDeleteModal() {
    setDeleteOpen(true);
    setDeleteState({ phase: "checking" });
    try {
      const res = await fetch(`/api/contacts/${contact.id}?check=1`);
      const data = (await res.json().catch(() => ({}))) as {
        deletable?: boolean;
        blockers?: ContactBlocker[];
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't check this contact's links.");
        setDeleteOpen(false);
        return;
      }
      if (data.deletable) {
        setDeleteState({ phase: "confirm" });
      } else {
        setDeleteState({ phase: "blocked", blockers: data.blockers ?? [] });
      }
    } catch {
      toast.error("Couldn't check this contact's links.");
      setDeleteOpen(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        blockers?: ContactBlocker[];
      };
      // Something got linked between the check and the delete — re-show the
      // blocked state instead of erroring out.
      if (res.status === 409) {
        setDeleting(false);
        setDeleteState({ phase: "blocked", blockers: data.blockers ?? [] });
        return;
      }
      if (!res.ok) {
        throw new Error(data.error ?? "Could not delete contact.");
      }
      toast.success(`Deleted ${contactName}.`);
      router.push(saPath("/contacts"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not delete contact.",
      );
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="space-y-6">
        <Link
          href={saPath("/contacts")}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to contacts
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
              {contact.name || "Unnamed contact"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Added {formatContactDate(contact.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEmailOpen(true)}
              disabled={!contact.email}
              title={!contact.email ? "No email on this contact" : "Send email"}
            >
              <Mail className="mr-1 h-3.5 w-3.5" />
              Email
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSmsOpen(true)}
              disabled={!contact.phone}
              title={!contact.phone ? "No phone on this contact" : "Send SMS"}
            >
              <MessageSquare className="mr-1 h-3.5 w-3.5" />
              SMS
            </Button>
            {outboundAvailable && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCallOpen(true)}
                disabled={!contact.phone}
                title={
                  !contact.phone
                    ? "No phone on this contact"
                    : "Call with AI"
                }
              >
                <PhoneOutgoing className="mr-1 h-3.5 w-3.5" />
                Call
              </Button>
            )}
            {reviewConfigured && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRequestReview}
                disabled={!contact.phone || reviewSending}
                title={
                  !contact.phone
                    ? "No phone on this contact"
                    : "Request a Google review"
                }
              >
                <Star className="mr-1 h-3.5 w-3.5" />
                Review
              </Button>
            )}
            {/* Self-gates: only renders for a Facebook/Instagram (metaUserId)
                contact, for an admin. */}
            <LinkContactButton contact={contact} />
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Edit
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={openDeleteModal}
                disabled={deleteOpen}
                className="text-destructive hover:bg-destructive/5 hover:text-destructive"
                title="Delete this contact"
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Delete
              </Button>
            )}
          </div>
        </div>

        <dl className="space-y-3 rounded-xl border bg-card p-4 text-sm">
          {contact.email && (
            <Row icon={<Mail className="h-4 w-4 text-muted-foreground" />} label="Email">
              <a
                href={`mailto:${contact.email}`}
                className="text-foreground hover:text-primary hover:underline"
              >
                {contact.email}
              </a>
            </Row>
          )}
          {contact.phone && (
            <Row icon={<Phone className="h-4 w-4 text-muted-foreground" />} label="Phone">
              <a
                href={`tel:${contact.phone}`}
                className="text-foreground hover:text-primary hover:underline"
              >
                {contact.phone}
              </a>
            </Row>
          )}
          {contact.company && (
            <Row
              icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
              label="Company"
            >
              <span className="text-foreground">{contact.company}</span>
            </Row>
          )}
          <Row
            icon={<CircleDot className="h-4 w-4 text-muted-foreground" />}
            label="Source"
          >
            <SourceBadge source={contact.source} />
          </Row>
          <Row
            icon={<Tag className="h-4 w-4 text-muted-foreground" />}
            label="Tags"
          >
            {contact.tags && contact.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {contact.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No tags</span>
            )}
          </Row>
          {scopingOn && (
            <Row
              icon={<MapPinned className="h-4 w-4 text-muted-foreground" />}
              label="Territory"
            >
              {/* No explicit territory resolves to Global — the shared floor. */}
              <Badge variant="outline">{territoryName || "Global"}</Badge>
            </Row>
          )}
        </dl>

      </div>

      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit Contact</SheetTitle>
            <SheetDescription>
              Update {contact.name || "this contact"}&apos;s details.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4 pt-0">
            <ContactForm
              initial={contact}
              submitLabel="Save Changes"
              onSubmit={handleSave}
              onCancel={() => setEditing(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <SendEmailDialog
        contact={contact}
        open={emailOpen}
        onOpenChange={setEmailOpen}
      />
      <SendSmsDialog
        contact={contact}
        open={smsOpen}
        onOpenChange={setSmsOpen}
      />
      {outboundAvailable && (
        <SendCallDialog
          contact={contact}
          open={callOpen}
          onOpenChange={setCallOpen}
        />
      )}

      <Dialog
        open={deleteOpen}
        onOpenChange={(o) => {
          if (!o && !deleting) setDeleteOpen(false);
        }}
      >
        <DialogContent>
          {deleteState.phase === "checking" && (
            <DialogHeader>
              <DialogTitle>Checking…</DialogTitle>
              <DialogDescription>
                Looking for records linked to {contactName}.
              </DialogDescription>
            </DialogHeader>
          )}

          {deleteState.phase === "blocked" && (
            <>
              <DialogHeader>
                <DialogTitle>Can&apos;t delete this contact</DialogTitle>
                <DialogDescription>
                  {contactName} is still linked to other records. Remove or
                  reassign these first, then delete the contact.
                </DialogDescription>
              </DialogHeader>
              <ul className="space-y-1.5 py-2">
                {deleteState.blockers.map((b) => (
                  <li
                    key={b.type}
                    className="flex items-center gap-2.5 text-sm"
                  >
                    <span className="inline-flex min-w-6 justify-center rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-destructive">
                      {b.count}
                    </span>
                    <span className="capitalize">
                      {b.count === 1 ? b.label : `${b.label}s`}
                    </span>
                  </li>
                ))}
              </ul>
              <DialogFooter>
                <Button onClick={() => setDeleteOpen(false)}>Got it</Button>
              </DialogFooter>
            </>
          )}

          {deleteState.phase === "confirm" && (
            <>
              <DialogHeader>
                <DialogTitle>Delete contact?</DialogTitle>
                <DialogDescription>
                  This permanently removes {contactName} along with their
                  notes and activity timeline. This can&apos;t be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmDelete}
                  disabled={deleting}
                >
                  {deleting ? "Deleting…" : "Delete contact"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function reviewSkipMessage(reason?: string): string {
  switch (reason) {
    case "opted_out":
      return "This contact has opted out of that channel.";
    case "no_phone":
      return "This contact has no phone number.";
    case "not_configured":
      return "Set up Google reviews in Settings first.";
    case "whatsapp_not_configured":
    case "whatsapp_gate_off":
      return "WhatsApp isn't fully configured for this sub-account.";
    case "no_template":
    case "template_not_approved":
      return "The WhatsApp review template isn't approved yet.";
    case "window_closed":
      return "WhatsApp's 24h window is closed — the contact hasn't messaged recently. Use it from the inbox after they reply, or switch to a template / SMS.";
    case "sms_not_configured":
      return "SMS isn't configured on this deployment.";
    default:
      return "Couldn't send the review request.";
  }
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd className="mt-0.5 min-w-0 break-words">{children}</dd>
      </div>
    </div>
  );
}
