"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Users,
  Briefcase,
  CheckSquare,
  CalendarCheck,
  FileText,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useOptionalSubAccount } from "@/context/sub-account-context";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { subscribeToDeals } from "@/lib/firestore/deals";
import { subscribeToTasks } from "@/lib/firestore/tasks";
import { subscribeToEvents } from "@/lib/firestore/events";
import { subscribeToForms } from "@/lib/firestore/forms";
import { toDate, formatCurrency } from "@/lib/format";
import { getStage } from "@/types/deals";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Contact } from "@/types/contacts";
import type { Deal } from "@/types/deals";
import type { Task } from "@/types/tasks";
import type { CalendarEvent } from "@/types/events";
import type { LeadForm } from "@/types/forms";

type Result =
  | {
      kind: "contact";
      id: string;
      title: string;
      subtitle: string;
      href: string;
    }
  | {
      kind: "deal";
      id: string;
      title: string;
      subtitle: string;
      href: string;
    }
  | {
      kind: "task";
      id: string;
      title: string;
      subtitle: string;
      href: string;
    }
  | {
      kind: "event";
      id: string;
      title: string;
      subtitle: string;
      href: string;
    }
  | {
      kind: "form";
      id: string;
      title: string;
      subtitle: string;
      href: string;
    };

const KIND_META: Record<Result["kind"], { label: string; icon: React.ElementType; tone: string }> = {
  contact: {
    label: "Contacts",
    icon: Users,
    tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  deal: {
    label: "Deals",
    icon: Briefcase,
    tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  task: {
    label: "Tasks",
    icon: CheckSquare,
    tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  event: {
    label: "Calendar",
    icon: CalendarCheck,
    tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  form: {
    label: "Forms",
    icon: FileText,
    tone: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  },
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { user, memberships } = useAuth();
  const subAccountCtx = useOptionalSubAccount();
  // Resolves to `{ ready: true, filter: null }` outside the
  // SubAccountProvider (e.g. agency-level pages) so the palette behaves
  // identically there. Inside /sa/ with scoping on, this is the same
  // filter every other list surface uses — without it, an unfiltered
  // contacts/deals listener trips a permission-denied because Firestore
  // rules aren't filters (see lib/firestore/territory-query.ts).
  const { ready: filterReady, filter: territoryFilter } =
    useEffectiveTerritoryFilter();
  // Active sub-account: prefer the one in the URL, otherwise fall back to
  // the user's first membership. Cmd+K is scoped to one sub-account at a
  // time per the v1 plan (cross-sub-account search is a v2 follow-up).
  const activeMembership = subAccountCtx
    ? memberships.find((m) => m.subAccountId === subAccountCtx.subAccountId)
    : memberships[0];
  const activeSubAccountId = activeMembership?.subAccountId ?? null;
  const activeAgencyId = activeMembership?.agencyId ?? null;
  const linkPrefix = activeSubAccountId ? `/sa/${activeSubAccountId}` : "";
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [forms, setForms] = useState<LeadForm[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !user || !activeAgencyId || !activeSubAccountId) return;
    // Hold off until the territory filter resolves — otherwise a scoped
    // collaborator gets a brief window where the listener runs unfiltered
    // and trips permission-denied. For everyone else (admins, owners,
    // scoping-off) `filterReady` is true on first render so there's no
    // perceptible delay.
    if (!filterReady) return;
    const scope = {
      agencyId: activeAgencyId,
      subAccountId: activeSubAccountId,
    };
    const unsubs = [
      subscribeToContacts(scope, { territoryFilter }, setContacts),
      subscribeToDeals(scope, { territoryFilter }, setDeals),
      subscribeToTasks(scope, { territoryFilter }, setTasks),
      subscribeToEvents(scope, { territoryFilter }, setEvents),
      subscribeToForms(scope, setForms),
    ];
    return () => {
      for (const u of unsubs) u();
    };
  }, [
    open,
    user,
    activeAgencyId,
    activeSubAccountId,
    filterReady,
    territoryFilter,
  ]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const contactById = useMemo(() => {
    const m = new Map<string, Contact>();
    for (const c of contacts) m.set(c.id, c);
    return m;
  }, [contacts]);

  const results: Result[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: Result[] = [];

    if (!q) {
      // Show recent items when nothing typed
      for (const c of contacts.slice(0, 4)) {
        out.push({
          kind: "contact",
          id: c.id,
          title: c.name || c.email || "Unnamed",
          subtitle: c.company || c.email || "",
          href: `${linkPrefix}/contacts/${c.id}`,
        });
      }
      for (const d of deals.slice(0, 3)) {
        const stage = getStage(d.stageId);
        const contact = contactById.get(d.contactId);
        out.push({
          kind: "deal",
          id: d.id,
          title: d.title,
          subtitle: `${stage.label} · ${formatCurrency(d.value, d.currency)}${
            contact ? ` · ${contact.name}` : ""
          }`,
          href: `${linkPrefix}/pipeline`,
        });
      }
      for (const t of tasks.filter((x) => !x.completed).slice(0, 3)) {
        const contact = t.contactId ? contactById.get(t.contactId) : null;
        out.push({
          kind: "task",
          id: t.id,
          title: t.title,
          subtitle: contact ? contact.name : "Task",
          href: `${linkPrefix}/tasks`,
        });
      }
      return out;
    }

    const match = (s: string | null | undefined) =>
      s ? s.toLowerCase().includes(q) : false;

    for (const c of contacts) {
      if (match(c.name) || match(c.email) || match(c.company)) {
        out.push({
          kind: "contact",
          id: c.id,
          title: c.name || c.email || "Unnamed",
          subtitle: [c.email, c.company].filter(Boolean).join(" · "),
          href: `${linkPrefix}/contacts/${c.id}`,
        });
      }
      if (out.filter((r) => r.kind === "contact").length >= 6) break;
    }
    for (const d of deals) {
      if (match(d.title)) {
        const stage = getStage(d.stageId);
        const contact = contactById.get(d.contactId);
        out.push({
          kind: "deal",
          id: d.id,
          title: d.title,
          subtitle: `${stage.label} · ${formatCurrency(d.value, d.currency)}${
            contact ? ` · ${contact.name}` : ""
          }`,
          href: `${linkPrefix}/pipeline`,
        });
      }
      if (out.filter((r) => r.kind === "deal").length >= 5) break;
    }
    for (const t of tasks) {
      if (match(t.title) || match(t.notes)) {
        const contact = t.contactId ? contactById.get(t.contactId) : null;
        out.push({
          kind: "task",
          id: t.id,
          title: t.title,
          subtitle: contact
            ? `${contact.name}${t.completed ? " · done" : ""}`
            : t.completed
              ? "Completed"
              : "Open task",
          href: `${linkPrefix}/tasks`,
        });
      }
      if (out.filter((r) => r.kind === "task").length >= 5) break;
    }
    for (const e of events) {
      if (match(e.title) || match(e.location) || match(e.notes)) {
        const when = toDate(e.startAt);
        out.push({
          kind: "event",
          id: e.id,
          title: e.title,
          subtitle: when
            ? when.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : "Event",
          href: `${linkPrefix}/calendar`,
        });
      }
      if (out.filter((r) => r.kind === "event").length >= 5) break;
    }
    for (const f of forms) {
      if (match(f.name)) {
        out.push({
          kind: "form",
          id: f.id,
          title: f.name,
          subtitle: `${f.fields.length} fields · ${f.submissionCount ?? 0} submissions`,
          href: `${linkPrefix}/forms/${f.id}`,
        });
      }
      if (out.filter((r) => r.kind === "form").length >= 5) break;
    }

    return out;
  }, [query, contacts, deals, tasks, events, forms, contactById, linkPrefix]);

  const grouped = useMemo(() => {
    const order: Result["kind"][] = ["contact", "deal", "task", "event", "form"];
    return order
      .map((k) => ({
        kind: k,
        items: results.filter((r) => r.kind === k),
      }))
      .filter((g) => g.items.length > 0);
  }, [results]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const flat = results;

  const activate = useCallback(
    (r: Result) => {
      router.push(r.href);
      onOpenChange(false);
    },
    [router, onOpenChange],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, flat.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = flat[activeIndex];
      if (target) activate(target);
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-idx="${activeIndex}"]`,
    );
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  let runningIdx = -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl overflow-hidden p-0">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search contacts, deals, tasks, events, forms…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground sm:inline">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {flat.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {query ? "No results." : "Start typing to search across everything."}
            </div>
          ) : (
            grouped.map((g) => {
              const meta = KIND_META[g.kind];
              const Icon = meta.icon;
              return (
                <div key={g.kind} className="mb-1">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {meta.label}
                  </div>
                  <ul>
                    {g.items.map((r) => {
                      runningIdx++;
                      const idx = runningIdx;
                      const active = idx === activeIndex;
                      return (
                        <li
                          key={`${r.kind}-${r.id}`}
                          data-idx={idx}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => activate(r)}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm",
                            active
                              ? "bg-primary/10 text-foreground"
                              : "hover:bg-muted",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                              meta.tone,
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{r.title}</p>
                            {r.subtitle && (
                              <p className="truncate text-xs text-muted-foreground">
                                {r.subtitle}
                              </p>
                            )}
                          </div>
                          {active && (
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-muted px-1 font-medium">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-muted px-1 font-medium">↵</kbd>
              open
            </span>
          </div>
          <span>
            {flat.length} result{flat.length === 1 ? "" : "s"}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
