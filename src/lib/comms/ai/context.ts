import "server-only";

import type { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStage, type Deal } from "@/types/deals";
import type { Contact, Note } from "@/types/contacts";

const MAX_NOTES_INCLUDED = 4;
const MAX_DEALS_INCLUDED = 3;
const NOTE_BODY_TRUNCATE = 240;

/**
 * Pulls a compact context block about a contact for injection into the
 * AI system prompt. Includes:
 *
 *   - Identity basics (name, tags, source, lead attribution if present)
 *   - Active deals — title + stage + value + age in days
 *   - Recent notes (last few, truncated)
 *
 * Intentionally small: every token here is paid for on every LLM call.
 * Stale data is the bigger risk than missing data — bias toward "less
 * but recent" over "everything historical".
 *
 * Returns null when there's nothing meaningful to include — caller skips
 * injection so the system prompt stays uncluttered.
 */
export async function buildContactContextBlock(
  contact: Contact,
): Promise<string | null> {
  const db = getAdminDb();

  const [dealsSnap, notesSnap] = await Promise.all([
    db
      .collection("deals")
      .where("contactId", "==", contact.id)
      .where("subAccountId", "==", contact.subAccountId)
      .orderBy("updatedAt", "desc")
      .limit(MAX_DEALS_INCLUDED)
      .get()
      .catch(() => null),
    db
      .collection("contacts")
      .doc(contact.id)
      .collection("notes")
      .orderBy("createdAt", "desc")
      .limit(MAX_NOTES_INCLUDED)
      .get()
      .catch(() => null),
  ]);

  const deals: Deal[] = dealsSnap
    ? dealsSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Deal, "id">),
      }))
    : [];

  const notes: Note[] = notesSnap
    ? notesSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Note, "id">),
      }))
    : [];

  const lines: string[] = [];

  // ---- Identity ----
  const identityBits: string[] = [];
  if (contact.name?.trim()) identityBits.push(`Name: ${contact.name.trim()}`);
  if (contact.company?.trim())
    identityBits.push(`Company: ${contact.company.trim()}`);
  if (contact.tags && contact.tags.length > 0) {
    identityBits.push(`Tags: ${contact.tags.join(", ")}`);
  }
  // The truthy check already excludes the empty-string fallback; "website"
  // is the default for un-attributed form submissions so it's noise here.
  if (contact.source && contact.source !== "website") {
    identityBits.push(`Source: ${contact.source}`);
  }

  // Marketing attribution — only mention the campaign, not all UTMs (too
  // much noise for the bot, and most UTMs aren't useful conversationally).
  const attribution = contact.attribution;
  if (attribution?.utmCampaign) {
    identityBits.push(`Ad campaign: ${attribution.utmCampaign}`);
  }

  if (identityBits.length > 0) {
    lines.push(...identityBits);
  }

  // ---- Active (non-terminal) deals ----
  const activeDeals = deals.filter((d) => {
    const stage = getStage(d.stageId);
    return stage.terminal !== "won" && stage.terminal !== "lost";
  });

  if (activeDeals.length > 0) {
    const dealLines = activeDeals.map((d) => {
      const stage = getStage(d.stageId);
      const ageDays = ageInDays(d.stageChangedAt ?? d.createdAt);
      const value = d.value
        ? `${d.currency || "USD"} ${d.value.toLocaleString()}`
        : "no value set";
      const age = ageDays !== null ? `${ageDays}d in stage` : "";
      return `  - "${d.title}" — ${stage.label}${age ? `, ${age}` : ""}, ${value}`;
    });
    lines.push("Active deals:");
    lines.push(...dealLines);
  }

  // ---- Won/lost deals (mention only the most recent terminal one if any) ----
  const lastWon = deals.find((d) => getStage(d.stageId).terminal === "won");
  if (lastWon) {
    lines.push(
      `Past sale: "${lastWon.title}" (${lastWon.currency || "USD"} ${lastWon.value.toLocaleString()})`,
    );
  }

  // ---- Recent notes ----
  if (notes.length > 0) {
    const noteLines = notes.map((n) => {
      const date = formatShortDate(n.createdAt as Timestamp | null);
      const body = (n.content ?? "").trim().slice(0, NOTE_BODY_TRUNCATE);
      const truncated =
        (n.content ?? "").trim().length > NOTE_BODY_TRUNCATE ? "…" : "";
      return `  - [${date}] ${body}${truncated}`;
    });
    lines.push("Recent notes (most recent first):");
    lines.push(...noteLines);
  }

  if (lines.length === 0) return null;

  return [
    "## Context about this contact (for your awareness only)",
    ...lines,
    "",
    "Use this context to inform your replies but do not recite it back unsolicited. If the customer hasn't mentioned a topic, don't bring it up.",
  ].join("\n");
}

function ageInDays(value: Deal["stageChangedAt"]): number | null {
  if (!value) return null;
  const ts = value as Timestamp;
  if (typeof ts.toDate !== "function") return null;
  const diff = Date.now() - ts.toDate().getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatShortDate(value: Timestamp | null): string {
  if (!value || typeof value.toDate !== "function") return "—";
  const d = value.toDate();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${month}-${day}`;
}
