/**
 * Which screens each guided setup pop-up shows for a given set of answers.
 * Kept free of React so the branching can be tested directly. Screens never
 * mark a step done themselves — the setup pill and Setup page read done-ness
 * from the connected account, so these only decide what to ask next.
 */

export type CommsFlowStepId =
  | "provider"
  | "which-email"
  | "google-connect"
  | "outlook-connect"
  | "has-twilio"
  | "twilio-form"
  | "no-twilio"
  | "later";

export function commsFlowStepIds(answers: Record<string, string>): CommsFlowStepId[] {
  const ids: CommsFlowStepId[] = ["provider"];
  const provider = answers.provider;
  if (!provider) return ids;

  let route = provider;
  if (provider === "unsure") {
    ids.push("which-email");
    const email = answers["which-email"];
    if (!email) return ids;
    route = email === "gmail" ? "google" : email === "outlook" ? "outlook" : "phone";
  }

  if (route === "phone") {
    ids.push("has-twilio");
    const hasTwilio = answers["has-twilio"];
    if (!hasTwilio) return ids;
    if (hasTwilio === "yes") return [...ids, "twilio-form"];
    ids.push("no-twilio");
    const fallback = answers["no-twilio"];
    if (!fallback) return ids;
    if (fallback === "later") return [...ids, "later"];
    route = fallback;
  }

  ids.push(route === "google" ? "google-connect" : "outlook-connect");
  return ids;
}

export type SocialFlowStepId =
  | "gate-off"
  | "has-page"
  | "create-page"
  | "has-instagram"
  | "switch-ig"
  | "connect"
  | "skip";

export function socialFlowStepIds(
  answers: Record<string, string>,
  gateOn: boolean,
): SocialFlowStepId[] {
  if (!gateOn) return ["gate-off"];
  const ids: SocialFlowStepId[] = ["has-page"];
  const hasPage = answers["has-page"];
  if (!hasPage) return ids;
  if (hasPage === "skip") return [...ids, "skip"];
  if (hasPage !== "yes") ids.push("create-page");
  ids.push("has-instagram");
  const instagram = answers["has-instagram"];
  if (!instagram) return ids;
  if (instagram === "personal" || instagram === "unsure") ids.push("switch-ig");
  ids.push("connect");
  return ids;
}
