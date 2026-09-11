import "server-only";

import * as XLSX from "xlsx";
import type { IdxListingDoc } from "@/types/idx";

// pdfjs-dist expects this browser geometry global while loading. Text parsing
// does not render paths, so a small pure-JS 2D matrix is sufficient and keeps
// the server bundle free of platform-specific native canvas binaries.
if (typeof globalThis.DOMMatrix === "undefined") {
  class ServerDomMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(init?: number[] | { a?: number; b?: number; c?: number; d?: number; e?: number; f?: number }) {
      if (Array.isArray(init)) [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      else if (init) Object.assign(this, init);
    }
    multiplySelf(other: ServerDomMatrix) { const [a, b, c, d, e, f] = [this.a, this.b, this.c, this.d, this.e, this.f]; this.a = a * other.a + c * other.b; this.b = b * other.a + d * other.b; this.c = a * other.c + c * other.d; this.d = b * other.c + d * other.d; this.e = a * other.e + c * other.f + e; this.f = b * other.e + d * other.f + f; return this; }
    preMultiplySelf(other: ServerDomMatrix) { return new ServerDomMatrix(other).multiplySelf(this).copyTo(this); }
    translate(x: number, y: number) { return new ServerDomMatrix(this).multiplySelf(new ServerDomMatrix([1, 0, 0, 1, x, y])); }
    scale(x: number, y = x) { return new ServerDomMatrix(this).multiplySelf(new ServerDomMatrix([x, 0, 0, y, 0, 0])); }
    invertSelf() { const determinant = this.a * this.d - this.b * this.c; if (!determinant) return this; const { a, b, c, d, e, f } = this; this.a = d / determinant; this.b = -b / determinant; this.c = -c / determinant; this.d = a / determinant; this.e = (c * f - d * e) / determinant; this.f = (b * e - a * f) / determinant; return this; }
    copyTo(target: ServerDomMatrix) { Object.assign(target, this); return target; }
  }
  globalThis.DOMMatrix = ServerDomMatrix as unknown as typeof globalThis.DOMMatrix;
}

type Cell = string | number | boolean | null;

const PHOTO_URL_RE = /https?:\/\/[^\s,;"'<>]+\.(?:jpe?g|png|webp|gif)(?:\?[^\s,;"'<>]*)?/gi;

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function number(value: unknown): number {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function first(record: Record<string, unknown>, keys: string[]): unknown {
  const normalized = new Map(Object.entries(record).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ""), value]));
  return keys.map((key) => normalized.get(key.toLowerCase().replace(/[^a-z0-9]/g, ""))).find((value) => value != null && text(value) !== "");
}

function parseCsv(input: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"' && quoted && input[i + 1] === '"') { cell += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell.trim()); cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift() ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function parseText(textContent: string, extension: string): Record<string, unknown>[] {
  if (extension === ".json") {
    const parsed = JSON.parse(textContent) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null);
  }
  if (extension === ".csv") return parseCsv(textContent);
  return [{ rawText: textContent }];
}

async function rowsFromFile(buffer: Buffer, extension: string): Promise<Record<string, unknown>[]> {
  if ([".xlsx", ".xls"].includes(extension)) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  }
  if (extension === ".pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    return parser.getText().then((result) => parser.destroy().then(() => [{ rawText: result.text }]))
      .catch(async (error) => { await parser.destroy(); throw error; });
  }
  return parseText(buffer.toString("utf8"), extension);
}

function listingFromRow(row: Record<string, unknown>, subAccountId: string, sourceId: string, photos: string[]): IdxListingDoc | string {
  const rawText = text(row.rawText);
  const combined = `${Object.values(row).map(text).join(" ")} ${rawText}`;
  const address = text(first(row, ["address", "street", "streetaddress"])) || (combined.match(/\d+\s+[A-Za-z0-9 .'-]+(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Lane|Ln|Court|Ct|Way|Boulevard|Blvd)\b/i)?.[0] ?? "");
  const city = text(first(row, ["city", "cityname"])) || (combined.match(/,\s*([A-Za-z .'-]+),\s*[A-Z]{2}\s+\d{5}/)?.[1] ?? "");
  const state = text(first(row, ["state", "statecode"])) || (combined.match(/,\s*([A-Z]{2})\s+\d{5}/)?.[1] ?? "");
  if (!address || !city || !state) return "The upload needs at least address, city, and state fields.";
  const listingId = text(first(row, ["mlsnumber", "mlsid", "mls", "listingid", "listingnumber"])) || sourceId;
  const inlinePhotos = [...combined.matchAll(PHOTO_URL_RE)].map((match) => match[0]);
  const uniquePhotos = [...new Set([...photos, ...inlinePhotos])].slice(0, 50);
  return {
    id: listingId,
    subAccountId,
    mlsId: listingId,
    status: "active",
    price: number(first(row, ["price", "listprice", "listingprice"])),
    address,
    city,
    state,
    zip: text(first(row, ["zip", "zipcode", "postalcode"])) || (combined.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] ?? ""),
    beds: number(first(row, ["beds", "bedrooms"])),
    baths: number(first(row, ["baths", "bathrooms", "totalbaths"])),
    sqft: number(first(row, ["sqft", "squarefeet", "livingarea"])) || null,
    yearBuilt: number(first(row, ["yearbuilt", "built"])) || null,
    propertyType: text(first(row, ["propertytype", "proptype", "type"])) || "home",
    photos: uniquePhotos,
    remarks: text(first(row, ["remarks", "description", "publicremarks"])) || rawText,
    listingAgentName: text(first(row, ["listingagent", "listingagentname", "agent"])) || null,
    listingOfficeName: text(first(row, ["office", "officename", "brokerage"])) || null,
    disclaimer: text(first(row, ["disclaimer", "mlsdisclaimer", "attribution"])) || null,
    lat: null,
    lng: null,
    raw: { ...row, sourceId, importedPhotos: uniquePhotos },
    syncedAt: new Date() as never,
  };
}

export async function parseListingUpload(input: { buffer: Buffer; filename: string; subAccountId: string; sourceId: string; photos: string[] }): Promise<IdxListingDoc | string> {
  const extension = `.${input.filename.split(".").pop()?.toLowerCase() ?? ""}`;
  const rows = await rowsFromFile(input.buffer, extension);
  if (rows.length === 0) return "The uploaded file does not contain any listing rows.";
  return listingFromRow(rows[0], input.subAccountId, input.sourceId, input.photos);
}
