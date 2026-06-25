"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Contact } from "@/types/contacts";

/**
 * Modal contact picker. The field on the form is a clickable button
 * showing the currently-selected contact. Clicking opens a Dialog with
 * a search input + filtered, A-Z-sorted list — same pattern as a
 * command palette / GHL's recipient picker.
 *
 * Filter: case-insensitive substring on name / email / phone. Typing
 * "andr" surfaces every contact whose name OR email contains "andr".
 *
 * Keyboard: ↑/↓ walks the list, Enter picks the highlighted row, Esc
 * closes without changing the selection.
 */

interface ContactPickerProps {
  contacts: Contact[];
  value: string;
  onChange: (contactId: string) => void;
  id?: string;
  placeholder?: string;
  /** Dialog heading. Defaults to "Pick a recipient" (the Quotes wording). */
  title?: string;
  /**
   * Optional per-contact territory label. When provided and it returns a
   * truthy string, each row shows a small territory chip. Callers pass this
   * only when territory scoping is on (it stays hidden otherwise).
   */
  territoryLabel?: (contact: Contact) => string | null | undefined;
}

function displayName(c: Contact): string {
  return c.name || c.email || c.phone || "(unnamed contact)";
}

function subtitle(c: Contact): string {
  // Show the secondary identifier so duplicate names can be told apart.
  if (c.name && c.email) return c.email;
  if (c.name && c.phone) return c.phone;
  if (c.email && c.phone) return c.phone;
  return "";
}

export function ContactPicker({
  contacts,
  value,
  onChange,
  id,
  placeholder = "Pick a contact…",
  title = "Pick a recipient",
  territoryLabel,
}: ContactPickerProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => contacts.find((c) => c.id === value) ?? null,
    [contacts, value],
  );

  function handlePick(contactId: string) {
    onChange(contactId);
    setOpen(false);
  }

  return (
    <>
      <button
        id={id}
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {selected ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate font-medium">{displayName(selected)}</span>
            {subtitle(selected) && (
              <span className="truncate text-[11px] text-muted-foreground">
                · {subtitle(selected)}
              </span>
            )}
          </span>
        ) : (
          <span className="truncate text-muted-foreground">{placeholder}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      <ContactPickerDialog
        open={open}
        onOpenChange={setOpen}
        contacts={contacts}
        value={value}
        onPick={handlePick}
        title={title}
        territoryLabel={territoryLabel}
      />
    </>
  );
}

function ContactPickerDialog({
  open,
  onOpenChange,
  contacts,
  value,
  onPick,
  title,
  territoryLabel,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  contacts: Contact[];
  value: string;
  onPick: (id: string) => void;
  title: string;
  territoryLabel?: (contact: Contact) => string | null | undefined;
}) {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  // Reset query + highlight every time the modal opens. Autofocus the
  // search input so the operator can type immediately.
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlighted(0);
      // Defer focus so it lands after the Dialog's own focus management.
      const t = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const sorted = useMemo(
    () =>
      [...contacts].sort((a, b) =>
        displayName(a).localeCompare(displayName(b), undefined, {
          sensitivity: "base",
        }),
      ),
    [contacts],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return sorted;
    return sorted.filter((c) => {
      const name = (c.name ?? "").toLowerCase();
      const email = (c.email ?? "").toLowerCase();
      const phone = (c.phone ?? "").toLowerCase();
      return name.includes(term) || email.includes(term) || phone.includes(term);
    });
  }, [sorted, query]);

  // Clamp highlighted into the filtered range as the list narrows.
  useEffect(() => {
    if (highlighted >= filtered.length) {
      setHighlighted(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, highlighted]);

  // Keep the highlighted row in view when arrow-key nav scrolls past
  // the visible window.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const child = listRef.current.children[highlighted] as HTMLElement | undefined;
    child?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && filtered[highlighted]) {
      e.preventDefault();
      onPick(filtered[highlighted].id);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Search by name, email, or phone. {sorted.length} contact
            {sorted.length === 1 ? "" : "s"} in this sub-account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded
              aria-controls={listboxId}
              aria-autocomplete="list"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlighted(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type to filter…"
              autoComplete="off"
              spellCheck={false}
              className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
              <Users className="h-5 w-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                No contacts match &ldquo;{query.trim()}&rdquo;.
              </p>
            </div>
          ) : (
            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              className="max-h-80 overflow-y-auto rounded-lg border"
            >
              {filtered.map((c, i) => {
                const isHighlighted = i === highlighted;
                const isSelected = c.id === value;
                const name = displayName(c);
                const sub = subtitle(c);
                const terr = territoryLabel?.(c);
                return (
                  <li
                    key={c.id}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      // Prevent input blur from racing the click.
                      e.preventDefault();
                      onPick(c.id);
                    }}
                    onMouseEnter={() => setHighlighted(i)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-3 border-b px-3 py-2 text-sm last:border-0",
                      isHighlighted && "bg-muted",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{name}</p>
                      {sub && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {sub}
                        </p>
                      )}
                    </div>
                    {terr && (
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {terr}
                      </span>
                    )}
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-[11px] text-muted-foreground">
            ↑ ↓ to navigate · Enter to pick · Esc to close
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
