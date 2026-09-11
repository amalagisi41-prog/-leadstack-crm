import "server-only";

import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";
import type { IdxListingDoc } from "@/types/idx";

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

function rowsFromFile(buffer: Buffer, extension: string): Promise<Record<string, unknown>[]> {
  if ([".xlsx", ".xls"].includes(extension)) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return Promise.resolve(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }));
  }
  if (extension === ".pdf") {
    const parser = new PDFParse({ data: buffer });
    return parser.getText().then((result) => parser.destroy().then(() => [{ rawText: result.text }]))
      .catch(async (error) => { await parser.destroy(); throw error; });
  }
  return Promise.resolve(parseText(buffer.toString("utf8"), extension));
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
