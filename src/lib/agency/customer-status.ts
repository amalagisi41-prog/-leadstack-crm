/**
 * The customer-facing Status view: only connections the customer can make
 * themselves, in plain language, each with the action attached.
 *
 * Problems only the deployment operator can fix (a missing env var or secret,
 * a vendor service not configured on the server) produce NOTHING here — the
 * feature is simply left out, and the operator sees the cause in the
 * Internal view. No env-var names, secret names, vendor-internal service names,
 * "check server logs", or "launch blocked" wording may ever appear in these
 * strings (enforced by customer-status.test.tsx).
 */

export type CustomerStatusKind = "email" | "texting" | "social" | "listings";

/** What the server knows about one workspace, already reduced to booleans. */
export interface WorkspaceConnectionInputs {
  subAccountId: string;
  subAccountName: string;
  /** Email already sends for this workspace (shared sender or their own). */
  emailWorks: boolean;
  /** The customer can connect their own email account on this deployment. */
  emailConnectAvailable: boolean;
  /** Texting already works (shared number or their own). */
  textingWorks: boolean;
  /** Facebook/Instagram is part of their plan and connectable here. */
  socialOffered: boolean;
  socialConnected: boolean;
  /** Listings (IDX) is part of their plan. */
  listingsOffered: boolean;
  listingsConnected: boolean;
}

export interface CustomerStatusItem {
  id: string;
  kind: CustomerStatusKind;
  subAccountId: string;
  subAccountName: string;
  state: "connected" | "action";
  title: string;
  body: string;
  /** Present when state is "action": the button label and where it goes. */
  actionLabel?: string;
  /** Sub-account-relative path. */
  href?: string;
}

const CONNECT = "/connect";

export function buildCustomerStatus(workspaces: WorkspaceConnectionInputs[]): CustomerStatusItem[] {
  const items: CustomerStatusItem[] = [];
  for (const w of workspaces) {
    const base = { subAccountId: w.subAccountId, subAccountName: w.subAccountName };

    if (w.emailWorks) {
      items.push({ ...base, id: `${w.subAccountId}:email`, kind: "email", state: "connected", title: "Email sending", body: "Email is connected and ready to send." });
    } else if (w.emailConnectAvailable) {
      items.push({
        ...base,
        id: `${w.subAccountId}:email`,
        kind: "email",
        state: "action",
        title: "Email sending isn't connected yet",
        body: "Connect your email account to send campaigns, follow-ups and booking confirmations.",
        actionLabel: "Connect email",
        href: CONNECT,
      });
    }

    if (w.textingWorks) {
      items.push({ ...base, id: `${w.subAccountId}:texting`, kind: "texting", state: "connected", title: "Text messaging", body: "Texting is connected and ready." });
    } else {
      items.push({
        ...base,
        id: `${w.subAccountId}:texting`,
        kind: "texting",
        state: "action",
        title: "Text messaging isn't set up yet",
        body: "Connect a phone number to text leads and send automatic replies.",
        actionLabel: "Connect a phone number",
        href: CONNECT,
      });
    }

    if (w.socialOffered) {
      items.push(
        w.socialConnected
          ? { ...base, id: `${w.subAccountId}:social`, kind: "social", state: "connected", title: "Facebook & Instagram", body: "Your Facebook Page is connected." }
          : {
              ...base,
              id: `${w.subAccountId}:social`,
              kind: "social",
              state: "action",
              title: "Facebook & Instagram aren't connected yet",
              body: "Connect your Facebook Page to answer messages and schedule posts from AgentStack.",
              actionLabel: "Connect Facebook",
              href: CONNECT,
            },
      );
    }

    if (w.listingsOffered) {
      items.push(
        w.listingsConnected
          ? { ...base, id: `${w.subAccountId}:listings`, kind: "listings", state: "connected", title: "Listings", body: "Your listings are connected." }
          : {
              ...base,
              id: `${w.subAccountId}:listings`,
              kind: "listings",
              state: "action",
              title: "Your listings aren't connected yet",
              body: "Connect your listings so they appear on your website and in your marketing.",
              actionLabel: "Connect listings",
              href: CONNECT,
            },
      );
    }
  }
  return items;
}
