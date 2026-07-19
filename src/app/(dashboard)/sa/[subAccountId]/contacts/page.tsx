"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Download,
  Mail,
  PhoneOutgoing,
  Search,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { subscribeToTerritories } from "@/lib/firestore/territories";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import { serializeCsv, downloadCsv } from "@/lib/csv";
import { toDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContactsTable } from "@/components/contacts/contacts-table";
import { AddContactModal } from "@/components/contacts/add-contact-modal";
import { ImportContactsDialog } from "@/components/contacts/import-contacts-dialog";
import { BulkEmailDialog } from "@/components/contacts/bulk-email-dialog";
import { BulkCallDialog } from "@/components/contacts/bulk-call-dialog";
import type { Contact } from "@/types/contacts";
import type { TerritoryDoc } from "@/types";

/**
 * Reads ?import=1 from the URL, opens the import dialog, then strips the
 * param so closing the dialog doesn't get fought by the next render.
 *
 * Lifted into its own component so we can wrap it in <Suspense> —
 * useSearchParams() bails out of static rendering otherwise.
 */
function ImportQueryWatcher({ onOpen }: { onOpen: () => void }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (searchParams.get("import") !== "1") return;
    onOpen();
    // Replace the URL without the import param so this effect doesn't
    // re-open the dialog every time the user closes it.
    const next = new URLSearchParams(searchParams);
    next.delete("import");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [searchParams, pathname, router, onOpen]);
  return null;
}

export default function ContactsPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, subAccount } = useSubAccount();
  const scopingOn = subAccount?.territoryScopingEnabled === true;
  const { ready: filterReady, filter: territoryFilter } =
    useEffectiveTerritoryFilter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [territories, setTerritories] = useState<TerritoryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [bulkCallOpen, setBulkCallOpen] = useState(false);
  const outboundVoiceOn = subAccount?.outboundVoiceEnabledByAgency === true;
  const openImport = useCallback(() => setImportOpen(true), []);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    if (!filterReady) return;
    setLoading(true);
    const unsub = subscribeToContacts(
      { agencyId, subAccountId },
      { territoryFilter },
      (list) => {
        setContacts(list);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user, agencyId, subAccountId, authLoading, filterReady, territoryFilter]);

  useEffect(() => {
    if (!scopingOn || !subAccountId) {
      setTerritories([]);
      return;
    }
    const unsub = subscribeToTerritories(subAccountId, (list) =>
      setTerritories(list)
    );
    return () => unsub();
  }, [scopingOn, subAccountId]);

  function handleExport() {
    if (contacts.length === 0) {
      toast.error("No contacts to export.");
      return;
    }
    const headers = [
      "name",
      "email",
      "phone",
      "company",
      "source",
      "tags",
      "pipelineStage",
      "createdAt",
    ];
    const rows = contacts.map((c) => ({
      name: c.name,
      email: c.email,
      phone: c.phone,
      company: c.company,
      source: c.source,
      tags: c.tags ?? [],
      pipelineStage: c.pipelineStage ?? "",
      createdAt: toDate(c.createdAt)?.toISOString() ?? "",
    }));
    const csv = serializeCsv(headers, rows);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`agentstack-contacts-${stamp}.csv`, csv);
    toast.success(`Exported ${rows.length} contacts`);
  }

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <ImportQueryWatcher onOpen={openImport} />
      </Suspense>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">People</h1>
          <p className="text-muted-foreground text-sm">
            Everyone in your pipeline, in one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setBulkEmailOpen(true)}
            disabled={contacts.length === 0}
          >
            <Mail className="mr-1 h-4 w-4" />
            Send bulk email
          </Button>
          {outboundVoiceOn && (
            <Button
              variant="outline"
              onClick={() => setBulkCallOpen(true)}
              disabled={contacts.length === 0}
            >
              <PhoneOutgoing className="mr-1 h-4 w-4" />
              Bulk AI call
            </Button>
          )}
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1 h-4 w-4" />
            Import CSV
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={contacts.length === 0}
          >
            <Download className="mr-1 h-4 w-4" />
            Export
          </Button>
          <AddContactModal />
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or company"
          className="pl-8"
        />
      </div>

      {loading ? (
        <TableSkeleton />
      ) : contacts.length === 0 ? (
        <EmptyState onImport={() => setImportOpen(true)} />
      ) : (
        <ContactsTable
          contacts={contacts}
          search={search}
          territories={territories}
        />
      )}

      <ImportContactsDialog open={importOpen} onOpenChange={setImportOpen} />
      <BulkEmailDialog
        open={bulkEmailOpen}
        onOpenChange={setBulkEmailOpen}
        contacts={contacts}
      />
      {outboundVoiceOn && (
        <BulkCallDialog
          open={bulkCallOpen}
          onOpenChange={setBulkCallOpen}
          contacts={contacts}
        />
      )}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="bg-card overflow-hidden rounded-xl border">
      <div className="bg-muted/40 border-b px-4 py-3">
        <div className="bg-muted h-3 w-24 animate-pulse rounded" />
      </div>
      <div className="divide-y">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <div className="bg-muted h-4 w-40 animate-pulse rounded" />
            <div className="bg-muted h-4 w-48 animate-pulse rounded" />
            <div className="bg-muted ml-auto h-5 w-16 animate-pulse rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="bg-card/50 rounded-xl border border-dashed p-12 text-center">
      <div className="bg-primary/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
        <Users className="text-primary h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold">No contacts yet</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        Add your first lead or import a CSV from your old CRM.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <AddContactModal />
        <Button variant="outline" onClick={onImport}>
          <Upload className="mr-1 h-4 w-4" />
          Import CSV
        </Button>
      </div>
    </div>
  );
}
