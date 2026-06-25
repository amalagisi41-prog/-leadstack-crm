"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { QuoteList } from "@/components/quotes/quote-list";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import type { Contact } from "@/types/contacts";

/**
 * Sub-account-wide quotes list. Mounts <QuoteList> with a name-map
 * built from the contacts subscription so each row can show "ACME
 * Plumbing" rather than a contact ID.
 */
export default function QuotesPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, saPath } = useSubAccount();
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    const unsub = subscribeToContacts({ agencyId, subAccountId }, setContacts);
    return () => unsub();
  }, [user, agencyId, subAccountId, authLoading]);

  const contactNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of contacts) {
      map[c.id] = c.name || c.email || c.phone || "(unnamed contact)";
    }
    return map;
  }, [contacts]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quotes &amp; invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Send branded quotes for review or invoices for payment. Recipients
            view on a shareable link; quotes get accepted/declined, invoices
            pay via Stripe.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            render={<Link href={saPath("/quotes/new")} />}
          >
            <FileText className="h-4 w-4" />
            New quote
          </Button>
          <Button render={<Link href={saPath("/quotes/new?kind=invoice")} />}>
            <Receipt className="h-4 w-4" />
            New invoice
          </Button>
        </div>
      </div>

      <QuoteList
        scope={{ agencyId: agencyId ?? "", subAccountId }}
        contactNames={contactNames}
      />
    </div>
  );
}
