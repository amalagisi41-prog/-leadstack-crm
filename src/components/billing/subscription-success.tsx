"use client";

import { useEffect, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { refreshSessionCookie } from "@/lib/firebase/auth";

export function SubscriptionSuccess() {
  const [message, setMessage] = useState("Confirming your AgentStack plan…");

  useEffect(() => {
    let canceled = false;
    let attempts = 0;
    async function confirm() {
      attempts += 1;
      const response = await fetch("/api/agency/billing", {
        credentials: "include",
      }).catch(() => null);
      if (canceled) return;
      const data = response
          ? ((await response.json().catch(() => ({}))) as {
            summary?: { subscriptionStatus?: string | null };
          })
        : {};
      const status = data.summary?.subscriptionStatus;
      if (response?.ok && (status === "active" || status === "trialing")) {
        const user = getFirebaseAuth().currentUser;
        if (user) await refreshSessionCookie(user);
        window.location.assign("/dashboard");
        return;
      }
      if (attempts < 12) {
        window.setTimeout(confirm, 2000);
      } else {
        setMessage(
          "Payment was received, but activation is taking longer than expected. Refresh this page in a minute.",
        );
      }
    }
    void confirm();
    return () => {
      canceled = true;
    };
  }, []);

  return (
    <div className="w-full max-w-lg rounded-3xl border border-[#E7DCC7] bg-white p-8 text-center shadow-xl">
      <h1 className="text-2xl font-bold text-[#173B7A]">Payment complete</h1>
      <p className="mt-3 text-sm leading-6 text-[#526078]">{message}</p>
    </div>
  );
}
