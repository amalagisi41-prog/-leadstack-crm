import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { exchangeForLongLivedUserToken, listMetaPages } from "@/lib/comms/meta";
import { loadMetaSecrets, writeMetaSecrets } from "@/lib/comms/sub-account-secrets";
import type { MetaConfig } from "@/types/tenancy";

/**
 * Renews one sub-account's Meta (Facebook/Instagram) connection so it never
 * needs the operator to manually re-sign in. Fired weekly by the
 * "agentstack-meta-token-refresh" QStash schedule (see
 * lib/qstash/register-schedules.ts), well inside the ~60-day lifetime of the
 * long-lived user token, so there's always margin even if a run is skipped.
 *
 * Re-exchanges the STORED long-lived user token for a fresh one (Meta allows
 * this as long as the current one hasn't expired yet — that's what makes the
 * connection effectively permanent instead of a one-time 60-day grant), then
 * re-derives a fresh Page token from it and re-persists both.
 *
 * Never throws. On any failure it flips `metaConfig.needsReconnect = true` so
 * the settings card can say plainly "this connection needs to be refreshed"
 * instead of the operator discovering it via a silently failed send — see the
 * "no guessing" / "absence of evidence is never evidence of success" standard
 * in CLAUDE.md.
 */
export async function refreshMetaConnection(
  subAccountId: string,
): Promise<{ ok: boolean; reason: string }> {
  const db = getAdminDb();
  const parentRef = db.doc(`subAccounts/${subAccountId}`);

  async function flagNeedsReconnect(reason: string) {
    try {
      await parentRef.update({
        "metaConfig.needsReconnect": true,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.warn(
        `[meta-refresh] failed to flag needsReconnect sa=${subAccountId}`,
        err,
      );
    }
    return { ok: false, reason };
  }

  try {
    const snap = await parentRef.get();
    const cfg = snap.data()?.metaConfig as MetaConfig | undefined;
    if (!cfg?.connected || !cfg.pageId) {
      return { ok: false, reason: "not_connected" };
    }

    const secrets = await loadMetaSecrets(subAccountId);
    if (!secrets?.userAccessToken) {
      // A connection made before this feature existed only ever stored the
      // Page token, not the user token it's refreshed from — nothing to
      // re-exchange. Not an error worth alarming the operator over; the next
      // manual reconnect (or the existing "Reconnect" button) picks it up.
      return { ok: false, reason: "no_stored_user_token" };
    }

    const refreshed = await exchangeForLongLivedUserToken(
      secrets.userAccessToken,
    );
    const pages = await listMetaPages(refreshed.accessToken);
    const page = pages.find((p) => p.id === cfg.pageId);
    if (!page) {
      // The Page was unlinked, removed, or the token no longer has access to
      // it — a fresh reconnect is the only path back, so say so.
      return flagNeedsReconnect("page_not_found");
    }

    await writeMetaSecrets(subAccountId, {
      pageAccessToken: page.accessToken,
      userAccessToken: refreshed.accessToken,
      userTokenObtainedAt: Date.now(),
    });

    await parentRef.update({
      "metaConfig.tokenRefreshedAt": FieldValue.serverTimestamp(),
      "metaConfig.needsReconnect": FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { ok: true, reason: "refreshed" };
  } catch (err) {
    console.warn(`[meta-refresh] refresh failed sa=${subAccountId}`, err);
    return flagNeedsReconnect("refresh_error");
  }
}
