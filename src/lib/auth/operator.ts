import "server-only";

/**
 * The deployment operator: whoever runs this AgentStack install, identified
 * by BOOTSTRAP_ADMIN_EMAIL (the same rule the /api/admin/* routes use).
 *
 * Every agency owner is a paying customer; only the operator may see raw
 * integration/configuration health (env-var presence, secret names, vendor
 * services). Customer surfaces never render that.
 */
export function isDeploymentOperatorEmail(email: string | null | undefined): boolean {
  const operator = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  return !!operator && !!email && email.trim().toLowerCase() === operator;
}
