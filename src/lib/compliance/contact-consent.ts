/**
 * What may be sent to a contact, based on how AgentStack came to have them.
 *
 * The existing opt-out plumbing is sound: `emailOptedOut`, `smsOptedOut`, a
 * per-contact `smsConsent` audit record, and forms that default new contacts
 * to `smsOptedOut: true` when no consent box was ticked. That covers people
 * who arrived through a form.
 *
 * It does not cover the far more common onboarding case: an agent bringing a
 * contact list they have accumulated over years — a CSV, an old CRM export, a
 * mailbox. Those contacts arrive with no consent basis whatsoever, and the
 * import path records none. Nothing currently stops a brand-new operator from
 * loading two thousand of them and sending an SMS blast on day one.
 *
 * That is the single most expensive mistake available in this product. TCPA
 * statutory damages run $500–$1,500 per message, per recipient, and they are a
 * private right of action — a two-thousand-contact SMS blast to a list with no
 * express written consent is a seven-figure exposure, carried by the agent.
 * Email is far more forgiving, because CAN-SPAM permits sending to an existing
 * business relationship provided the message is honestly headed, identifies
 * the sender with a physical address, and honours unsubscribes.
 *
 * So the basis is recorded at import, and the channel gate is derived from it
 * rather than left to whoever is writing the campaign.
 *
 * This encodes the widely-documented shape of these rules so the product fails
 * safe. It is not legal advice and does not replace the operator's own counsel
 * — which is why the strictest reading is the default everywhere below.
 */

export type ConsentBasis =
  /** Ticked a consent box on a form, with a stored audit record. */
  | "express_written"
  /** A past client or active transaction — a real prior relationship. */
  | "existing_business_relationship"
  /** The operator typed them in themselves, one at a time. */
  | "manual_entry"
  /** Arrived in a bulk import with nothing known about permission. */
  | "imported_unknown";

export type Channel = "sms" | "email" | "voice" | "whatsapp";

export interface ConsentState {
  basis: ConsentBasis;
  emailOptedOut: boolean;
  smsOptedOut: boolean;
}

export interface SendVerdict {
  allowed: boolean;
  /** Shown to the operator when blocked — plain, and never scolding. */
  reason: string;
  /** What they can do to unblock it, when anything can. */
  remedy: string;
}

const OK: SendVerdict = { allowed: true, reason: "", remedy: "" };

/**
 * Whether a channel may be used for this contact.
 *
 * An explicit opt-out beats every basis, always and on every channel — that
 * check comes first and has no exceptions.
 */
export function canSendOn(channel: Channel, state: ConsentState): SendVerdict {
  if (channel === "email" && state.emailOptedOut) {
    return {
      allowed: false,
      reason: "This contact unsubscribed from your emails.",
      remedy: "They have to opt back in themselves. Nothing here can override it.",
    };
  }
  if (channel !== "email" && state.smsOptedOut) {
    return {
      allowed: false,
      reason: "This contact replied STOP or was never opted in to messages.",
      remedy: "They have to text back START themselves. Nothing here can override it.",
    };
  }

  switch (channel) {
    case "email":
      // CAN-SPAM does not require prior opt-in; it requires honesty and a
      // working unsubscribe, which the broadcast path already enforces.
      return OK;

    case "sms":
    case "voice":
    case "whatsapp":
      if (state.basis === "express_written") return OK;
      if (state.basis === "manual_entry") {
        return {
          allowed: false,
          reason:
            "This contact was added by hand, so there is no record of them agreeing to be texted.",
          remedy:
            "Send them an email or call them, and use a form with the consent box so the agreement is on record.",
        };
      }
      if (state.basis === "existing_business_relationship") {
        // A prior relationship is a defence for email, not for automated SMS.
        return {
          allowed: false,
          reason:
            "A past client relationship covers email, but texting still needs their explicit written agreement.",
          remedy:
            "Email them a link to your form with the text-message consent box. Once they tick it, texting is unlocked.",
        };
      }
      return {
        allowed: false,
        reason:
          "These contacts came from an import, so there is no record of anyone agreeing to be texted. Sending anyway carries a penalty of $500 to $1,500 per message, per person, and it lands on you rather than on AgentStack.",
        remedy:
          "Email them first — that is allowed — and include a link to your form with the consent box. Contacts who tick it become textable.",
      };
  }
}

/**
 * The default basis for contacts arriving through bulk import.
 *
 * Always the most restrictive value. An operator who knows the list is all
 * past clients can say so and upgrade it, but that has to be their stated
 * claim, on the record, rather than something the importer assumed for them.
 */
export const IMPORT_DEFAULT_BASIS: ConsentBasis = "imported_unknown";

export interface ImportConsentDeclaration {
  basis: ConsentBasis;
  /** Who said so, so there is an answer to "who decided this". */
  declaredByUid: string;
  declaredAt: string;
  /** The exact wording they agreed to. */
  statement: string;
}

/** What the operator must affirm to import a list as prior clients. */
export const EBR_DECLARATION_STATEMENT =
  "I confirm these contacts are past or current clients of my business, or people who enquired with me directly, and that I have a record of that relationship. I understand that texting them still requires their separate written agreement.";

/**
 * Disclosure that must appear in the message itself.
 *
 * Returned rather than assumed, because the requirement differs by channel:
 * SMS needs the opt-out instruction in the body, and email needs the sender's
 * physical postal address as well as an unsubscribe link.
 */
export function requiredDisclosures(
  channel: Channel,
  optOutLanguage: string
): string[] {
  const optOut = optOutLanguage.trim() || "Reply STOP to opt out.";
  switch (channel) {
    case "sms":
    case "whatsapp":
      return [
        "Sender identification — who this message is from",
        optOut,
      ];
    case "email":
      return [
        "A working unsubscribe link",
        "Your physical postal address",
        "A subject line that honestly describes the message",
      ];
    case "voice":
      return [
        "Identify yourself and your brokerage at the start of the call",
        "An opt-out mechanism if the call is automated or pre-recorded",
      ];
  }
}

/**
 * Whether a whole campaign may run against a segment.
 *
 * Counts rather than blocks: a list is rarely uniform, and refusing the entire
 * campaign because 40 of 2,000 contacts cannot be texted would be as unhelpful
 * as sending to all of them. The operator sees the split and decides.
 */
export interface SegmentConsentSummary {
  channel: Channel;
  sendable: number;
  blocked: number;
  /** Distinct reasons, so the operator can see what is actually wrong. */
  reasons: string[];
  /** Nothing can be sent — worth stopping before they write the campaign. */
  emptyAudience: boolean;
}

export function summariseSegment(
  channel: Channel,
  contacts: readonly ConsentState[]
): SegmentConsentSummary {
  let sendable = 0;
  const reasons = new Set<string>();

  for (const contact of contacts) {
    const verdict = canSendOn(channel, contact);
    if (verdict.allowed) sendable += 1;
    else reasons.add(verdict.reason);
  }

  return {
    channel,
    sendable,
    blocked: contacts.length - sendable,
    reasons: [...reasons],
    emptyAudience: contacts.length > 0 && sendable === 0,
  };
}
