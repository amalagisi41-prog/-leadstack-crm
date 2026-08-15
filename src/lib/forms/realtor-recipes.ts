import {
  defaultFormSettings,
  defaultSmsConsentText,
  type FormField,
  type FormSettings,
  type FormTemplate,
} from "@/types/forms";

export type RealtorFormRecipe = {
  id: Exclude<FormTemplate, "blank" | "contact">;
  name: string;
  description: string;
  fields: FormField[];
  settings: FormSettings;
};

const field = (
  id: string,
  label: string,
  type: FormField["type"] = "text",
  required = true,
  mapsTo: FormField["mapsTo"] = "notes",
  options: string[] = []
): FormField => ({
  id,
  label,
  type,
  required,
  mapsTo,
  options,
  placeholder: "",
});

const baseFields = (businessName?: string): FormField[] => [
  field("name", "Full name", "text", true, "name"),
  field("email", "Email", "email", true, "email"),
  field("phone", "Phone", "phone", false, "phone"),
  {
    ...field("sms_consent", "Text-message consent", "sms_consent", false, null),
    consentText: defaultSmsConsentText(businessName),
  },
];

const settings = (tag: string, thankYouMessage: string): FormSettings => ({
  ...defaultFormSettings(),
  autoTags: ["website", "real-estate", tag],
  thankYouMessage,
  createDeal: true,
  dealTitleTemplate: `${tag.replaceAll("_", " ")} lead — {name}`,
});

export function realtorFormRecipes(businessName?: string): RealtorFormRecipe[] {
  const base = () => baseFields(businessName);
  return [
    {
      id: "buyer",
      name: "Buyer consultation",
      description: "Budget, target market, timeline, and financing readiness.",
      fields: [
        ...base(),
        field("buyer_needs", "What are you looking for?", "textarea"),
        field("budget", "Approximate budget", "select", true, "notes", [
          "Under $300k",
          "$300k–$600k",
          "$600k–$1M",
          "$1M+",
        ]),
        field("timeline", "Purchase timeline", "select", true, "notes", [
          "0–3 months",
          "3–6 months",
          "6–12 months",
          "Researching",
        ]),
      ],
      settings: settings(
        "buyer",
        "Thanks — we’ll review your search and follow up with the right next step."
      ),
    },
    {
      id: "seller",
      name: "Seller consultation",
      description: "Property, timing, condition, and selling goals.",
      fields: [
        ...base(),
        field("property_address", "Property address"),
        field(
          "seller_timeline",
          "Ideal selling timeline",
          "select",
          true,
          "notes",
          ["Now", "0–3 months", "3–6 months", "Exploring options"]
        ),
        field(
          "seller_notes",
          "What matters most about your sale?",
          "textarea",
          false
        ),
      ],
      settings: settings(
        "seller",
        "Thanks — we’ll review the property details and contact you shortly."
      ),
    },
    {
      id: "renter",
      name: "Rental search",
      description: "Location, monthly budget, move date, and rental needs.",
      fields: [
        ...base(),
        field("rental_area", "Preferred area"),
        field("monthly_budget", "Monthly budget"),
        field("move_date", "Target move date"),
        field(
          "rental_needs",
          "Bedrooms, pets, and other needs",
          "textarea",
          false
        ),
      ],
      settings: settings(
        "renter",
        "Thanks — we’ll review your rental needs and be in touch."
      ),
    },
    {
      id: "investor",
      name: "Investor intake",
      description: "Strategy, markets, capital range, and experience.",
      fields: [
        ...base(),
        field("strategy", "Investment strategy", "select", true, "notes", [
          "Buy and hold",
          "Fix and flip",
          "Short-term rental",
          "Development",
          "Not sure",
        ]),
        field("capital", "Available capital / price range"),
        field("markets", "Target markets"),
        field("experience", "Investment experience", "textarea", false),
      ],
      settings: settings(
        "investor",
        "Thanks — we’ll review your investment criteria before reaching out."
      ),
    },
    {
      id: "valuation",
      name: "Home valuation",
      description:
        "A compliant seller-value request without an automated-value promise.",
      fields: [
        ...base(),
        field("property_address", "Property address"),
        field(
          "property_details",
          "Property updates or important details",
          "textarea",
          false
        ),
      ],
      settings: settings(
        "valuation",
        "Thanks — a local professional will review your property and follow up. This is not an appraisal."
      ),
    },
    {
      id: "showing",
      name: "Showing request",
      description: "Property, preferred times, and representation status.",
      fields: [
        ...base(),
        field("property", "Property address or MLS number"),
        field("preferred_times", "Preferred showing times", "textarea"),
        field(
          "represented",
          "Are you currently represented by an agent?",
          "select",
          true,
          "notes",
          ["No", "Yes", "Not sure"]
        ),
      ],
      settings: settings(
        "showing",
        "Thanks — we’ll confirm availability and representation details before scheduling."
      ),
    },
    {
      id: "open_house",
      name: "Open-house registration",
      description: "Fast attendee registration and permission-aware follow-up.",
      fields: [
        ...base(),
        field("property", "Open-house property"),
        field(
          "attendee_notes",
          "Questions before your visit",
          "textarea",
          false
        ),
      ],
      settings: settings(
        "open_house",
        "You’re registered. We’ll send event details using the contact methods you approved."
      ),
    },
    {
      id: "recruiting",
      name: "Agent recruiting",
      description:
        "License, production, market, and confidential conversation request.",
      fields: [
        ...base(),
        field("license_state", "Licensed state(s)"),
        field(
          "production",
          "Recent production range",
          "select",
          false,
          "notes",
          ["Newly licensed", "1–5 sides", "6–15 sides", "16+ sides"]
        ),
        field(
          "recruiting_notes",
          "What are you looking for in a brokerage?",
          "textarea",
          false
        ),
      ],
      settings: settings(
        "recruiting",
        "Thanks — your inquiry will be handled confidentially."
      ),
    },
    {
      id: "referral",
      name: "Agent referral",
      description:
        "Client destination, timing, needs, and referring-agent information.",
      fields: [
        ...base(),
        field("client_destination", "Client destination / market"),
        field("client_need", "Buyer, seller, renter, or investor?"),
        field("referring_agent", "Referring agent and brokerage"),
        field(
          "referral_notes",
          "Timeline and relevant details",
          "textarea",
          false
        ),
      ],
      settings: settings(
        "referral",
        "Thanks — we’ll review the referral and confirm the next step directly."
      ),
    },
  ];
}

export function getRealtorFormRecipe(id: FormTemplate, businessName?: string) {
  return realtorFormRecipes(businessName).find((recipe) => recipe.id === id);
}
