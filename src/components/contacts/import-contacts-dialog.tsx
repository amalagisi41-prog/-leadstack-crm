"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useSubAccount } from "@/context/sub-account-context";
import { parseCsv, guessContactField, isValidEmail } from "@/lib/csv";
import type { ContactFormData, ContactSource } from "@/types/contacts";

type MappableField = "name" | "email" | "phone" | "company" | "source" | "tags";

const CONTACT_FIELDS: { value: MappableField | ""; label: string }[] = [
  { value: "", label: "— Skip column —" },
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "company", label: "Company" },
  { value: "source", label: "Source" },
  { value: "tags", label: "Tags" },
];

const VALID_SOURCES: ContactSource[] = [
  "website",
  "referral",
  "ads",
  "other",
  "",
];

interface ImportContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PreparedRow {
  rowNumber: number;
  data: ContactFormData;
}

interface PreviewState {
  readyIndexes: number[];
  readyCount: number;
  duplicateCount: number;
  invalidCount: number;
  existingDuplicateCount: number;
  fileDuplicateCount: number;
  skippedMessages: string[];
}

function prepareRows(
  rows: Record<string, string>[],
  mapping: Record<string, MappableField | "">
): {
  valid: PreparedRow[];
  invalidCount: number;
  invalidMessages: string[];
} {
  const valid: PreparedRow[] = [];
  const invalidMessages: string[] = [];
  let invalidCount = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const data: ContactFormData = {
      name: "",
      email: "",
      phone: "",
      company: "",
      address: "",
      source: "",
      tags: [],
    };
    for (const [header, field] of Object.entries(mapping)) {
      if (!field) continue;
      const value = (row[header] ?? "").trim();
      if (!value) continue;
      if (field === "tags") {
        data.tags = value
          .split(/[,;]/)
          .map((t) => t.trim())
          .filter(Boolean);
      } else if (field === "source") {
        const normalized = value.toLowerCase();
        const matched = VALID_SOURCES.find((s) => s && s === normalized);
        data.source = (matched ?? "other") as ContactSource;
      } else {
        data[field] = value;
      }
    }
    if (!data.email || !isValidEmail(data.email)) {
      invalidCount++;
      if (invalidMessages.length < 5) {
        invalidMessages.push(`Row ${idx + 2}: missing or invalid email`);
      }
      continue;
    }
    valid.push({ rowNumber: idx + 2, data });
  }

  return { valid, invalidCount, invalidMessages };
}

export function ImportContactsDialog({
  open,
  onOpenChange,
}: ImportContactsDialogProps) {
  const { subAccountId } = useSubAccount();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, MappableField | "">>(
    {}
  );
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  function reset() {
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setPreviewing(false);
    setPreview(null);
    setResult(null);
    setImporting(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(file: File) {
    const text = await file.text();
    const { headers: hdrs, rows: parsed } = parseCsv(text);
    if (hdrs.length === 0 || parsed.length === 0) {
      toast.error("That file looks empty or isn't valid CSV.");
      return;
    }
    setFileName(file.name);
    setHeaders(hdrs);
    setRows(parsed);
    const next: Record<string, MappableField | ""> = {};
    for (const h of hdrs) {
      next[h] = guessContactField(h) ?? "";
    }
    setMapping(next);
    setPreview(null);
    setResult(null);
  }

  const mappedCount = useMemo(
    () => Object.values(mapping).filter(Boolean).length,
    [mapping]
  );
  const hasEmailColumn = Object.values(mapping).includes("email");
  const prepared = useMemo(() => prepareRows(rows, mapping), [rows, mapping]);

  useEffect(() => {
    if (headers.length > 0) {
      setPreview(null);
    }
  }, [mapping, rows, headers.length]);

  // Per-request row cap — keep in step with MAX_ROWS in the import route so
  // a big CSV is split into multiple requests that each stay under Vercel's
  // function timeout.
  const CHUNK = 200;

  async function runPreview() {
    if (!hasEmailColumn) {
      toast.error("Map at least one column to Email before previewing.");
      return;
    }
    if (prepared.valid.length === 0) {
      setPreview({
        readyIndexes: [],
        readyCount: 0,
        duplicateCount: 0,
        invalidCount: prepared.invalidCount,
        existingDuplicateCount: 0,
        fileDuplicateCount: 0,
        skippedMessages: prepared.invalidMessages,
      });
      toast.error("No valid contacts to import yet.");
      return;
    }

    setPreviewing(true);
    try {
      const res = await fetch("/api/contacts/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subAccountId,
          contacts: prepared.valid.map((row) => ({
            ...row.data,
            __rowNumber: row.rowNumber,
          })),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        readyIndexes?: number[];
        skipped?: Array<{ rowNumber: number; reason: string }>;
        summary?: {
          readyCount?: number;
          duplicateCount?: number;
          existingDuplicateCount?: number;
          fileDuplicateCount?: number;
        };
      };
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error ?? "Preview failed.");
      }
      const skippedMessages = [
        ...prepared.invalidMessages,
        ...(payload.skipped ?? [])
          .slice(0, 5)
          .map((row) => `Row ${row.rowNumber}: ${row.reason}`),
      ];
      setPreview({
        readyIndexes: payload.readyIndexes ?? [],
        readyCount: payload.summary?.readyCount ?? 0,
        duplicateCount: payload.summary?.duplicateCount ?? 0,
        invalidCount: prepared.invalidCount,
        existingDuplicateCount: payload.summary?.existingDuplicateCount ?? 0,
        fileDuplicateCount: payload.summary?.fileDuplicateCount ?? 0,
        skippedMessages,
      });
      toast.success("Preview ready. Review duplicates before importing.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setPreviewing(false);
    }
  }

  async function runImport() {
    if (!preview) {
      toast.error("Preview the import first so we can catch duplicates.");
      return;
    }

    setImporting(true);
    const errors: string[] = [];
    let created = 0;
    let skipped = preview.invalidCount + preview.duplicateCount;

    const readyIndexSet = new Set(preview.readyIndexes);
    const valid = prepared.valid
      .filter((_, idx) => readyIndexSet.has(idx))
      .map((row) => row.data);

    try {
      for (let i = 0; i < valid.length; i += CHUNK) {
        const chunk = valid.slice(i, i + CHUNK);
        const res = await fetch("/api/contacts/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subAccountId, contacts: chunk }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          skipped += chunk.length;
          if (errors.length < 5) {
            errors.push(payload.error ?? "A batch was rejected by the server");
          }
          continue;
        }
        const payload = (await res.json()) as {
          created: number;
          errors: { index: number; message: string }[];
        };
        created += payload.created ?? 0;
        const failed = payload.errors ?? [];
        skipped += failed.length;
        for (const e of failed) {
          if (errors.length < 5) errors.push(`A row failed: ${e.message}`);
        }
      }
      setResult({ created, skipped, errors });
      if (created > 0) {
        toast.success(
          `Imported ${created} contact${created === 1 ? "" : "s"}${
            skipped ? ` · ${skipped} skipped` : ""
          }`
        );
      } else {
        toast.error("No contacts imported — check the errors below.");
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Import contacts from CSV</SheetTitle>
          <SheetDescription>
            Drop a CSV export from Sheets, HubSpot, Pipedrive, or anywhere else
            — we&apos;ll auto-match the columns. Need a starting point?{" "}
            <a
              href="/contacts-template.csv"
              download="agentstack-contacts-template.csv"
              className="text-primary underline-offset-4 hover:underline"
            >
              Download the template
            </a>
            .
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 p-4 pt-0">
          {headers.length === 0 ? (
            <label
              htmlFor="csv-file"
              className="bg-muted/20 hover:border-primary/40 hover:bg-primary/5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-10 text-center transition-colors"
            >
              <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
                <Upload className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium">Choose a CSV file</p>
              <p className="text-muted-foreground text-xs">
                First row should be headers. Email column is required.
                Recognised columns:{" "}
                <code>name, email, phone, company, source, tags</code>.
              </p>
              <input
                ref={inputRef}
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </label>
          ) : (
            <>
              <div className="bg-muted/30 flex items-center justify-between rounded-lg border px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <FileSpreadsheet className="text-primary h-4 w-4" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{fileName}</p>
                    <p className="text-muted-foreground text-xs">
                      {rows.length} rows · {mappedCount} of {headers.length}{" "}
                      columns mapped
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={reset}>
                  Pick another
                </Button>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Column mapping
                </Label>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground border-b text-left text-[11px] tracking-wide uppercase">
                      <tr>
                        <th className="px-3 py-2 font-semibold">CSV column</th>
                        <th className="px-3 py-2 font-semibold">Preview</th>
                        <th className="px-3 py-2 font-semibold">Maps to</th>
                      </tr>
                    </thead>
                    <tbody>
                      {headers.map((h) => (
                        <tr key={h} className="border-b last:border-b-0">
                          <td className="px-3 py-2 font-medium">{h}</td>
                          <td className="text-muted-foreground px-3 py-2 text-xs">
                            {rows
                              .slice(0, 2)
                              .map((r) => r[h])
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={mapping[h] ?? ""}
                              onChange={(e) =>
                                setMapping((prev) => ({
                                  ...prev,
                                  [h]: e.target.value as MappableField | "",
                                }))
                              }
                              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground h-7 w-full rounded-md border bg-transparent px-2 text-xs outline-none focus-visible:ring-2"
                            >
                              {CONTACT_FIELDS.map((f) => (
                                <option key={f.value} value={f.value}>
                                  {f.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!hasEmailColumn && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Map at least one column to Email — rows without emails get
                    skipped.
                  </p>
                )}
              </div>

              <div className="bg-muted/20 rounded-lg border p-3 text-sm">
                <p className="font-medium">Preview before import</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  We&apos;ll check for duplicate emails and phone numbers
                  already in this workspace, plus duplicates inside this CSV,
                  before we write anything.
                </p>
                {preview && (
                  <div className="bg-background mt-3 space-y-2 rounded-lg border p-3">
                    <p className="flex items-center gap-2 font-medium">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      Ready: {preview.readyCount} · Duplicates:{" "}
                      {preview.duplicateCount} · Invalid email rows:{" "}
                      {preview.invalidCount}
                    </p>
                    {(preview.existingDuplicateCount > 0 ||
                      preview.fileDuplicateCount > 0) && (
                      <p className="text-muted-foreground text-xs">
                        Existing workspace duplicates:{" "}
                        {preview.existingDuplicateCount} · Duplicate rows inside
                        this file: {preview.fileDuplicateCount}
                      </p>
                    )}
                    {preview.skippedMessages.length > 0 && (
                      <ul className="text-muted-foreground ml-6 list-disc space-y-0.5 text-xs">
                        {preview.skippedMessages.map((message, index) => (
                          <li key={index}>{message}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {result && (
                <div className="bg-card space-y-2 rounded-lg border p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Import finished · {result.created} created ·{" "}
                    {result.skipped} skipped
                  </p>
                  {result.errors.length > 0 && (
                    <ul className="text-muted-foreground ml-6 list-disc space-y-0.5 text-xs">
                      {result.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={importing}
                >
                  Close
                </Button>
                <Button
                  variant="outline"
                  onClick={runPreview}
                  disabled={previewing || importing || !hasEmailColumn}
                >
                  {previewing ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      Previewing…
                    </>
                  ) : (
                    "Preview import"
                  )}
                </Button>
                <Button
                  onClick={runImport}
                  disabled={
                    importing ||
                    previewing ||
                    !hasEmailColumn ||
                    !preview ||
                    preview.readyCount === 0
                  }
                >
                  {importing
                    ? "Importing…"
                    : `Import ${preview?.readyCount ?? 0} contact${
                        (preview?.readyCount ?? 0) === 1 ? "" : "s"
                      }`}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
