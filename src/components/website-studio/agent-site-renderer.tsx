import type { CSSProperties } from "react";
import type { AgentSiteContent } from "@/types/agent-site";
import type { AgentSiteTemplate } from "@/lib/website-studio/templates";

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
  headshot: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=600&q=70",
};

export function AgentSiteRenderer({
  template,
  content,
}: {
  template: AgentSiteTemplate;
  content: AgentSiteContent;
}) {
  const p = template.palette;
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
    <div style={root}>
      {/* Header */}
      <header
        style={{
          ...container,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "22px 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {content.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={content.logoUrl} alt={name} style={{ height: 34, width: "auto" }} />
          ) : (
            <span style={{ fontFamily: template.fontDisplay, fontSize: 22, fontWeight: 700 }}>
              {name}
            </span>
          )}
        </div>
        <a href={content.phone ? `tel:${content.phone}` : "#contact"} style={accentBtn}>
          {content.phone || "Get in touch"}
        </a>
      </header>

      {/* Hero */}
      {template.heroVariant === "split" ? (
        <section style={{ ...container, display: "grid", gap: 40, gridTemplateColumns: "1fr 1fr", alignItems: "center", padding: "56px 24px 72px" }}>
          <div>
            <div style={eyebrow}>{title} · {areas}</div>
            <h1 style={{ fontFamily: template.fontDisplay, fontSize: 52, lineHeight: 1.05, margin: "0 0 18px", fontWeight: 600 }}>
              {tagline}
            </h1>
            <p style={{ color: p.muted, fontSize: 18, maxWidth: 460, margin: "0 0 28px" }}>{bio}</p>
            <a href="#contact" style={accentBtn}>Work with {name.split(" ")[0]}</a>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroImg} alt="" style={{ width: "100%", height: 460, objectFit: "cover", borderRadius: template.radius }} />
        </section>
      ) : template.heroVariant === "overlay" ? (
        <section
          style={{
            position: "relative",
            minHeight: 560,
            display: "flex",
            alignItems: "center",
            backgroundImage: `linear-gradient(180deg, rgba(15,15,16,0.35), rgba(15,15,16,0.85)), url(${heroImg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div style={{ ...container, paddingTop: 40, paddingBottom: 40 }}>
            <div style={eyebrow}>{title} · {areas}</div>
            <h1 style={{ fontFamily: template.fontDisplay, fontSize: 60, lineHeight: 1.05, margin: "0 0 20px", fontWeight: 600, maxWidth: 720 }}>
              {tagline}
            </h1>
            <p style={{ color: p.muted, fontSize: 18, maxWidth: 520, margin: "0 0 30px" }}>{bio}</p>
            <a href="#contact" style={accentBtn}>Work with {name.split(" ")[0]}</a>
          </div>
        </section>
      ) : (
        <section style={{ ...container, textAlign: "center", padding: "72px 24px 40px" }}>
          <div style={eyebrow}>{title} · {areas}</div>
          <h1 style={{ fontFamily: template.fontDisplay, fontSize: 58, lineHeight: 1.05, margin: "0 auto 20px", fontWeight: 700, maxWidth: 780 }}>
            {tagline}
          </h1>
          <p style={{ color: p.muted, fontSize: 18, maxWidth: 560, margin: "0 auto 30px" }}>{bio}</p>
          <a href="#contact" style={accentBtn}>Work with {name.split(" ")[0]}</a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroImg} alt="" style={{ width: "100%", height: 420, objectFit: "cover", borderRadius: template.radius, marginTop: 48 }} />
        </section>
      )}

      {/* About */}
      <section style={{ ...container, display: "grid", gap: 40, gridTemplateColumns: "300px 1fr", alignItems: "center", padding: "72px 24px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={headshot} alt={name} style={{ width: "100%", height: 340, objectFit: "cover", borderRadius: template.radius }} />
        <div>
          <div style={eyebrow}>About {name.split(" ")[0]}</div>
          <h2 style={h2}>{name}</h2>
          <p style={{ color: p.muted, fontSize: 17, marginBottom: 8 }}>{content.brokerage || "Your Brokerage"}</p>
          <p style={{ fontSize: 17 }}>{bio}</p>
        </div>
      </section>

      {/* Specialties */}
      <section style={{ background: p.surface, borderTop: `1px solid ${p.border}`, borderBottom: `1px solid ${p.border}` }}>
        <div style={{ ...container, padding: "56px 24px" }}>
          <div style={eyebrow}>What I do</div>
          <h2 style={h2}>Specialties</h2>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(3, 1fr)" }}>
            {specialties.map((s) => (
              <div key={s} style={{ ...card, padding: 20, fontSize: 16, fontWeight: 600 }}>
                <span style={{ color: p.accent, marginRight: 8 }}>◆</span>
                {s}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Listings */}
      {content.listings.length > 0 && (
        <section style={{ ...container, padding: "72px 24px" }}>
          <div style={eyebrow}>Featured</div>
          <h2 style={h2}>Properties</h2>
          <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(3, 1fr)" }}>
            {content.listings.map((l, i) => (
              <div key={i} style={card}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.imageUrl} alt={l.title} style={{ width: "100%", height: 200, objectFit: "cover" }} />
                <div style={{ padding: 18 }}>
                  <span style={{ color: p.accent, fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>{l.status}</span>
                  <div style={{ fontSize: 20, fontWeight: 700, margin: "6px 0" }}>{l.price}</div>
                  <div style={{ fontWeight: 600 }}>{l.title}</div>
                  <div style={{ color: p.muted, fontSize: 14 }}>{l.location}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Testimonials */}
      {content.testimonials.length > 0 && (
        <section style={{ background: p.surface, borderTop: `1px solid ${p.border}` }}>
          <div style={{ ...container, padding: "64px 24px" }}>
            <div style={eyebrow}>Client love</div>
            <h2 style={h2}>What people say</h2>
            <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(2, 1fr)" }}>
              {content.testimonials.map((t, i) => (
                <div key={i} style={{ ...card, padding: 24 }}>
                  <p style={{ fontSize: 18, fontFamily: template.fontDisplay, marginBottom: 14 }}>&ldquo;{t.quote}&rdquo;</p>
                  <div style={{ fontWeight: 700 }}>{t.author}</div>
                  <div style={{ color: p.muted, fontSize: 14 }}>{t.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA / Contact */}
      <section id="contact" style={{ ...container, textAlign: "center", padding: "88px 24px" }}>
        <h2 style={{ fontFamily: template.fontDisplay, fontSize: 42, fontWeight: 600, margin: "0 0 14px" }}>
          {content.ctaHeadline || PH.ctaHeadline}
        </h2>
        <p style={{ color: p.muted, fontSize: 18, maxWidth: 520, margin: "0 auto 28px" }}>
          {content.ctaSubtext || PH.ctaSubtext}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          {content.phone && <a href={`tel:${content.phone}`} style={accentBtn}>Call {content.phone}</a>}
          {content.email && (
            <a href={`mailto:${content.email}`} style={{ ...accentBtn, background: "transparent", color: p.text, border: `1px solid ${p.border}` }}>
              Email me
            </a>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${p.border}`, padding: "28px 24px", textAlign: "center", color: p.muted, fontSize: 13 }}>
        © {new Date().getFullYear()} {name} · {content.brokerage || "Real Estate"} · {areas}
      </footer>
    </div>
  );
}
