import type { AgentSiteContent } from "@/types/agent-site";
import {
  DEFAULT_AGENTSTACK_LOGO_SHEET_URL,
  SERVICE_SPECIALTIES,
  type BusinessProfileContent,
} from "@/types/business-profile";

const GENERIC_SITE_VALUES = new Set(["", "your name", "your brokerage"]);

export function isUntouchedAgentSite(content: AgentSiteContent): boolean {
  const identity = [
    content.agentName,
    content.brokerage,
    content.phone,
    content.email,
  ].map((value) => value.trim().toLowerCase());
  return identity.every((value) => GENERIC_SITE_VALUES.has(value));
}

function profileSpecialties(profile: BusinessProfileContent): string[] {
  const serviceLabels = profile.services.map(
    (id) =>
      SERVICE_SPECIALTIES.find((service) => service.id === id)?.label ?? id
  );
  const custom = profile.specialties
    .split(/[,;\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([...serviceLabels, ...custom])].slice(0, 8);
}

export function hydrateAgentSiteFromBlueprint(
  current: AgentSiteContent,
  profile: BusinessProfileContent
): AgentSiteContent {
  if (!isUntouchedAgentSite(current)) return current;

  const promise = profile.clientPromise.trim();
  const agentName = profile.agentName.trim();
  const logoUrl =
    profile.logoUrl === DEFAULT_AGENTSTACK_LOGO_SHEET_URL
      ? ""
      : profile.logoUrl.trim();

  return {
    ...current,
    agentName,
    title: profile.title.trim(),
    brokerage: profile.brokerage.trim(),
    tagline:
      promise ||
      (agentName
        ? `Real estate guidance from ${agentName}.`
        : "Real estate guidance built around you."),
    bio:
      profile.bio.trim() ||
      profile.clientExperience.trim() ||
      profile.idealClientProfile.trim(),
    phone: profile.phone.trim(),
    email: profile.email.trim(),
    serviceAreas: profile.serviceAreas.trim(),
    specialties: profileSpecialties(profile),
    logoUrl,
    headshotUrl: profile.headshotUrl.trim(),
    ctaHeadline: promise || "Ready to make your move?",
    ctaSubtext:
      profile.responsePreference.trim() ||
      "Share your goals and we’ll help you choose the right next step.",
    compliance: {
      ...current.compliance,
      licenseStates: profile.licenseStates.trim(),
      licenseNumber: profile.licenseNumber.trim(),
      privacyPolicyUrl: current.compliance?.privacyPolicyUrl ?? "",
      termsUrl: current.compliance?.termsUrl ?? "",
      fairHousingStatement:
        current.compliance?.fairHousingStatement ??
        "We are pledged to the letter and spirit of U.S. policy for the achievement of equal housing opportunity throughout the nation.",
      smsConsentEnabled: current.compliance?.smsConsentEnabled ?? false,
      smsConsentDisclosure:
        current.compliance?.smsConsentDisclosure ??
        "By providing your phone number, you agree to receive calls and text messages about your inquiry. Consent is not a condition of service. Message and data rates may apply. Reply STOP to opt out.",
    },
  };
}
