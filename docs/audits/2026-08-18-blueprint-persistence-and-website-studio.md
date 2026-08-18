# AgentStack Blueprint Persistence and Website Studio Audit

Date: 2026-08-18

## Incident outcome

The Seamus Costigan Blueprint was not reset by the August 15 Website Studio
rebuild. The approved profile was later replaced by the Business Blueprint
public-profile import endpoint. That endpoint wrote an AI-generated review
draft directly into the permanent `businessProfile/main` Firestore document
before the operator selected **Save profile**.

This explains the observed sequence:

1. The operator completed and saved the profile.
2. A later Zillow import or retry generated a partial draft.
3. The import route persisted the partial draft immediately.
4. A later reload displayed the partial document and a lower completeness
   score, even though the draft had never been approved.

## Corrections

- Public-profile imports now return a review draft without writing it to
  Firestore.
- Only the explicit **Save profile** action may update the approved profile.
- Every explicit save atomically archives the previous approved document under
  `businessProfile/main/revisions` before updating the main document.
- The transient import-source URL is no longer returned as a recurring default
  or stored as the permanent business website.
- Saving removes the legacy `importSourceUrl` field.
- **Start over** now archives the current Blueprint and replaces only the
  Blueprint document with the empty schema. Contacts, conversations, domains,
  media, and every other sub-account collection are outside this operation.
- Directory profile links from Zillow, Realtor.com, and Homes.com cannot become
  the permanent Website field.
- Blueprint extraction uses a pinned structured-output model instead of the
  variable `openrouter/free` router.
- Malformed line output receives one bounded JSON retry.

## Verification

- Focused persistence/import/AI tests: 64 passed.
- ESLint: 0 errors (pre-existing warnings remain).
- Next.js production build: passed.
- Unpushed production verification build deployed successfully.
- Visual check on the intact 100% workspace after a hard reload:
  - AI import-source field starts blank.
  - Permanent Website field remains the approved business website.
- Visual check on the Seamus workspace after a hard reload:
  - AI import-source field starts blank.
  - Previously overwritten stored profile is still present at 75%, proving the
    issue is persistent data mutation rather than a client rendering failure.

## August 15 Website Studio research

The named `claude/website-studio-preview-mlys5i` ref is not present in the
current local or remote branch list. Its rebased work is traceable in main at:

- `1793dee` — Rebuild Website Studio and complete release assurance
- `7b56064` — Merge Website Studio SEO and design safeguards

The August 15 work changed Website Studio rendering, preview scaling, captured
CSS/transfer routes, release assurance, Puck integration, and onboarding
navigation. It did not change the Business Blueprint API or the
`businessProfile/main` storage path. The profile overwrite behavior was
introduced by later AI-assisted Business Blueprint import work.

## Live reset acceptance

The operator approved a clean-slate reset for only the Seamus Costigan
Business Blueprint. Production deployment `dpl_7jf2KtN284fFWojDLn9zCuPhfrcr`
was visually exercised in the authenticated installed app before updating
main.

1. The existing 75% Blueprint was archived with reason
   `operator_clean_slate_reset`.
2. The Blueprint was reset to 0%.
3. The AI import-source field was blank.
4. Permanent business fields displayed only empty placeholders, including the
   Website field; the Zillow directory URL was gone.
5. A hard reload retained the same 0% clean slate.

This is the requested starting point for rerunning the Blueprint onboarding
flow. The archived revision remains available for recovery if needed.
