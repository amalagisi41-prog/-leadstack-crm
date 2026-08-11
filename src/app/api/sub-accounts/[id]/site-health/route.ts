import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import type { BusinessProfileContent } from "@/types/business-profile";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const [
    subSnap,
    profileSnap,
    websiteSnap,
    agentSiteSnap,
    formsSnap,
    bookingSnap,
    chatSnap,
  ] = await Promise.all([
    db.doc(`subAccounts/${id}`).get(),
    db.doc(`subAccounts/${id}/businessProfile/main`).get(),
    db.collection(`subAccounts/${id}/website`).limit(10).get(),
    db.doc(`subAccounts/${id}/agentSites/main`).get(),
    db.collection("forms").where("subAccountId", "==", id).limit(1).get(),
    db.collection(`subAccounts/${id}/bookingPages`).limit(1).get(),
    db.doc(`subAccounts/${id}/aiAgent/web-chat`).get(),
  ]);

  const sub = subSnap.data() ?? {};
  const profile = (profileSnap.data() ??
    {}) as Partial<BusinessProfileContent> & {
    completeness?: number;
  };
  const publishedWebsite = websiteSnap.docs.some((doc) => {
    const data = doc.data();
    return data.status === "ready" || Boolean(data.liveUrl);
  });
  const publishedAgentSite =
    agentSiteSnap.exists && agentSiteSnap.data()?.status === "published";

  const tasks = [
    {
      id: "blueprint",
      title: "Complete your Business Blueprint",
      detail: "Give your website and AI accurate business information.",
      complete: (profile.completeness ?? 0) >= 80,
      href: "/business-profile",
      action: "Complete profile",
    },
    {
      id: "compliance",
      title: "Confirm business and compliance details",
      detail: "Add brokerage, license, disclosure, and opt-out information.",
      complete: Boolean(
        profile.brokerage &&
        profile.licenseNumber &&
        profile.fairHousing === true &&
        profile.noLegalTaxAdvice === true &&
        profile.optOutLanguage
      ),
      href: "/business-profile",
      action: "Review details",
    },
    {
      id: "website",
      title: "Publish your website",
      detail: "Put an approved AgentStack website online.",
      complete: publishedWebsite || publishedAgentSite,
      href: "/website-studio",
      action: "Open Website Studio",
    },
    {
      id: "domain",
      title: "Connect your domain",
      detail: "Use a web address that belongs to your business.",
      complete: Boolean(sub.customDomain),
      href: "/domain",
      action: "Connect domain",
    },
    {
      id: "lead-capture",
      title: "Create a lead-capture form",
      detail: "Give website visitors a simple way to contact you.",
      complete: !formsSnap.empty,
      href: "/forms",
      action: "Create form",
    },
    {
      id: "booking",
      title: "Create a booking page",
      detail: "Let qualified leads choose an appointment time.",
      complete: !bookingSnap.empty,
      href: "/booking",
      action: "Set up booking",
    },
    {
      id: "chat",
      title: "Turn on website chat",
      detail: "Answer common questions and capture leads while you are busy.",
      complete: chatSnap.exists && chatSnap.data()?.enabled === true,
      href: "/ai-agents/web-chat",
      action: "Set up chat",
    },
    {
      id: "email",
      title: "Verify your business email",
      detail: "Send follow-up from a trusted business address.",
      complete: sub.resendConfig?.status === "verified",
      href: "/dashboard/settings",
      action: "Verify email",
    },
  ];

  const completed = tasks.filter((task) => task.complete).length;
  return NextResponse.json({
    score: Math.round((completed / tasks.length) * 100),
    completed,
    total: tasks.length,
    tasks,
    checkedAt: new Date().toISOString(),
  });
}
