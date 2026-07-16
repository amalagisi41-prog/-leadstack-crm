import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getMarketingWebChatSubAccountId } from "@/lib/marketing-chat";
import {
  createContactServerSide,
  updateContactServerSide,
} from "@/lib/server/contacts-service";
import type { ContactAttribution } from "@/types/contacts";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  let body: {
    name?: string;
    email?: string;
    pageUrl?: string;
    referrer?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subAccountId = getMarketingWebChatSubAccountId();
  if (!subAccountId) {
    return NextResponse.json(
      { error: "Marketing capture is not configured." },
      { status: 503 },
    );
  }

  const name = str(body.name, 200);
  const email = str(body.email, 200).toLowerCase();
  const pageUrl = str(body.pageUrl, 500) || null;
  const referrer = str(body.referrer, 500) || null;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const subAccountSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subAccountSnap.exists) {
    return NextResponse.json(
      { error: "Marketing workspace not found." },
      { status: 404 },
    );
  }

  const agencyId = (subAccountSnap.data()?.agencyId as string | undefined) ?? "";
  if (!agencyId) {
    return NextResponse.json(
      { error: "Marketing workspace is missing tenancy metadata." },
      { status: 500 },
    );
  }

  const attribution: ContactAttribution = {
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    fbclid: null,
    gclid: null,
    landingPage: pageUrl,
    referrer,
  };

  const existing = await db
    .collection("contacts")
    .where("subAccountId", "==", subAccountId)
    .where("mode", "==", "live")
    .where("email", "==", email)
    .limit(1)
    .get();

  if (!existing.empty) {
    const doc = existing.docs[0];
    const data = doc.data() as {
      name?: string;
      source?: string;
      tags?: string[];
      mode?: "live" | "test";
    };

    const existingTags = Array.isArray(data.tags) ? data.tags : [];
    const tags = existingTags.includes("nurture-web")
      ? existingTags
      : [...existingTags, "nurture-web"];

    const patch: Parameters<typeof updateContactServerSide>[0]["patch"] = {
      tags,
    };

    if (!str(data.name, 200) && name) {
      patch.name = name;
    }
    if (!str(data.source, 100)) {
      patch.source = "website-form";
    }

    await updateContactServerSide({
      contactId: doc.id,
      patch,
      mode: data.mode ?? "live",
    });

    return NextResponse.json({ ok: true, created: false, contactId: doc.id });
  }

  const created = await createContactServerSide({
    subAccountId,
    agencyId,
    createdByUid: "marketing-playbook",
    mode: "live",
    name,
    email,
    phone: "",
    company: "",
    address: "",
    source: "website-form",
    tags: ["nurture-web"],
    attribution,
  });

  return NextResponse.json({
    ok: true,
    created: true,
    contactId: created.id,
  });
}
