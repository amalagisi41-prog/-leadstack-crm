# AgentStack Desktop Audit Handoff

Open ChatGPT Work Mode on chatgpt.com and paste the instructions below.

## Audit request

Continue the AgentStack Website Studio audit using the authenticated desktop/browser session.

Project dashboard:
https://agentstackcrm.app/sa/iJhXWJeb8bjpBm32S0WE/website-studio

Public reference site:
https://www.artisanhomenetwork.com/

Inspect the current Website Studio implementation and verify the logged-in dashboard directly. Do not use screenshots as the source of truth. Do not proxy, scrape, iframe, or compare an external website as a replacement preview.

## Product rules

- Website Studio previews only AgentStack-hosted output.
- Existing-site migration must be provider-managed, resumable, tenant-scoped, and must not alter the existing site until an explicit cutover.
- Keep the current site live while migration is pending.
- Do not publish, connect a domain, change DNS, or deploy without explicit approval.
- Preserve forms, analytics, CRM connections, IDX, compliance notices, and responsive behavior through explicit integrations—not copied third-party scripts.
- Use the structured Vibe builder and the shared AgentStack renderer for preview and published output.

## Audit checklist

1. Confirm the Website Studio route loads without redirecting to sign-in.
2. Verify Ready-made sites, Vibe Builder, and Website & Domain navigation.
3. Verify desktop and mobile preview sizing, spacing, overflow, and responsive breakpoints.
4. Verify required sections cannot be hidden and optional sections can be reordered or hidden.
5. Verify the IDX section is tenant-scoped and remains hidden unless explicitly connected.
6. Verify existing-site migration records only source URL/platform and shows a clear resumable status.
7. Check for dead links, legacy `/automations` paths, duplicate Website navigation, and inconsistent loading/error states.
8. Run tests, TypeScript, lint, and a production build. Report exact failures with file paths and line numbers.

## Current local implementation

Project root:
/Users/francomalagisi/.codex/.chatgpt-projects/g-p-6a478b535b808191863a7b4a75b3addf/agentstack

Key files:
- src/components/website-studio/website-studio-app.tsx
- src/components/website-studio/agent-site-renderer.tsx
- src/components/website-studio/site-structure-editor.tsx
- src/lib/website-studio/site-composition.ts
- src/components/dashboard/domain-connect.tsx
- docs/WEBSITE_STUDIO_ARCHITECTURE.md
- docs/adr/0001-puck-website-studio.md

Latest known verification: 143 Vitest tests pass and `git diff --check` passes. Production build verification still needs to be completed.

When the audit is complete, summarize findings, fixes, remaining risks, and exact verification results. Do not claim success without running the checks.
