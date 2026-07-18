# Phase 1 Report — The AgentStack Method, end to end

This is the status report for Phase 1: turning AgentStack from "a CRM with an
AI bolted on" into a system that actually runs the AgentStack Method on a
subscriber's behalf — pre-built, guardrailed automations that fire the moment
a workspace exists, plus a layer that tells the operator what to do next
instead of making them go looking. It covers the Method Template Library, the
guardrail + testing infrastructure underneath it, and the recommendation
layer (morning brief, weekly digest, onboarding state machine) that surfaces
all of it.

Everything below is checked against the actual code in this branch, not
against a plan — every claim has a file path, a test, or both.

## 1. The Method Template Library

Four Method Templates ship as **active, editable Workflows** the moment a
sub-account is created — not documentation, not an opt-in gallery item the
operator has to discover. `src/lib/provisioning/method-templates.ts::seedMethodTemplates()`
is wired into every real workspace-creation path (`provisionNewAgency()` and
the sub-account "add another workspace" flow) and writes each one as a real
`workflows/{id}` doc with `templateKey` + `templateVersion` stamped, so a
workspace never gets the same template seeded twice and a future migration
pass can detect who's still on an older version.

| Template | Trigger | What it does |
|---|---|---|
| **New Lead → Instant Response** (`new-lead-instant-response`) | `form.submitted` | SMS + email within seconds of a new lead, escalation task if the message contains an urgent keyword |
| **Missed Call → Textback** (`missed-call-textback`) | `contact.missed_call` | Auto-texts a caller who didn't reach anyone, so a missed call isn't a lost lead |
| **Cold Lead 90-Day Revival** (`cold-lead-90-day-revival`) | `contact.stale` | Re-engages a contact nobody's touched in 90 days |
| **Post-Closing → Review Request** (`post-closing-review-request`) | `deal.completed` | Sends a Google review request once a deal closes |

Two triggers (`contact.missed_call`, `deal.completed`) didn't exist before
this phase — `contact.missed_call` is now fired from the Vapi end-of-call
webhook, and `deal.completed` replaced a one-off review-request hook that
lived directly in the deals API route (the old hook double-sent alongside
this template until it was migrated — see the friction log).

### The guardrail layer (`src/lib/workflows/guardrails.ts`)

Every send-type node (`send_sms`, `send_email`, `whatsapp_template`,
`google_review_request`) compiles through `compileGuardedSend()` at **send
time**, regardless of whether the workflow came from a Method Template, the
starter gallery, or an operator building from scratch. Three checks, in
order:

1. **Fair Housing content scan** — `checkFairHousing()` flags steering
   language and protected-class references in outbound copy.
2. **Escalation keywords** — a reply containing an escalation phrase blocks
   the automated send and routes to a human instead.
3. **Quiet hours** — `isSendGatedNodeType()` gates all four send types
   against the sub-account's configured send window, with a first-reply
   exemption for inbound-initiated conversations (a lead who just texted in
   gets an immediate reply even at 11pm; a cold-outreach send does not).

25 unit tests in `guardrails.test.ts` cover the checks directly, including
adversarial cases (borderline steering language, keyword-in-the-middle-of-a-
sentence escalation, exact-boundary quiet-hours timestamps).

### The lead-runner harness (`src/lib/workflows/lead-runner.test.ts`)

Rather than testing the guardrail functions in isolation, this harness walks
the **actual node graph** of each of the 4 shipped templates — the same
`nodes`/`next`/`branches` structure the runtime engine executes — via a
generic BFS (`walkNodes()`), finds every guarded send step, and runs it
through `compileGuardedSend()` with both a legitimate fake lead and an
escalation-keyword fake lead. 19 tests total, structured per-template:
template count/keys sanity check, "has at least one send step," "copy is
Fair-Housing-clean," "a normal lead passes," and either "escalation blocks
the first reply + later sends still respect quiet hours" (inbound-initiated
templates) or "every send is quiet-hours gated" (outbound-initiated).

This harness is what caught a real regression during this phase:
`google_review_request` was missing from `SEND_GATED_NODE_TYPES`, meaning
the post-closing template's actual send action bypassed quiet-hours and
escalation gating entirely. Fixed in `send-window.ts`.

### CI (`.github/workflows/ci.yml`)

Minimal, by design — typecheck, lint, full test suite, on every push and
every PR. No deploy step, no extra jobs. Runs on Node 22 (the pinned
`pnpm@11.6.0` requires ≥22.13; the workflow's first run failed hard against
Node 20 before this was corrected — see the friction log).

## 2. The recommendation layer

Phase 1's last piece: don't just run the Method automatically, tell the
operator what to look at next. Three additions, all landing without any new
visual design — every surface below reuses a component, page, or card that
already existed.

### `/middleware/briefing` — the AI morning brief

`compileMorningBrief()` (`middleware/briefing/compile.ts`) is a pure
function — no Firestore, no Admin SDK — that takes a snapshot of a
sub-account's day (quiet leads, new leads, escalated chats, overdue tasks,
today's appointments, recently-won deals) and returns the top 3 recommended
actions in strict priority order: escalated chat > overdue task (most
overdue first) > quiet lead (coldest first) > new lead > appointment
(earliest first). It also renders an SMS-ready summary (≤320 chars).

The server-only orchestrator (`src/lib/briefing/send.ts`) — the pre-existing
Daily Briefing email pipeline — now calls this compiler and folds its top 3
actions into the existing 7am email instead of running a second, competing
send. Snapshot-tested against three fixtures (busy morning, quiet day, an
overloaded 8-quiet-lead/5-new-lead/4-escalated/6-overdue/3-appointment case
that exercises the top-3 truncation).

One real bug the tests caught before it shipped: appointments were sorted by
their **display string** (`"4:00pm".localeCompare("9:00am")`), which sorts
wrong because `'4' < '9'` as characters even though 9am is earlier in the
day. Fixed by adding a real `minutesFromMidnight` sort key alongside the
display-only `timeLabel`.

### `/middleware/digest` — the weekly "Your AI employee" summary

`compileWeeklyDigest()` (`middleware/digest/compile.ts`) produces the
headline format requested — `"47 replies, 3 bookings, 2 leads revived"` —
plus an SMS-ready line and an `isEmpty` flag for quiet weeks. The
orchestrator (`src/lib/digest/send.ts`) counts, over a trailing 7-day
window: successful send-node executions across `workflowRuns` (replies),
booking-page-sourced calendar events (bookings), contacts newly enrolled
into the Cold Lead 90-Day Revival template (revived), and deals moved to
Won. All queries are single- or double-equality Firestore filters — no new
composite indexes needed, same reasoning already established for the
existing time-trigger sweep.

Delivery is a new weekly QStash schedule (`leadstack-weekly-digest`, Mondays
13:00 UTC) fanning out through `/api/cron/weekly-digest` → `/step`, deduped
via a new `SubAccountDoc.lastDigestSentAt` field, reusing the existing
`dailyBriefingEnabled` toggle as the opt-in — no new settings UI.

### Onboarding checklist state machine

`computeOnboardingState()` (`src/lib/onboarding/state-machine.ts`) is a pure
function mapping the 8 canonical onboarding-checklist step ids to the 6
"AgentStack Method" wizard screens, and derives — from one consistent scan —
both `nextWizardStepIndex` and `nextRecommendedAction`. This closed two real
gaps found while building it:

1. The onboarding wizard always restarted at screen 0 regardless of how much
   progress was already saved — a user who navigated away mid-setup lost
   their place entirely. It now resumes at the first incomplete screen.
2. The dashboard's `SetupProgressCard` computed "what's next" with its own
   hand-rolled logic that could disagree with the wizard's resume point
   (e.g. showing "Review your pipeline" as next while the wizard itself
   would resume at an earlier, still-incomplete screen). Both now read from
   the same state machine.

Exposed via `GET /api/sub-accounts/[id]/onboarding`. No new UI was added —
both consumers (the wizard, the dashboard card) already existed; only the
logic feeding them changed.

## 3. Test coverage

12 test files, 118 tests, all passing. `pnpm exec tsc --noEmit`, `pnpm lint`
(0 errors, 27 pre-existing warnings unrelated to this phase), and
`pnpm build` are all green as of the last commit on this branch.

## 4. What's tracked as a gap, not silently skipped

See [`docs/onboarding-friction.md`](./onboarding-friction.md) for the full
list with proposed fixes. The two with real product stakes:

- **SMS delivery for the morning brief / weekly digest** — both compilers
  produce a ready, tested `smsText`, but there's no stored personal phone
  number for an internal operator to send it to. Email delivery ships;
  SMS is a scoped follow-up once there's a field to hold the recipient.
- **`google_review_request` content isn't Fair-Housing-scanned** — its
  message body lives on `googleReviewConfig`, not the workflow node, so the
  guardrail layer gates it for quiet hours/escalation but can't scan text it
  doesn't have access to.

See [`HUMAN_ACTIONS.md`](../HUMAN_ACTIONS.md) for what a real buyer still
needs to do by hand before this goes live with paying leads — ordered by how
long each one takes to clear, with A2P 10DLC flagged as the critical path
(it has the longest external lead time of anything on the list and gates
real SMS delivery, which the entire Method Template Library depends on).
