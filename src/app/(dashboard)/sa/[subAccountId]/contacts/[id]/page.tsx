"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { UserX } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContact } from "@/lib/firestore/contacts";
import { Button } from "@/components/ui/button";
import { ContactProfileHeader } from "@/components/contacts/contact-profile-header";
import { ContactDeals } from "@/components/contacts/contact-deals";
import { ContactQuotes } from "@/components/contacts/contact-quotes";
import { ContactTasks } from "@/components/contacts/contact-tasks";
import { ContactMessagesThread } from "@/components/contacts/contact-messages-thread";
import { ContactWhatsappThread } from "@/components/contacts/contact-whatsapp-thread";
import { ActivityTimeline } from "@/components/contacts/activity-timeline";
import { AddNoteInput } from "@/components/contacts/add-note-input";
import type { Contact } from "@/types/contacts";

export default function ContactProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user, loading: authLoading } = useAuth();
  const { subAccount, subAccountId, agencyId } = useSubAccount();
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user || !id) return;
    setLoading(true);
    const unsub = subscribeToContact(id, (c) => {
      setContact(c);
      setLoading(false);
    });
    return () => unsub();
  }, [id, user, authLoading]);

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!contact) {
    return <NotFound />;
  }

  // Messages thread is opt-in per sub-account. Only render when the
  // dedicated Twilio config is enabled — shared-mode deployments see no
  // change to the contact profile.
  const showMessages = !!subAccount?.twilioConfig?.enabled;
  // WhatsApp thread renders when the sub-account has a WhatsApp sender AND the
  // agency gate is on — mirrors the channel's own gating.
  const showWhatsapp =
    !!subAccount?.twilioConfig?.whatsappFromNumber &&
    subAccount?.whatsappEnabledByAgency === true;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="space-y-6">
        <ContactProfileHeader contact={contact} />
        <ContactDeals contact={contact} />
        <ContactQuotes
          contactId={contact.id}
          scope={{ agencyId: agencyId ?? "", subAccountId }}
        />
        <ContactTasks contact={contact} />
        {showMessages && <ContactMessagesThread contact={contact} />}
        {showWhatsapp && <ContactWhatsappThread contact={contact} />}
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Activity</h2>
          <p className="text-sm text-muted-foreground">
            Notes and pipeline events for this contact.
          </p>
        </div>
        <AddNoteInput contactId={contact.id} />
        <ActivityTimeline contactId={contact.id} />
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="space-y-4">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-40 w-full animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="space-y-4">
        <div className="h-32 w-full animate-pulse rounded-xl bg-muted" />
        <div className="h-24 w-full animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}

function NotFound() {
  const { saPath } = useSubAccount();
  return (
    <div className="mx-auto max-w-md rounded-xl border border-dashed bg-card/50 p-12 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <UserX className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">Contact not found</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        This contact may have been deleted or you don&apos;t have access.
      </p>
      <Button render={<Link href={saPath("/contacts")} />} className="mt-6">
        Back to contacts
      </Button>
    </div>
  );
}
