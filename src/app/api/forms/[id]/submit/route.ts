import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { GLOBAL_TERRITORY_ID } from "@/types";
import { fireWorkflowTrigger } from "@/lib/workflows/engine";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import { serializeContactForApi } from "@/lib/api/serializers/contacts";
import { emitContactCreatedById } from "@/lib/server/contacts-service";
import { emitDealCreatedById } from "@/lib/server/deals-service";
import {
  EMPTY_LOCATION,
  ipFromRequest,
  locationFromIp,
  locationFromPhone,
  mergeLocation,
} from "@/lib/contacts/location";
import { defaultSmsConsentText } from "@/types/forms";
import type { FormField, LeadForm } from "@/types/forms";
import type { Contact, ContactAttribution } from "@/types/contacts";

type SubmitBody = {
  values: Record<string, string>;
  attribution?: Partial<ContactAttribution>;
};

const ATTRIBUTION_KEYS: (keyof ContactAttribution)[] = [
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
  "fbclid",
  "gclid",
  "landingPage",
  "referrer",
];

function normalizeAttribution(
  input: Partial<ContactAttribution> | undefined,
): ContactAttribution | null {
  if (!input || typeof input !== "object") return null;
  const out: ContactAttribution = {
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    fbclid: null,
    gclid: null,
    landingPage: null,
    referrer: null,
  };
  let touched = false;
  for (const key of ATTRIBUTION_KEYS) {
    const raw = input[key];
    if (typeof raw === "string" && raw.trim().length > 0) {
      out[key] = raw.trim().slice(0, 500);
      touched = true;
    }
  }
  return touched ? out : null;
}

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => values[key] ?? "");
}

function contactFieldsFromSubmission(
  fields: FormField[],
  values: Record<string, string>,
): {
  name: string;
  email: string;
  phone: string;
  company: string;
  notes: string;
} {
  const out = { name: "", email: "", phone: "", company: "", notes: "" };
  for (const f of fields) {
    if (!f.mapsTo) continue;
    const v = (values[f.id] ?? "").toString().trim();
    if (!v) continue;
    out[f.mapsTo] = v;
  }
  return out;
}

/**
 * CORS headers for the public form submit endpoint. Wildcard origin is
 * intentional — the "Copy HTML snippet" feature lets the agency embed a
 * form into ANY third-party site (their client's marketing page, a
 * gitpage site, an external CMS). Same-domain submissions (the iframe
 * and the hosted /f/[id] page) work regardless.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function jsonWithCors(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...CORS_HEADERS },
  });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    return await handleSubmit(request, ctx);
  } catch (err) {
    // Last-resort guard so unhandled exceptions still come back with CORS
    // headers — otherwise the browser blocks the response and the script
    // sees a misleading "CORS" error instead of the real server error.
    console.error("[forms/submit] unhandled error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return jsonWithCors({ error: message }, { status: 500 });
  }
}

async function handleSubmit(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body.values !== "object") {
    return jsonWithCors({ error: "Missing values" }, { status: 400 });
  }

  const db = getAdminDb();
  const formRef = db.collection("forms").doc(id);
  const formSnap = await formRef.get();
  if (!formSnap.exists) {
    return jsonWithCors({ error: "Form not found" }, { status: 404 });
  }
  const form = { id: formSnap.id, ...(formSnap.data() as Omit<LeadForm, "id">) };
  if (!form.enabled) {
    return jsonWithCors({ error: "Form is paused" }, { status: 410 });
  }

  // Tenancy: every record this submission spawns inherits the form's
  // sub-account/agency. The form was already created inside one specific
  // sub-account; submissions must land in the same workspace.
  const agencyId = form.agencyId;
  const subAccountId = form.subAccountId;
  if (!agencyId || !subAccountId) {
    return jsonWithCors(
      { error: "Form is missing tenancy metadata" },
      { status: 500 },
    );
  }

  // Validate required fields
  for (const field of form.fields) {
    if (!field.required) continue;
    if (field.type === "sms_consent") {
      // Consent is satisfied only by an explicit "true" — guard against a
      // direct API POST sending "false"/"on" past the generic check below.
      if (body.values[field.id] !== "true") {
        return jsonWithCors(
          { error: "SMS consent is required to submit this form." },
          { status: 400 },
        );
      }
      continue;
    }
    const v = body.values[field.id];
    if (!v || !v.toString().trim()) {
      return jsonWithCors(
        { error: `Missing required field: ${field.label}` },
        { status: 400 },
      );
    }
  }

  // A2P 10DLC consent. When the form carries an sms_consent field, the
  // checkbox is the authoritative opt-in: checked → opted in + audit record;
  // unchecked → created opted-out (no consent, never SMS). Forms WITHOUT a
  // consent field keep the legacy default (smsOptedOut: false).
  const consentField = form.fields.find((f) => f.type === "sms_consent");
  const consentChecked = consentField
    ? body.values[consentField.id] === "true"
    : false;

  const mapped = contactFieldsFromSubmission(form.fields, body.values);
  const attribution = normalizeAttribution(body.attribution);

  // Build the combined placeholder bag for templates.
  const bag: Record<string, string> = { ...mapped };
  for (const f of form.fields) {
    bag[f.id] = body.values[f.id] ?? "";
  }

  // Audit: who created the records the public submission spawns. The form
  // creator is the closest available proxy when there's no authed caller.
  const submissionCreatedBy = form.createdByUid || "form-submission";

  // Best-effort location capture. IP geo is more precise (city + lat/lng);
  // phone country-code parsing is the fallback. Both fail soft — if neither
  // resolves, the contact still saves with null location fields and the
  // dashboard map just doesn't pin them.
  const ip = ipFromRequest(request);
  const [ipLoc, phoneLoc] = await Promise.all([
    ip ? locationFromIp(ip) : Promise.resolve(EMPTY_LOCATION),
    Promise.resolve(locationFromPhone(mapped.phone)),
  ]);
  const location = mergeLocation(ipLoc, phoneLoc);

  // Deduplicate before creating. Forms historically created a fresh
  // contact on EVERY submit, so a returning lead (or anyone filling out
  // a second form) produced a duplicate row. Reconcile email-first with a
  // phone fallback within the sub-account — the same shape booking
  // (`lib/booking/contact-reconcile.ts`) and the web-chat/voice capture
  // paths use. Two equality filters need no composite index.
  // Normalize email to lowercase so case variants ("John@x.com" vs
  // "john@x.com") reconcile to one contact and are stored consistently —
  // same convention as the booking reconcile path.
  const matchEmail = mapped.email.trim().toLowerCase();
  const matchPhone = mapped.phone.trim();

  async function findExistingContact() {
    if (matchEmail) {
      const byEmail = await db
        .collection("contacts")
        .where("subAccountId", "==", subAccountId)
        .where("email", "==", matchEmail)
        .limit(1)
        .get();
      if (!byEmail.empty) return byEmail.docs[0];
    }
    if (matchPhone) {
      const byPhone = await db
        .collection("contacts")
        .where("subAccountId", "==", subAccountId)
        .where("phone", "==", matchPhone)
        .limit(1)
        .get();
      if (!byPhone.empty) return byPhone.docs[0];
    }
    return null;
  }

  const existingContact = await findExistingContact();
  let contactRef: FirebaseFirestore.DocumentReference;
  let contactCreated: boolean;

  if (existingContact) {
    // Reuse + enrich: fill only BLANK identity fields and merge new tags
    // so we never clobber operator-curated data. First-touch attribution
    // is preserved — a later submission only sets it when the contact had
    // none. SMS consent + opt-out flags are intentionally left untouched
    // on an existing contact (flipping them from a form would be a
    // compliance footgun); consent is only stamped at create time.
    contactRef = existingContact.ref;
    contactCreated = false;
    const data = existingContact.data() as Partial<Contact>;
    const patch: Record<string, unknown> = {};
    if (mapped.name && !data.name) patch.name = mapped.name;
    if (mapped.phone && !data.phone) patch.phone = mapped.phone;
    if (matchEmail && !data.email) patch.email = matchEmail;
    if (mapped.company && !data.company) patch.company = mapped.company;
    const newTags = form.settings.autoTags ?? [];
    if (newTags.length > 0) {
      const existingTags = Array.isArray(data.tags) ? data.tags : [];
      const mergedTags = Array.from(new Set([...existingTags, ...newTags]));
      if (mergedTags.length !== existingTags.length) patch.tags = mergedTags;
    }
    if (attribution && !data.attribution) patch.attribution = attribution;
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = FieldValue.serverTimestamp();
      try {
        await contactRef.update(patch);
      } catch {
        // Non-fatal — surface the submission even if the enrich blips.
      }
    }
  } else {
    // Create the contact. `source` falls back to utm_source when the visitor
    // arrived via a tagged ad — otherwise the legacy "website" default.
    contactRef = await db.collection("contacts").add({
      name: mapped.name,
      email: matchEmail,
      phone: mapped.phone,
      company: mapped.company,
      address: "",
      // Default to the explicit "website-form" source so the badge can
      // distinguish public form submissions from web-chat captures and
      // manually-created website contacts. UTM source still wins when
      // present so paid-traffic attribution flows through unchanged.
      source: attribution?.utmSource || "website-form",
      tags: form.settings.autoTags ?? [],
      pipelineStage: form.settings.pipelineStageId ?? null,
      attribution,
      agencyId,
      subAccountId,
      createdByUid: submissionCreatedBy,
      emailOptedOut: false,
      // No consent field → legacy default (opted in). Consent field present →
      // the checkbox decides: checked opts in, unchecked opts out.
      smsOptedOut: consentField ? !consentChecked : false,
      ...(consentField
        ? {
            smsConsent: {
              consented: consentChecked,
              textShown:
                consentField.consentText?.trim() || defaultSmsConsentText(),
              consentedAt: consentChecked
                ? FieldValue.serverTimestamp()
                : null,
              sourceUrl: attribution?.landingPage ?? null,
              ip: ip ?? null,
            },
          }
        : {}),
      countryCode: location.countryCode,
      country: location.country,
      city: location.city,
      lat: location.lat,
      lng: location.lng,
      // Inbound leads default to Global — visible to every rep still
      // holding Global until an admin routes them to a state. Harmless
      // when scoping is off.
      territoryId: GLOBAL_TERRITORY_ID,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    contactCreated = true;
  }

  // Initial note from "notes"-mapped field (if present).
  if (mapped.notes) {
    await db
      .collection("contacts")
      .doc(contactRef.id)
      .collection("notes")
      .add({
        content: mapped.notes,
        createdBy: submissionCreatedBy,
        createdAt: FieldValue.serverTimestamp(),
      });
  }

  // Optional: open a deal in the configured pipeline stage.
  let dealId: string | null = null;
  if (form.settings.createDeal) {
    const stageId = form.settings.pipelineStageId ?? "new";
    const title =
      interpolate(form.settings.dealTitleTemplate || "New lead", bag) ||
      "New lead";
    const dealRef = await db.collection("deals").add({
      title,
      value: form.settings.dealValue || 0,
      currency: form.settings.dealCurrency || "USD",
      contactId: contactRef.id,
      stageId,
      priority: "medium",
      agencyId,
      subAccountId,
      createdByUid: submissionCreatedBy,
      lostReason: null,
      // Inherit the contact's Global default — see note on the contact
      // write above.
      territoryId: GLOBAL_TERRITORY_ID,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      stageChangedAt: FieldValue.serverTimestamp(),
    });
    dealId = dealRef.id;
  }

  // Store submission record (admin-side only; rules deny client writes).
  const submissionRef = await formRef.collection("submissions").add({
    formId: id,
    values: body.values,
    contactId: contactRef.id,
    dealId,
    createdAt: FieldValue.serverTimestamp(),
  });

  // Bump form submission counter.
  await formRef.update({
    submissionCount: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Activity on the new contact. dealId is `string | null` — pass it through
  // as-is (null is a valid Firestore value; undefined is not).
  await db
    .collection("contacts")
    .doc(contactRef.id)
    .collection("activities")
    .add({
      type: "form_submitted",
      content: `Submitted form "${form.name}"`,
      createdBy: submissionCreatedBy,
      meta: { formId: id, dealId },
      createdAt: FieldValue.serverTimestamp(),
    });

  // Fire any matching workflows. Fire-and-forget — a workflow problem must
  // never break the form submission response (the contact is already saved).
  // Forward the submitted answers (label → value) so a Webhook step can pass
  // form fields — like the "How can we help?" message — downstream to n8n etc.
  const formData: Record<string, string> = {};
  for (const f of form.fields) {
    const v = (body.values?.[f.id] ?? "").toString().trim();
    if (v) formData[f.label] = v;
  }
  void fireWorkflowTrigger({
    agencyId,
    subAccountId,
    type: "form.submitted",
    contactId: contactRef.id,
    context: { formId: id, formName: form.name, formData },
  });

  // Outbound webhooks: a public form submission is a real contact (and
  // optionally a deal) being born, so it fires the same events a manual add
  // or API create would. Always live — public forms have no test mode.
  // Only fire contact.created when this submission actually minted a new
  // contact; a deduped resubmit reuses an existing one and must not
  // re-announce its creation.
  if (contactCreated) {
    void emitContactCreatedById({
      subAccountId,
      agencyId,
      contactId: contactRef.id,
    });
  }
  if (dealId) {
    void emitDealCreatedById({ subAccountId, agencyId, dealId });
  }
  // form.submitted carries the new contact + raw values, matching the
  // public-API submissions endpoint's payload shape.
  void (async () => {
    try {
      const csnap = await db.collection("contacts").doc(contactRef.id).get();
      await emitWebhookEvent({
        subAccountId,
        agencyId,
        mode: "live",
        type: "form.submitted",
        payload: {
          submission: {
            id: submissionRef.id,
            object: "form_submission",
            form_id: id,
            contact: serializeContactForApi(contactRef.id, csnap.data() ?? {}, "live"),
            values: body.values,
          },
        },
      });
    } catch (err) {
      console.warn("[forms/submit] form.submitted emit failed", err);
    }
  })();

  return jsonWithCors({
    ok: true,
    contactId: contactRef.id,
    dealId,
    thankYouMessage: form.settings.thankYouMessage,
    redirectUrl: form.settings.redirectUrl || null,
  });
}
