import type { Unsubscribe } from "firebase/firestore";

// Stub — the real live-visitor heartbeat code is LeadStack-marketing-
// specific (Mapbox world map on /agency/landing). Type shape preserved so
// any importer still compiles; the subscribe function returns a no-op
// unsubscribe and never invokes the callback.

export type LiveVisitorState = "browsing" | "buy-clicked" | "purchased";

export interface LiveVisitor {
  id: string;
  state: LiveVisitorState;
  lat: number | null;
  lng: number | null;
  city: string | null;
  country: string | null;
  heroVariant: string | null;
  expiresAt: number;
  lastSeenAt: number;
}

export function subscribeToLiveVisitors(
  _callback: (visitors: LiveVisitor[]) => void,
  _onError?: (err: Error) => void,
): Unsubscribe {
  return () => {};
}
