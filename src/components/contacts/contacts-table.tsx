"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown, Mail, Phone, Building2 } from "lucide-react";
import type { Contact } from "@/types/contacts";
import type { TerritoryDoc } from "@/types";
import { SourceBadge } from "@/components/contacts/source-badge";
import { formatContactDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSubAccount } from "@/context/sub-account-context";

interface Props {
  contacts: Contact[];
  search: string;
  /**
   * Optional — when the sub-account has territory scoping on, the
   * page passes the active territory list so the table can render a
   * "Territory" column. Empty array (default) hides the column.
   */
  territories?: TerritoryDoc[];
}

export function ContactsTable({ contacts, search, territories = [] }: Props) {
  const { subAccount, saPath } = useSubAccount();
  const showTerritoryCol = subAccount?.territoryScopingEnabled === true;
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);

  const territoryById = useMemo(() => {
    const m = new Map<string, TerritoryDoc>();
    for (const t of territories) m.set(t.id, t);
    return m;
  }, [territories]);

  const columns = useMemo<ColumnDef<Contact>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        enableSorting: true,
        cell: ({ row }) => (
          <Link
            href={saPath(`/contacts/${row.original.id}`)}
            className="font-medium text-foreground hover:text-primary hover:underline"
          >
            {row.original.name || "Unnamed"}
          </Link>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.email ? (
            <span className="text-sm text-muted-foreground">
              {row.original.email}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "phone",
        header: "Phone",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.phone ? (
            <span className="text-sm text-muted-foreground">
              {row.original.phone}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "company",
        header: "Company",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.company ? (
            <span className="text-sm">{row.original.company}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "source",
        header: "Source",
        enableSorting: false,
        cell: ({ row }) => <SourceBadge source={row.original.source} />,
      },
      ...(showTerritoryCol
        ? [
            {
              accessorKey: "territoryId",
              header: "Territory",
              enableSorting: false,
              cell: ({ row }) => {
                const id = row.original.territoryId;
                const t = id ? territoryById.get(id) : null;
                // No explicit territory resolves to Global — the shared floor.
                if (!t) {
                  return <span className="text-sm">Global</span>;
                }
                return (
                  <span className="text-sm">
                    {t.name}
                    {t.status === "archived" && (
                      <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        archived
                      </span>
                    )}
                  </span>
                );
              },
            } as ColumnDef<Contact>,
          ]
        : []),
      {
        accessorKey: "createdAt",
        header: "Added",
        enableSorting: true,
        sortingFn: (a, b) => {
          const aVal = toMillis(a.original.createdAt);
          const bVal = toMillis(b.original.createdAt);
          return aVal - bVal;
        },
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatContactDate(row.original.createdAt)}
          </span>
        ),
      },
    ],
    [saPath, showTerritoryCol, territoryById],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => {
      return (
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q)
      );
    });
  }, [contacts, search]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (contacts.length === 0) {
    return null;
  }

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No contacts match &ldquo;{search}&rdquo;.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "px-4 py-3 font-semibold",
                        canSort && "cursor-pointer select-none hover:text-foreground",
                      )}
                      onClick={
                        canSort
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {canSort &&
                          (sorted === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          ))}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b last:border-b-0 transition-colors hover:bg-muted/30"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="space-y-3 md:hidden">
        {table.getRowModel().rows.map((row) => {
          const c = row.original;
          return (
            <Link
              key={c.id}
              href={saPath(`/contacts/${c.id}`)}
              className="block rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name || "Unnamed"}</p>
                  {c.email && (
                    <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      {c.email}
                    </p>
                  )}
                  {c.phone && (
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      {c.phone}
                    </p>
                  )}
                  {c.company && (
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      {c.company}
                    </p>
                  )}
                </div>
                <SourceBadge source={c.source} />
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function toMillis(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate().getTime();
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  return 0;
}
