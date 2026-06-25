import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  sendWhatsappTemplateForSubAccount,
  subAccountWhatsappIsConfigured,
} from "@/lib/comms/twilio";
import { requireContactAccessible, requireUid } from "@/lib/comms/route-auth";
import { resolveTemplateVariables } from "@/lib/comms/whatsapp/resolve-template-variables";
import type { MergeTagSubject } from "@/lib/automations/merge-tags";
import type { AgencyDoc, SubAccountDoc } from "@/types";
import type { WhatsappTemplateDoc } from "@/types/whatsapp-templates";

type Body = {
  contactId?: string;
  templateId?: string;
  /** position (string) -> value, for manual variables (and overrides). */
  manualValues?: Record<string, string>;
};

/**
 * Send an APPROVED WhatsApp template to a contact. This is the only compliant
 * way to message outside the 24-hour session window, so — unlike the freeform
 * /whatsapp/send route — there is no window guard here; a template send
 * re-opens the window.
 *
 * Resolves the template's positional variables from the contact's merge tags
 * (+ operator-supplied manual values), sends via Twilio's contentSid path,
 * and writes the rendered message into the WhatsApp thread.
 */

function renderPreview(body: string, values: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n: string) => {
    const idx = Number(n) - 1;
    return values[idx] ?? "";
  });
}

export async function POST(request: Request) {
  const auth = requireUid(request);
  if (auth instanceof NextResponse) return auth;

  let payload: Body;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contactId = payload.contactId?.trim();
  const templateId = payload.templateId?.trim();
  if (!contactId || !templateId) {
    return NextResponse.json(
      { error: "contactId and templateId are required" },
      { status: 400 },
    );
  }

  const contact = await requireContactAccessible(auth.uid, contactId);
  if (contact instanceof NextResponse) return contact;
  if (!contact.phone) {
    return NextResponse.json(
      { error: "This contact has no phone number." },
      { status: 400 },
    );
  }
  if (contact.whatsappOptedOut) {
    return NextResponse.json(
      { error: "This contact has opted out of WhatsApp." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const [subSnap, tplSnap] = await Promise.all([
    db.doc(`subAccounts/${contact.subAccountId}`).get(),
    db
      .doc(`subAccounts/${contact.subAccountId}/whatsappTemplates/${templateId}`)
      .get(),
  ]);
  const subAccount = subSnap.exists ? (subSnap.data() as SubAccountDoc) : null;

  if (subAccount?.whatsappEnabledByAgency !== true) {
    return NextResponse.json(
      { error: "WhatsApp is disabled for this sub-account by your agency." },
      { status: 403 },
    );
  }
  if (!subAccountWhatsappIsConfigured(subAccount?.twilioConfig)) {
    return NextResponse.json(
      { error: "WhatsApp isn't configured. Add a sender under Settings → SMS." },
      { status: 503 },
    );
  }
  if (!tplSnap.exists) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  const tpl = tplSnap.data() as WhatsappTemplateDoc;
  if (tpl.status !== "approved" || !tpl.contentSid) {
    return NextResponse.json(
      { error: "Only an approved template can be sent." },
      { status: 409 },
    );
  }

  // Build the merge-tag subject (owner snapshot from the agency owner).
  let owner = { displayName: "", email: "" };
  try {
    const agencySnap = await db.doc(`agencies/${contact.agencyId}`).get();
    const agency = agencySnap.exists ? (agencySnap.data() as AgencyDoc) : null;
    if (agency?.ownerUid) {
      const ownerSnap = await db.doc(`users/${agency.ownerUid}`).get();
      const od = ownerSnap.data();
      owner = {
        displayName: (od?.displayName as string) ?? "",
        email: (od?.email as string) ?? "",
      };
    }
  } catch {
    /* best-effort — empty owner is tolerated by the resolver */
  }

  const subject: MergeTagSubject = {
    contact: {
      name: contact.name ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
    },
    owner,
    workspace: { name: subAccount?.name ?? "" },
    bookingLink: subAccount?.bookingLink ?? "",
    unsubscribeLink: "",
  };

  // Coerce manual values to a position-keyed numeric map.
  const manualValues: Record<number, string> = {};
  for (const [k, v] of Object.entries(payload.manualValues ?? {})) {
    const pos = Number(k);
    if (Number.isInteger(pos) && typeof v === "string") manualValues[pos] = v;
  }

  const values = resolveTemplateVariables({
    variables: tpl.variables,
    subject,
    manualValues,
  });

  // Twilio rejects empty content variables — every slot must have a value.
  const emptyAt = values.findIndex((v) => v.trim() === "");
  if (emptyAt !== -1) {
    const variable = tpl.variables[emptyAt];
    return NextResponse.json(
      {
        error: `Fill in "${variable?.label ?? `variable ${emptyAt + 1}`}" before sending.`,
      },
      { status: 400 },
    );
  }

  let sid: string;
  let fromNumber: string;
  try {
    const result = await sendWhatsappTemplateForSubAccount({
      subAccountId: contact.subAccountId,
      subAccount,
      to: contact.phone,
      contentSid: tpl.contentSid,
      contentVariables: values,
    });
    sid = result.sid;
    fromNumber = result.from;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send WhatsApp template";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const rendered = renderPreview(tpl.body, values);
  const preview = rendered.length > 80 ? `${rendered.slice(0, 80)}…` : rendered;

  try {
    await db
      .collection("contacts")
      .doc(contactId)
      .collection("activities")
      .add({
        type: "whatsapp_sent",
        content: `WhatsApp template (${tpl.displayName}): ${preview}`,
        createdBy: auth.uid,
        meta: { sid, templateId, kind: "template" },
        createdAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.warn("[whatsapp/send-template] activity write failed", err);
  }

  try {
    await db
      .collection("contacts")
      .doc(contactId)
      .collection("whatsappMessages")
      .doc(sid)
      .set({
        agencyId: contact.agencyId,
        subAccountId: contact.subAccountId,
        contactId,
        direction: "outbound",
        status: "sent",
        body: rendered,
        from: fromNumber,
        to: contact.phone,
        twilioMessageSid: sid,
        sentByUid: auth.uid,
        error: null,
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.warn("[whatsapp/send-template] message-row write failed", err);
  }

  return NextResponse.json({ ok: true, sid });
}
