"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { QuoteDetail } from "@/components/quotes/quote-detail";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { getContact } from "@/lib/firestore/contacts";
import { subscribeToQuote } from "@/lib/firestore/quotes";
import type { Contact } from "@/types/contacts";
import type { Quote } from "@/types/quotes";

interface PageProps {
  params: Promise<{ subAccountId: string; id: string }>;
}

/**
 * Detail page for a single quote. Subscribes to the quote (so edits +
 * lifecycle stamps land in real-time) and one-shot fetches the linked
 * contact for display.
 *
 * Renders <QuoteDetail> in its view/edit modes — all the lifecycle
 * action logic (Send / Mark paid / Delete / Edit) lives there.
 */
export default function QuoteDetailPage({ params }: PageProps) {
  const { id: quoteId } = use(params);
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, saPath } = useSubAccount();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [contact, setContact] = useState<Contact | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    setLoadingQuote(true);
    const unsub = subscribeToQuote(quoteId, (q) => {
      setQuote(q);
      setLoadingQuote(false);
    });
    return () => unsub();
  }, [quoteId, user, authLoading]);

  useEffect(() => {
    if (!quote?.contactId) return;
    let cancelled = false;
    getContact(quote.contactId)
      .then((c) => {
        if (!cancelled) setContact(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [quote?.contactId]);

  if (loadingQuote) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Loading quote…
        </Card>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="space-y-4 p-6">
        <Button
          render={<Link href={saPath("/quotes")} />}
          variant="ghost"
          size="sm"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to quotes
        </Button>
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Quote not found. It may have been deleted.
        </Card>
      </div>
    );
  }

  const contactName = contact
    ? contact.name || contact.email || contact.phone || "(unnamed contact)"
    : "(loading…)";

  return (
    <div className="space-y-4 p-6">
      <Button
        render={<Link href={saPath("/quotes")} />}
        variant="ghost"
        size="sm"
        className="-ml-2"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to quotes
      </Button>

      <QuoteDetail
        quote={quote}
        scope={{ agencyId: agencyId ?? "", subAccountId }}
        contactName={contactName}
        listHref={saPath("/quotes")}
      />
    </div>
  );
}
