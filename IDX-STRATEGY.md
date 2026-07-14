# IDX Strategy — compliance model, service opportunity, and positioning

> This doc captures a business decision made outside the codebase (a conversation about the operator's own IDX Broker account and how it does/doesn't relate to AgentStack as a product). It exists so the reasoning survives past one chat session. See [PRODUCT.md](PRODUCT.md) for overall product vision; this doc is scoped narrowly to IDX.

## The compliance model — why AgentStack can never be "one IDX feed serving every subscriber"

An IDX Broker (or any MLS IDX vendor) account is not a license to a product — it's an authorization tied to **one broker's MLS participation**, displayed on **that broker's/agent's own site**. Two hard walls follow from that:

1. **Per-MLS data wall (technical).** An IDX account only pulls listings for the MLS(s) its broker participates in. A subscriber in a different market needs a feed from *their* MLS — one account physically cannot serve listings it was never provisioned to pull.
2. **Participant boundary (compliance).** Even "multi-user/office" IDX plans only extend to agents under the *same* participating broker. There's no tier that lets one broker's authorization cover unaffiliated agents at other brokerages. Sharing one feed across independent AgentStack subscribers would mean one broker's MLS participation powering other brokers' sites — which IDX participation rules don't allow.

**What this rules out:** AgentStack acting as an MLS data provider itself (one shared feed, or reselling/provisioning IDX Broker accounts on subscribers' behalf). That's the path the big incumbents (kvCORE, BoomTown, Real Geeks) took — it requires direct data relationships with hundreds of individual MLSs, which is a massive cost/legal surface for a lean product. Their moat here is a liability we deliberately don't take on.

**What this confirms:** the architecture already built (see "IDX Listings (IDX Broker) — realtor MLS search, v1" in the engineering plan history) is the *only* compliant shape — **each subscriber connects their own IDX Broker account** (their own key, tied to their own broker's MLS participation). AgentStack is the pipe, never the data source. This is a constraint to keep, not a gap to fix.

## The real opportunity: sell the *setup*, not the *data*

The wall above is about **data**, not about **helping agents get and run their own IDX**. That second thing is wide open and is the actual wedge:

### 1. "Done-for-you" IDX concierge onboarding (build this — no licensing needed)

What agents hate about IDX isn't the cost, it's the setup: getting the broker to sign the MLS participation form, signing up with a vendor, generating an API key, wiring it up correctly, configuring lead routing and disclaimers correctly. AgentStack's whole existing promise — the onboarding wizard, the Business Blueprint, AI persona generation — is "we do the annoying setup for you." IDX concierge onboarding is that same promise applied to the step agents dread most. Charge a one-time setup fee, or bundle into a tier. Pure services margin, zero data-licensing exposure, and it's the exact muscle this product already flexes everywhere else.

**Future build direction:** a guided "Get your IDX connected" flow — either a self-serve wizard that walks the agent through the IDX Broker signup + key-generation steps with inline instructions, or an actual concierge/white-glove service where an AgentStack team member does it for them and the agent just pastes in the resulting key. Both are compatible with the existing bring-your-own-key architecture; this is UX/service layered on top, not a new data model.

### 2. IDX Broker affiliate/referral program (verify before building on it)

IDX Broker is now under Elm Street Technology (iHomefinder). Vendors in this space have historically run partner/referral programs — refer an agent, they sign up on their own account, AgentStack earns a referral commission, and AgentStack is the one who wires that account in (via the concierge flow above). This is fully compliant since each agent still holds their own MLS authorization — nothing shared.

**Status: unconfirmed.** Current commission terms, eligibility, and program existence need to be verified directly with Elm Street's partnerships team before this is treated as a real revenue line or promised anywhere in marketing copy. Worth a direct outreach call. If a program exists, layer it under the concierge onboarding flow above (same UX, an affiliate link/code in the background).

## Positioning — how this differentiates from competitors

Competitors' pitch is "use *our* IDX" — locking the agent into their feed, their market coverage, their rules. AgentStack's pitch is the opposite:

- **Vendor-agnostic, and it's yours.** *"Your listings, your MLS, your compliance — we just make it effortless."* The agent owns their own setup instead of renting AgentStack's.
- **Ease as the product, not a feature.** Competitors bury IDX as a checkbox in a long setup flow. AgentStack leads with *"Connect your IDX in one step — or we'll set the whole thing up for you."*
- **Concierge as the brand story.** The AI Business Blueprint, the guided onboarding wizard, and done-for-you IDX setup are all the same narrative: *AgentStack removes the technical work so agents can just sell.* Every competitor makes the agent feel like an IT admin; AgentStack makes them feel like their business runs itself.

**The line to sell:** *AgentStack doesn't sell IDX — it sells never having to think about IDX.*

## Explicitly out of scope

- AgentStack becoming an MLS data provider / holding its own MLS participant agreements.
- Any shared-feed model where one IDX Broker account serves multiple unaffiliated subscribers.
- Promising affiliate/referral economics before Elm Street's program terms are actually confirmed.
