/**
 * Small CSV utilities — handles quoted fields, escaped quotes ("") and
 * \r\n line endings. Good enough for lead-list imports; not a full RFC 4180
 * implementation (no streaming, no edge cases for embedded nulls).
 */

export type CsvRow = Record<string, string>;

export function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const clean = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = splitCsvLines(clean);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return { headers, rows };
}

function splitCsvLines(text: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      // Toggle; doubled "" stays escaped (we rebuild it below).
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (ch === "\n" && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.length > 0) out.push(current);
  return out;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

export function serializeCsv(
  headers: string[],
  rows: Record<string, unknown>[],
): string {
  const headerLine = headers.map(escapeCsvCell).join(",");
  const body = rows
    .map((r) => headers.map((h) => escapeCsvCell(r[h])).join(","))
    .join("\n");
  return `${headerLine}\n${body}\n`;
}

function escapeCsvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("; ") : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s);
}

/**
 * Fuzzy-match a header name to a known Contact field. Used to auto-map a
 * freshly-uploaded CSV without forcing the user to configure every column.
 */
export function guessContactField(header: string):
  | "name"
  | "email"
  | "phone"
  | "company"
  | "source"
  | "tags"
  | null {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (/(^|_)name($|_)/.test(h) || h === "fullname" || h === "name") return "name";
  if (h.includes("firstname") || h.includes("lastname")) return "name";
  if (h === "email" || h === "emailaddress" || h.includes("mail"))
    return "email";
  if (h.includes("phone") || h === "tel" || h === "mobile") return "phone";
  if (h.includes("company") || h === "organization" || h === "org")
    return "company";
  if (h.includes("source") || h === "origin") return "source";
  if (h.includes("tag")) return "tags";
  return null;
}
