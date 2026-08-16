import type { CSSProperties } from "react";
import type {
  AgentSiteComposition,
  AgentSiteContent,
  AgentSiteDesign,
  AgentSiteSectionType,
} from "@/types/agent-site";
import type { AgentSiteTemplate } from "@/lib/website-studio/templates";
import { normalizeAgentSiteComposition } from "@/lib/website-studio/site-composition";
import { SITE_CANVAS_ID } from "@/lib/website-studio/design";

/**
 * Renders an agent site from a template (design tokens) + content. Pure,
 * self-contained inline styles so it looks identical in the dashboard live
 * preview and on the public published page, immune to app CSS.
 *
 * Every field falls back to a tasteful placeholder so an in-progress draft
 * still reads as a real site.
 */

const PH = {
  agentName: "Your Name",
  title: "REALTOR®",
  tagline: "Helping you find home.",
  bio: "A dedicated real estate professional committed to guiding buyers and sellers through every step of the journey with care, market expertise, and a personal touch.",
  serviceAreas: "Your Area",
  ctaHeadline: "Ready to make your move?",
  ctaSubtext: "Let's talk about your goals — reach out any time.",
  hero: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=70",
  headshot:
    "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=600&q=70",
};

export function AgentSiteRenderer({
  template: baseTemplate,
  content,
  composition,
  idx,
  editing = false,
  design,
}: {
  template: AgentSiteTemplate;
  content: AgentSiteContent;
  composition?: AgentSiteComposition;
  idx?: { connected: boolean; url: string; displayName?: string };
  editing?: boolean;
  /** Vibe Builder overrides on top of the template's tokens. */
  design?: AgentSiteDesign;
}) {
  // Only defined override keys replace the template default so a partial
  // design (e.g. just an accent color) doesn't blank out the rest. Merged
  // once here so every reference below (`template.*`) picks up overrides
  // without threading `design` through the whole render body.
  const template: AgentSiteTemplate = {
    ...baseTemplate,
    palette: {
      ...baseTemplate.palette,
      ...(design?.bg ? { bg: design.bg } : {}),
      ...(design?.surface ? { surface: design.surface } : {}),
      ...(design?.text ? { text: design.text } : {}),
      ...(design?.muted ? { muted: design.muted } : {}),
      ...(design?.accent ? { accent: design.accent } : {}),
      ...(design?.accentText ? { accentText: design.accentText } : {}),
      ...(design?.border ? { border: design.border } : {}),
    },
    fontDisplay: design?.fontDisplay?.trim() || baseTemplate.fontDisplay,
    fontBody: design?.fontBody?.trim() || baseTemplate.fontBody,
    radius:
      typeof design?.radius === "number" ? design.radius : baseTemplate.radius,
    heroVariant: design?.heroVariant ?? baseTemplate.heroVariant,
  };
  const p = template.palette;
  const page = normalizeAgentSiteComposition(composition);
  const sectionPlacement = (
    type: AgentSiteSectionType
  ): Pick<CSSProperties, "display" | "order"> => {
    const index = page.sections.findIndex((section) => section.type === type);
    const section = page.sections[index];
    return {
      order: index,
      ...(section?.visible === false ? { display: "none" } : {}),
    };
  };
  const name = content.agentName || PH.agentName;
  const title = content.title || PH.title;
  const tagline = content.tagline || PH.tagline;
  const bio = content.bio || PH.bio;
  const areas = content.serviceAreas || PH.serviceAreas;
  const heroImg = content.heroImageUrl || PH.hero;
  const headshot = content.headshotUrl || PH.headshot;
  const specialties = content.specialties.length
    ? content.specialties
    : ["Luxury Homes", "First-Time Buyers", "Relocation"];

  const root: CSSProperties = {
    background: p.bg,
    color: p.text,
    fontFamily: template.fontBody,
    lineHeight: 1.6,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    width: "100%",
  };
  const eyebrow: CSSProperties = {
    color: p.accent,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: template.uppercaseEyebrows ? "0.18em" : "0.02em",
    textTransform: template.uppercaseEyebrows ? "uppercase" : "none",
    marginBottom: 10,
  };
  const h2: CSSProperties = {
    fontFamily: template.fontDisplay,
    fontSize: 34,
    fontWeight: 600,
    margin: "0 0 18px",
    lineHeight: 1.15,
  };
  const container: CSSProperties = {
    maxWidth: 1080,
    margin: "0 auto",
    padding: "0 24px",
  };
  const accentBtn: CSSProperties = {
    display: "inline-block",
    background: p.accent,
    color: p.accentText,
    padding: "13px 26px",
    borderRadius: template.radius,
    fontWeight: 600,
    textDecoration: "none",
    fontSize: 15,
  };
  const card: CSSProperties = {
    background: p.surface,
    border: `1px solid ${p.border}`,
    borderRadius: template.radius,
    overflow: "hidden",
  };

  return (
    <div id={SITE_CANVAS_ID} className="agent-site-root" style={root}>
      <style>{`
        .agent-site-root img { max-width: 100%; }
        .agent-site-hero-split,
        .agent-site-about { display: grid; grid-template-columns: 1fr 1fr; }
        .agent-site-specialties,
        .agent-site-listings { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .agent-site-testimonials { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .agent-site-idx-frame { display: block; width: 100%; min-height: 760px; border: 0; }
        @media (max-width: 720px) {
          .agent-site-header { padding: 16px !important; }
          .agent-site-header a { padding: 10px 14px !important; font-size: 13px !important; }
          .agent-site-hero-split,
          .agent-site-about { grid-template-columns: 1fr; }
          .agent-site-hero-split { padding-top: 40px !important; padding-bottom: 48px !important; }
          .agent-site-hero-overlay { min-height: 500px !important; }
          .agent-site-hero-centered { padding-top: 52px !important; }
          .agent-site-hero-title { font-size: clamp(38px, 11vw, 48px) !important; }
          .agent-site-hero-image { height: 300px !important; }
          .agent-site-about { padding-top: 48px !important; padding-bottom: 48px !important; }
          .agent-site-about-image { height: 390px !important; }
          .agent-site-specialties,
          .agent-site-listings,
          .agent-site-testimonials { grid-template-columns: 1fr; }
          .agent-site-contact { padding-top: 64px !important; padding-bottom: 64px !important; }
          .agent-site-idx-frame { min-height: 900px; }
        }
      `}</style>
      {/* Custom CSS is scoped + sanitized before it's ever saved (see
          lib/website-studio/design.ts), so it's safe to render as-is here
          even though this component mounts inside the live dashboard. */}
      {design?.customCss ? (
        <style dangerouslySetInnerHTML={{ __html: design.customCss }} />
      ) : null}
      {/* Header */}
      <header
        className="agent-site-header"
        style={{
          ...container,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "22px 24px",
          ...sectionPlacement("header"),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {content.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={content.logoUrl}
              alt={name}
              style={{ height: 34, width: "auto" }}
            />
          ) : (
            <span
              style={{
                fontFamily: template.fontDisplay,
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              {name}
            </span>
          )}
        </div>
        <a
          href={content.phone ? `tel:${content.phone}` : "#contact"}
          style={accentBtn}
        >
          {content.phone || "Get in touch"}
        </a>
      </header>

      {/* Hero */}
      {template.heroVariant === "split" ? (
        <section
          className="agent-site-hero-split"
          style={{
            ...container,
            gap: 40,
            alignItems: "center",
            padding: "56px 24px 72px",
            ...sectionPlacement("hero"),
          }}
        >
          <div>
            <div style={eyebrow}>
              {title} · {areas}
            </div>
            <h1
              className="agent-site-hero-title"
              style={{
                fontFamily: template.fontDisplay,
                fontSize: 52,
                lineHeight: 1.05,
                margin: "0 0 18px",
                fontWeight: 600,
              }}
            >
              {tagline}
            </h1>
            <p
              style={{
                color: p.muted,
                fontSize: 18,
                maxWidth: 460,
                margin: "0 0 28px",
              }}
            >
              {bio}
            </p>
            <a href="#contact" style={accentBtn}>
              Work with {name.split(" ")[0]}
            </a>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="agent-site-hero-image"
            src={heroImg}
            alt=""
            style={{
              width: "100%",
              height: 460,
              objectFit: "cover",
              borderRadius: template.radius,
            }}
          />
        </section>
      ) : template.heroVariant === "overlay" ? (
        <section
          className="agent-site-hero-overlay"
          style={{
            position: "relative",
            minHeight: 560,
            display: "flex",
            alignItems: "center",
            backgroundImage: `linear-gradient(180deg, rgba(15,15,16,0.35), rgba(15,15,16,0.85)), url(${heroImg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            ...sectionPlacement("hero"),
          }}
        >
          <div style={{ ...container, paddingTop: 40, paddingBottom: 40 }}>
            <div style={eyebrow}>
              {title} · {areas}
            </div>
            <h1
              className="agent-site-hero-title"
              style={{
                fontFamily: template.fontDisplay,
                fontSize: 60,
                lineHeight: 1.05,
                margin: "0 0 20px",
                fontWeight: 600,
                maxWidth: 720,
              }}
            >
              {tagline}
            </h1>
            <p
              style={{
                color: p.muted,
                fontSize: 18,
                maxWidth: 520,
                margin: "0 0 30px",
              }}
            >
              {bio}
            </p>
            <a href="#contact" style={accentBtn}>
              Work with {name.split(" ")[0]}
            </a>
          </div>
        </section>
      ) : (
        <section
          className="agent-site-hero-centered"
          style={{
            ...container,
            textAlign: "center",
            padding: "72px 24px 40px",
            ...sectionPlacement("hero"),
          }}
        >
          <div style={eyebrow}>
            {title} · {areas}
          </div>
          <h1
            className="agent-site-hero-title"
            style={{
              fontFamily: template.fontDisplay,
              fontSize: 58,
              lineHeight: 1.05,
              margin: "0 auto 20px",
              fontWeight: 700,
              maxWidth: 780,
            }}
          >
            {tagline}
          </h1>
          <p
            style={{
              color: p.muted,
              fontSize: 18,
              maxWidth: 560,
              margin: "0 auto 30px",
            }}
          >
            {bio}
          </p>
          <a href="#contact" style={accentBtn}>
            Work with {name.split(" ")[0]}
          </a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="agent-site-hero-image"
            src={heroImg}
            alt=""
            style={{
              width: "100%",
              height: 420,
              objectFit: "cover",
              borderRadius: template.radius,
              marginTop: 48,
            }}
          />
        </section>
      )}

      {/* About */}
      <section
        className="agent-site-about"
        style={{
          ...container,
          gap: 40,
          alignItems: "center",
          padding: "72px 24px",
          ...sectionPlacement("about"),
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="agent-site-about-image"
          src={headshot}
          alt={name}
          style={{
            width: "100%",
            height: 340,
            objectFit: "cover",
            borderRadius: template.radius,
          }}
        />
        <div>
          <div style={eyebrow}>About {name.split(" ")[0]}</div>
          <h2 style={h2}>{name}</h2>
          <p style={{ color: p.muted, fontSize: 17, marginBottom: 8 }}>
            {content.brokerage || "Your Brokerage"}
          </p>
          <p style={{ fontSize: 17 }}>{bio}</p>
        </div>
      </section>

      {/* Specialties */}
      <section
        style={{
          background: p.surface,
          borderTop: `1px solid ${p.border}`,
          borderBottom: `1px solid ${p.border}`,
          ...sectionPlacement("specialties"),
        }}
      >
        <div style={{ ...container, padding: "56px 24px" }}>
          <div style={eyebrow}>What I do</div>
          <h2 style={h2}>Specialties</h2>
          <div className="agent-site-specialties" style={{ gap: 16 }}>
            {specialties.map((s) => (
              <div
                key={s}
                style={{ ...card, padding: 20, fontSize: 16, fontWeight: 600 }}
              >
                <span style={{ color: p.accent, marginRight: 8 }}>◆</span>
                {s}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Full-width, first-party IDX surface. Third-party keys and scripts are
          never accepted by this renderer. */}
      {(idx?.connected || editing) && (
        <section
          style={{
            width: "100%",
            minWidth: 0,
            overflowX: "clip",
            background: "#fafafa",
            ...sectionPlacement("idx"),
          }}
        >
          {idx?.connected ? (
            <>
              <div style={{ ...container, padding: "56px 24px 24px" }}>
                <div style={eyebrow}>Live property search</div>
                <h2 style={h2}>
                  {idx.displayName || "Explore current listings"}
                </h2>
                <p style={{ color: p.muted, margin: 0 }}>
                  Search the current listings connected to this real-estate
                  business.
                </p>
              </div>
              <iframe
                className="agent-site-idx-frame"
                src={idx.url}
                title={idx.displayName || "Current real-estate listings"}
                loading="lazy"
              />
            </>
          ) : (
            <div
              style={{
                ...container,
                padding: "64px 24px",
                textAlign: "center",
              }}
            >
              <div style={eyebrow}>IDX listings</div>
              <h2 style={h2}>Connect IDX to show live listings here</h2>
              <p style={{ color: p.muted, margin: 0 }}>
                This private placeholder never appears on the published site.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Listings */}
      {content.listings.length > 0 && (
        <section
          style={{
            ...container,
            padding: "72px 24px",
            ...sectionPlacement("listings"),
          }}
        >
          <div style={eyebrow}>Featured</div>
          <h2 style={h2}>Properties</h2>
          <div className="agent-site-listings" style={{ gap: 20 }}>
            {content.listings.map((l, i) => (
              <div key={i} style={card}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={l.imageUrl}
                  alt={l.title}
                  style={{ width: "100%", height: 200, objectFit: "cover" }}
                />
                <div style={{ padding: 18 }}>
                  <span
                    style={{
                      color: p.accent,
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    {l.status}
                  </span>
                  <div
                    style={{ fontSize: 20, fontWeight: 700, margin: "6px 0" }}
                  >
                    {l.price}
                  </div>
                  <div style={{ fontWeight: 600 }}>{l.title}</div>
                  <div style={{ color: p.muted, fontSize: 14 }}>
                    {l.location}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Testimonials */}
      {content.testimonials.length > 0 && (
        <section
          style={{
            background: p.surface,
            borderTop: `1px solid ${p.border}`,
            ...sectionPlacement("testimonials"),
          }}
        >
          <div style={{ ...container, padding: "64px 24px" }}>
            <div style={eyebrow}>Client love</div>
            <h2 style={h2}>What people say</h2>
            <div className="agent-site-testimonials" style={{ gap: 20 }}>
              {content.testimonials.map((t, i) => (
                <div key={i} style={{ ...card, padding: 24 }}>
                  <p
                    style={{
                      fontSize: 18,
                      fontFamily: template.fontDisplay,
                      marginBottom: 14,
                    }}
                  >
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div style={{ fontWeight: 700 }}>{t.author}</div>
                  <div style={{ color: p.muted, fontSize: 14 }}>{t.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA / Contact */}
      <section
        className="agent-site-contact"
        id="contact"
        style={{
          ...container,
          textAlign: "center",
          padding: "88px 24px",
          ...sectionPlacement("cta"),
        }}
      >
        <h2
          style={{
            fontFamily: template.fontDisplay,
            fontSize: 42,
            fontWeight: 600,
            margin: "0 0 14px",
          }}
        >
          {content.ctaHeadline || PH.ctaHeadline}
        </h2>
        <p
          style={{
            color: p.muted,
            fontSize: 18,
            maxWidth: 520,
            margin: "0 auto 28px",
          }}
        >
          {content.ctaSubtext || PH.ctaSubtext}
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {content.phone && (
            <a href={`tel:${content.phone}`} style={accentBtn}>
              Call {content.phone}
            </a>
          )}
          {content.email && (
            <a
              href={`mailto:${content.email}`}
              style={{
                ...accentBtn,
                background: "transparent",
                color: p.text,
                border: `1px solid ${p.border}`,
              }}
            >
              Email me
            </a>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: `1px solid ${p.border}`,
          padding: "28px 24px",
          textAlign: "center",
          color: p.muted,
          fontSize: 13,
          ...sectionPlacement("footer"),
        }}
      >
        <div>
          © {new Date().getFullYear()} {name} ·{" "}
          {content.brokerage || "Real Estate"} · {areas}
        </div>
        {content.compliance?.licenseStates ||
        content.compliance?.licenseNumber ? (
          <div style={{ marginTop: 8 }}>
            Licensed in {content.compliance.licenseStates || "—"}
            {content.compliance.licenseNumber
              ? ` · License ${content.compliance.licenseNumber}`
              : ""}
          </div>
        ) : null}
        {content.compliance?.fairHousingStatement ? (
          <div style={{ margin: "8px auto 0", maxWidth: 760 }}>
            {content.compliance.fairHousingStatement}
          </div>
        ) : null}
        {content.compliance?.privacyPolicyUrl ||
        content.compliance?.termsUrl ? (
          <nav
            aria-label="Legal"
            style={{
              display: "flex",
              gap: 14,
              justifyContent: "center",
              marginTop: 10,
            }}
          >
            {content.compliance.privacyPolicyUrl ? (
              <a href={content.compliance.privacyPolicyUrl}>Privacy Policy</a>
            ) : null}
            {content.compliance.termsUrl ? (
              <a href={content.compliance.termsUrl}>Terms of Service</a>
            ) : null}
          </nav>
        ) : null}
        {content.compliance?.smsConsentEnabled &&
        content.compliance.smsConsentDisclosure ? (
          <div style={{ margin: "8px auto 0", maxWidth: 760, fontSize: 11 }}>
            {content.compliance.smsConsentDisclosure}
          </div>
        ) : null}
      </footer>
    </div>
  );
}
