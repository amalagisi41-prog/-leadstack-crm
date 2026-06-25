/**
 * Pure, client-safe helpers for reading what a stored Meta connection can do.
 * Kept OUT of `lib/comms/meta.ts` (which is `server-only` — Graph API calls)
 * so client components (settings card, Social Planner) can import them too.
 *
 * The single source of truth is `metaConfig.capabilities`, stamped at connect
 * time from the permissions Meta granted intersected with the agency gates.
 */

export interface MetaCapabilities {
  inbox: boolean;
  publish: boolean;
}

interface CapabilityCarrier {
  connected?: boolean;
  capabilities?: MetaCapabilities;
}

/**
 * Derive capabilities from the granted scope set, intersected with the gates
 * that were on. `inbox` needs `pages_messaging`; `publish` needs
 * `pages_manage_posts`. A gate being off forces its capability false.
 */
export function deriveMetaCapabilities(
  granted: Set<string>,
  gates: { inbox: boolean; publish: boolean },
): MetaCapabilities {
  return {
    inbox: gates.inbox && granted.has("pages_messaging"),
    publish: gates.publish && granted.has("pages_manage_posts"),
  };
}

/** True when the connection can use the inbox (legacy connections assumed yes). */
export function metaCanInbox(cfg: CapabilityCarrier | null | undefined): boolean {
  if (!cfg?.connected) return false;
  return cfg.capabilities ? cfg.capabilities.inbox : true;
}

/** True when the connection can publish (legacy connections must reconnect). */
export function metaCanPublish(
  cfg: CapabilityCarrier | null | undefined,
): boolean {
  return !!(cfg?.connected && cfg.capabilities?.publish);
}
