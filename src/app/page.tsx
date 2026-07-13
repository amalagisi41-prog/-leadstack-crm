import { LANDING_VARIANT } from "@/config/landing";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { resolveHeroVariant } from "@/lib/hero-variant-server";

import { AnnouncementBar } from "@/components/landing/announcement-bar";
import { Navbar as AgentStackNavbar } from "@/components/landing/navbar";
import { Hero as AgentStackHero } from "@/components/landing/hero";
import { IntegrationsCarousel } from "@/components/landing/integrations-carousel";
import { HowItWorks } from "@/components/landing/how-it-works";
import { WorkspaceTour } from "@/components/landing/workspace-tour";
import { Features as AgentStackFeatures } from "@/components/landing/features";
import { MidPageCta } from "@/components/landing/mid-page-cta";
import { Comparison } from "@/components/landing/comparison";
// import { Support } from "@/components/landing/support"; // hidden for now
import { MakeItYours } from "@/components/landing/make-it-yours";
import { TestimonialsCarousel } from "@/components/landing/testimonials-carousel";
import { Pricing as AgentStackPricing } from "@/components/landing/pricing";
import { FAQ as AgentStackFAQ } from "@/components/landing/faq";
import { CTA as AgentStackCTA } from "@/components/landing/cta";
import { Footer as AgentStackFooter } from "@/components/landing/footer";
import { ExitIntentModal } from "@/components/landing/exit-intent-modal";
import { UpdatesModal } from "@/components/landing/updates-modal";
import { SalesPopup } from "@/components/landing/sales-popup";
import { LiveVisitorBeacon } from "@/components/landing/live-visitor-beacon";

import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { Hero as CustomHero } from "@/components/landing-custom/hero";
import { PainPoints } from "@/components/landing-custom/pain-points";
import { HowItWorks as CustomHowItWorks } from "@/components/landing-custom/how-it-works";
import { PipelineDemo } from "@/components/landing-custom/pipeline-demo";
import { AiDemo } from "@/components/landing-custom/ai-demo";
import { Territory } from "@/components/landing-custom/territory";
import { IdxShowcase } from "@/components/landing-custom/idx-showcase";
import { Features as CustomFeatures } from "@/components/landing-custom/features";
import { Testimonials } from "@/components/landing-custom/testimonials";
import { Imagine } from "@/components/landing-custom/imagine";
import { Pricing as CustomPricing } from "@/components/landing-custom/pricing";
import { AddOns } from "@/components/landing-custom/add-ons";
import { FAQ as CustomFAQ } from "@/components/landing-custom/faq";
import { SignupCta } from "@/components/landing-custom/signup-cta";
import { VideoTeaser } from "@/components/landing-custom/video-teaser";
import { ClientPromise } from "@/components/landing-custom/client-promise";
import { HeroPipelineMockup } from "@/components/landing-custom/hero-pipeline-mockup";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";

/**
 * Renders one of two landing pages based on src/config/landing.ts.
 *
 * - "custom" — a generic agency-CRM landing the buyer brands as their own.
 *   Brand fields are resolved server-side from the agency doc (Agency →
 *   Settings → Branding), falling back to CUSTOM_BRAND for anything the
 *   owner hasn't set yet. THIS IS THE DEFAULT.
 * - "leadstack" — the AgentStack-branded marketing landing used on the
 *   leadstack.dev demo site. Flip back to this only for the public demo.
 *
 * Flip LANDING_VARIANT to swap. Code-level defaults for the custom
 * variant live in src/config/landing.ts (CUSTOM_BRAND).
 */
export default async function HomePage() {
  if (LANDING_VARIANT === "custom") {
    const brand = await resolveCustomBrand();
    return (
      <div className="flex min-h-screen flex-col bg-[#FFF6E8] text-[#173B7A] [color-scheme:light]">
        <CustomNavbar brand={brand} />
        <main className="flex-1">
          <CustomHero />
          <VideoTeaser />
          <ClientPromise />
          <HeroPipelineMockup />
          <PainPoints />
          <CustomHowItWorks />
          <PipelineDemo />
          <AiDemo />
          <Territory />
          <IdxShowcase />
          <CustomFeatures />
          <Testimonials />
          <Imagine />
          <CustomPricing />
          <AddOns />
          <CustomFAQ brand={brand} />
          <SignupCta />
        </main>
        <CustomFooter brand={brand} />
      </div>
    );
  }

  const heroVariant = await resolveHeroVariant();

  return (
    <div className="flex min-h-screen flex-col">
      <AnnouncementBar />
      <AgentStackNavbar />
      <main className="flex-1">
        <AgentStackHero variant={heroVariant} />
        <HowItWorks />
        <WorkspaceTour />
        <AgentStackFeatures />
        <MidPageCta />
        <Comparison />
        {/* <Support /> — hidden for now; uncomment to restore */}
        <MakeItYours />
        <TestimonialsCarousel />
        <AgentStackPricing />
        <IntegrationsCarousel />
        <AgentStackFAQ />
        <AgentStackCTA />
      </main>
      <AgentStackFooter variant={heroVariant} />
      <ExitIntentModal />
      <UpdatesModal />
      <SalesPopup />
      <LiveVisitorBeacon />
    </div>
  );
}
