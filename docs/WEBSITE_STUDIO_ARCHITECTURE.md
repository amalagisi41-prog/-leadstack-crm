# Website Studio architecture and rollout

## Product promise

AgentStack gives a real-estate business one guided path from business identity
to CRM, compliant lead capture, domain, hosting, website, follow-up, and
measurement. A public website is never replaced merely by opening a preview or
moving to the next screen.

## Design-engine decision

Use **Puck + Zack** for AgentStack-created sites.

- Puck is the visual editing shell over AgentStack's own versioned site data.
- Zack supplies guided real-estate copy, recommended sections, validation, and
  safe structured changes.
- AgentStack owns the schema, persisted payload, renderer, publishing workflow,
  and migration path. Puck data is not the public-site source of truth.
- Only reviewed components enter the component registry. 21st.dev or another
  catalog may be a design source, never an unrestricted production dependency.
- v0 may be used as an internal prototyping aid after review; it is not a core
  runtime or required customer workflow.

Why: Puck is an MIT-licensed, React-based visual editor that accepts an
application-owned component configuration and produces a serializable payload.
That aligns with AgentStack's existing React renderer and avoids making a
third-party generation API the publishing control plane.

Primary references:

- https://github.com/puckeditor/puck
- https://puckeditor.com/docs/integrating-puck/component-configuration
- https://vercel.com/legal/api-terms

## One site model

An AgentStack site has three deliberately separate layers:

1. `content`: business identity, copy, contact data, listings, testimonials,
   media, and compliance inputs.
2. `composition`: a versioned list of ordered, visible page sections.
3. `template`: reviewed visual tokens and supported layout variants.

The preview renderer and public renderer consume the same three layers. This is
the central anti-regression rule: a second preview-only renderer is not allowed.
Legacy sites without `composition` receive the version-1 default at read time.

## Puck adapter map

Puck edits an adapter over the site model; its raw payload is not persisted as
an independent website. Every component uses an AgentStack-owned renderer.

| Registered section     | AgentStack fields                                                        | Direct user permission                                                  | Zack permission                                               |
| ---------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| Header                 | `agentName`, `logoUrl`, `phone`, template tokens                         | edit; reorder; cannot hide                                              | propose copy/media change                                     |
| Hero                   | `title`, `serviceAreas`, `tagline`, `bio`, `heroImageUrl`, `heroVariant` | edit; reorder; choose reviewed variant; cannot hide                     | propose validated copy/variant                                |
| Agent introduction     | `headshotUrl`, `agentName`, `brokerage`, `bio`                           | edit; reorder; hide                                                     | propose copy/media change                                     |
| Services & specialties | `specialties[]`                                                          | edit items; reorder; hide                                               | propose validated items                                       |
| Featured listings      | `listings[]`; future tenant-scoped IDX configuration                     | edit manual items; reorder; hide; choose manual/IDX mode when connected | propose layout only; never invent listing data or credentials |
| Testimonials           | `testimonials[]`                                                         | edit items; reorder; hide                                               | polish supplied copy; never fabricate a review                |
| Contact CTA            | `ctaHeadline`, `ctaSubtext`, `phone`, `email`; future form reference     | edit; reorder; cannot hide                                              | propose copy/form recipe; cannot send or publish              |
| Compliance footer      | identity, brokerage, market, policy and license inputs                   | edit approved fields; reorder; cannot hide                              | flag missing data; cannot invent it                           |

Puck field controls map to schema-validated operations such as
`move_section`, `set_visibility`, `set_content_field`, and
`set_template_token`. Zack emits the same operations as proposals. The server
authorizes the tenant, validates the operation, creates a new draft revision,
and returns a diff. Only a human publish action can promote a revision.

The first proof of concept uses Header, Hero, Agent introduction, Contact CTA,
Compliance footer, and an IDX placeholder/configuration section. Arbitrary
HTML, script URLs, secrets, and unregistered React components are rejected.

## Existing-site connection

Existing websites follow a different workflow from AgentStack-created sites:

1. Verify the live source URL and ownership intent.
2. Record a resumable provider-managed hosting/transfer path. Never proxy or
   execute the third-party site inside AgentStack.
3. Build or modify the structured AgentStack-hosted site in Website Studio.
4. Preview only AgentStack-hosted output using the same renderer that will be
   published.
5. Connect forms, IDX, analytics, chat, and tracking as named integrations with
   an owner and status. Do not silently execute imported third-party scripts.
6. Require route coverage, visual checks, functional checks, and a rollback
   artifact before domain cutover.

An exact transfer cannot be guaranteed for every third-party platform. The UI
must say what was copied, isolated, replaced, or needs human approval. A
passing quality gate—not the word “exact”—is the release guarantee.

## Required quality gates

Every publish candidate must pass:

- route manifest: every discovered and required route resolves intentionally;
- responsive rendering: 1440×900, 1280×800, 768×1024, 390×844, and 375×812;
- visual health: styles loaded, no unexpected horizontal overflow, no broken
  required images, and no obviously oversized brand asset;
- lead path: primary CTA, phone, email, form success/error states, consent copy,
  and assigned CRM destination;
- real-estate compliance: brokerage identity, license data where required,
  Equal Housing/REALTOR marks when supplied and permitted, privacy, terms,
  cookie choice, and SMS consent/STOP disclosures for the selected workflow;
- integration inventory: IDX, analytics, pixels, chat, DNS, email sending, and
  CRM automation each show Connected, Needs attention, or Intentionally off;
- rollback: immutable prior release and one-click restore target exist before
  cutover.

## Delivery phases

### Phase 1 — preview and navigation foundation

- Canonical sub-account routes and legacy redirects.
- External-site preview and baseline approval pipeline retired.
- One Website Studio navigation destination.
- Draft creation available before hosting; publish remains locked.
- One hosted preview/public renderer contract.

### Phase 2 — structured Vibe Builder

- Versioned composition schema and legacy normalization.
- Ordered/visible real-estate sections.
- Responsive renderer shared by preview and published site.
- Puck adapter over the composition schema, with Zack generating only validated
  component props and operations.

### Phase 3 — component and compliance registry

- Reviewed real-estate blocks: hero, agent/team, market pages, listings/IDX,
  valuation, testimonials, FAQ, lead form, booking, disclosures, and footer.
- Provenance record per component: source, license, version/commit, reviewer,
  dependencies, accessibility status, and approved use.
- Standard form recipes for buyer, seller, renter, investor, valuation, showing,
  open house, recruiting, and referral workflows.

### Phase 4 — import and release assurance

- Route crawler and asset manifest.
- Screenshot-independent DOM/CSS/asset comparison plus controlled visual diffs.
- Functional test recipes for forms and integrations.
- Release checklist, approval record, rollback, and post-cutover monitor.

### Phase 5 — onboarding evaluation

Continuously test two first-run journeys:

- new business: identity → preset → compliant lead path → domain → publish;
- existing brand: verify → baseline → private build → reconnect integrations →
  compare → approve → cut over.

Measure time to first trustworthy preview, blocked/dead-end rate, preview health
failure rate, form completion, publish rollback rate, and support requests per
connected platform.
