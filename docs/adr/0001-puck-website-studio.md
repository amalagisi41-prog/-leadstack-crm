# ADR 0001: Puck as the embedded Website Studio editor

- Status: proof of concept implemented; production rollout pending UX review
- Date: 2026-08-15
- Owners: AgentStack product and engineering

## Decision

Use Puck as the embedded visual editing shell for AgentStack-owned React
sections. Keep AgentStack's `content`, versioned `composition`, renderer,
authorization, draft/publish state, revision history, integrations, and
deployment workflow as the source of truth. Zack uses the same validated field
and composition operations as direct editing.

Do not use Puck to accept arbitrary customer React/HTML or to persist a second
public-site format. Do not use Vercel v0 as a production runtime or publishing
control plane. Treat 21st.dev as a discovery source only; each component must
enter through the component review process.

## Evidence

- Puck describes itself as an open-source visual editor for React and publishes
  an MIT license: https://github.com/puckeditor/puck
- Puck's component configuration maps registered components to fields and
  render functions: https://puckeditor.com/docs/integrating-puck/component-configuration
- Vercel's API terms add provider-specific API, AI, third-party, and beta
  conditions: https://vercel.com/legal/api-terms

## License and dependency gate

Reviewed package: `@puckeditor/core@0.23.0` (MIT), installed and pinned through
the project lockfile on 2026-08-15. The official package declares React 18 or
19 support. The local Next.js 15 production build and TypeScript checks pass.
The editor is lazy-loaded only when Puck + Zack is opened and is not imported
by public agent-site routes.

Before enabling the proof of concept for production tenants:

1. Pin the reviewed version and record its commit/release.
2. Capture direct and transitive packages in the lockfile and SBOM.
3. Run license, vulnerability, and dependency-maintenance review.
4. Preserve the MIT notice in AgentStack's third-party notices.
5. Confirm React 19 and Next.js 15 compatibility in an isolated branch/build.
6. Confirm no editor telemetry or external service is enabled by default.
7. Record bundle impact and ensure editor code is excluded from public pages.

Completed: version pin, lockfile capture, React/Next compatibility build,
core-only integration, and lazy loading. Remaining: formal SBOM/license notice,
vulnerability review, bundle-budget record, and authenticated UX acceptance.

Every catalog-sourced component requires a provenance record containing source
URL, author, license evidence, version/commit, dependencies, assets/fonts,
accessibility result, security review, reviewer, approval date, and permitted
use. No provenance record means no production registry entry.

## Consequences

- Existing and public sites remain independent of the editor dependency.
- Direct edits do not spend AI credits.
- Zack cannot escape the component/prop allowlist.
- The initial integration takes more adapter work than persisting raw Puck data,
  but it avoids renderer drift, tenant data loss, and vendor lock-in.

## Rollback

The current Page structure and Edit content controls continue to operate on the
same schema if the Puck proof of concept is removed. No site migration or public
renderer rollback is required.
