# AgentStack Software Licensing — Copy/Paste Draft

> Engineering/legal draft. Generate a complete SBOM and license inventory from the production lockfile before publishing a final notice.

## Product license

AgentStack is proprietary subscription software. Accessing or purchasing AgentStack does not transfer ownership of its software, source code, trademarks, designs, documentation, or platform technology. Customers receive only the limited right to access and use the hosted Service under the AgentStack Terms of Service.

## Customer website ownership

Customers retain ownership of original website content and assets they lawfully provide. AgentStack retains ownership of its platform, editor, schemas, reusable software components, templates, deployment systems, and underlying technology. Rights in third-party fonts, images, listing data, integrations, and software remain subject to their respective licenses and terms.

## Website imports

Customers may import or reproduce only content, code, media, fonts, and materials they own or are authorized to use. AgentStack may isolate or reject third-party scripts, tracking, forms, chat, IDX, analytics, or assets until ownership, security, licensing, privacy, and functional requirements are reviewed. Website migration does not transfer third-party licenses or provider accounts.

## AI-assisted output

Subject to provider terms and law, AgentStack does not claim ownership of customer prompts, source content, or customer-specific output merely because an AI-assisted feature processed it. Customers must review output and confirm they have the rights required for publication and use. AgentStack does not guarantee generated output is unique, accurate, non-infringing, or eligible for intellectual-property protection.

## Puck editor notice

AgentStack Website Studio uses @puckeditor/core, an open-source visual editor distributed under the MIT License. Puck operates as an editing interface over AgentStack-owned schemas and renderers; it is not the public website source of truth and does not receive ownership of customer content.

Puck copyright and license information: https://github.com/puckeditor/puck

## Component intake policy

No third-party design component may enter AgentStack's production registry without a provenance record containing its source, author, license, version or commit, dependencies, included assets and fonts, permitted use, accessibility result, security review, reviewer, and approval date. Discovery catalogs such as 21st.dev are references only. Generated or copied code undergoes the same review.

## Required release artifacts

- Production SBOM covering direct and transitive packages.
- License report generated from the locked production dependency graph.
- Preserved copyright and license notices where required.
- Review of copyleft, source-available, font, icon, image, map, and dataset terms.
- Vendor register for hosting, database, payments, communications, email, AI, analytics, maps, and support.
- Current data-processing terms for every processor handling Customer Data.
- Approval record for every Website Studio production component.

## Current Website Studio record

- @puckeditor/core version 0.23.0 is pinned and identified upstream as MIT-licensed.
- AgentStack owns its site model, renderer, publishing workflow, and rollback system.
- Vercel v0 is not a required production runtime or publishing control plane.
- 21st.dev is a discovery source, not an unrestricted production dependency.
- A formal SBOM, consolidated notice, vulnerability review, and component provenance remain release gates.
