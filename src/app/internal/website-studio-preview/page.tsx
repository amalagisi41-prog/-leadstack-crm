import { notFound } from "next/navigation";
import { AgentSiteRenderer } from "@/components/website-studio/agent-site-renderer";
import { getTemplate } from "@/lib/website-studio/templates";
import { defaultAgentSiteComposition } from "@/lib/website-studio/site-composition";
import type { AgentSiteContent } from "@/types/agent-site";

const previewContent: AgentSiteContent = {
  agentName: "Jordan Avery",
  title: "REALTOR® · Fairfield County",
  brokerage: "Avery Property Group",
  tagline: "Local guidance for your next move.",
  bio: "Thoughtful representation for buyers, sellers, and investors across Fairfield County, with clear communication from first conversation through closing.",
  phone: "(203) 555-0148",
  email: "jordan@example.com",
  serviceAreas: "Greenwich · Stamford · Darien · Westport",
  specialties: ["Luxury homes", "Relocation", "Investment property"],
  logoUrl: "",
  headshotUrl:
    "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=800&q=80",
  heroImageUrl:
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1800&q=80",
  galleryUrls: [],
  instagram: "",
  facebook: "",
  linkedin: "",
  listings: [
    {
      title: "Modern coastal residence",
      price: "$1,895,000",
      location: "Westport, CT",
      imageUrl:
        "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80",
      status: "For sale",
    },
    {
      title: "Classic New England home",
      price: "$1,275,000",
      location: "Darien, CT",
      imageUrl:
        "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=900&q=80",
      status: "New",
    },
    {
      title: "Downtown luxury condominium",
      price: "$925,000",
      location: "Stamford, CT",
      imageUrl:
        "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=900&q=80",
      status: "Open house",
    },
  ],
  testimonials: [
    {
      quote: "Jordan made every decision feel clear and manageable.",
      author: "Maya and Chris",
      detail: "Purchased in Westport",
    },
    {
      quote: "Responsive, strategic, and genuinely invested in our outcome.",
      author: "Daniel R.",
      detail: "Sold in Stamford",
    },
  ],
  ctaHeadline: "Ready to make your move?",
  ctaSubtext:
    "Tell me what you are planning and I will help map the next step.",
  metaTitle: "Jordan Avery | Fairfield County REALTOR®",
  metaDescription:
    "Local real estate guidance for buyers, sellers, and investors across Fairfield County.",
  ogImageUrl: "",
};

export default function WebsiteStudioPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main style={{ background: "#e8edf4", minHeight: "100vh", padding: 24 }}>
      <div
        style={{
          margin: "0 auto 18px",
          maxWidth: 1280,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div>
          <div style={{ color: "#64748b", fontSize: 13, fontWeight: 700 }}>
            AGENTSTACK · LOCAL DESIGN QA
          </div>
          <h1 style={{ color: "#0f172a", fontSize: 26, margin: "4px 0" }}>
            Website Studio hosted preview
          </h1>
          <p style={{ color: "#64748b", margin: 0 }}>
            The same renderer powers private preview and published output.
          </p>
        </div>
        <div
          style={{
            background: "#dcfce7",
            border: "1px solid #86efac",
            borderRadius: 999,
            color: "#166534",
            fontSize: 13,
            fontWeight: 700,
            padding: "9px 14px",
          }}
        >
          Local only · nothing published
        </div>
      </div>
      <div
        style={{
          background: "white",
          border: "1px solid #cbd5e1",
          borderRadius: 18,
          boxShadow: "0 24px 70px rgba(15, 23, 42, 0.14)",
          margin: "0 auto",
          maxWidth: 1280,
          overflow: "hidden",
        }}
      >
        <AgentSiteRenderer
          template={getTemplate("coastal")}
          content={previewContent}
          composition={defaultAgentSiteComposition()}
          editing
        />
      </div>
    </main>
  );
}
