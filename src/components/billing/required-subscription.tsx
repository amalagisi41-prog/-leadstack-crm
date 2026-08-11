"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { refreshSessionCookie } from "@/lib/firebase/auth";

export function RequiredSubscription() {
  const searchParams = useSearchParams();
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let canceled = false;
    async function recoverPaidCheckout() {
      try {
        const response = await fetch("/api/checkout/recover", {
          method: "POST",
          credentials: "include",
        });
        const data = (await response.json().catch(() => ({}))) as {
          recovered?: boolean;
        };
        if (canceled) return;
        if (response.ok && data.recovered) {
          const user = getFirebaseAuth().currentUser;
          if (user) await refreshSessionCookie(user);
          window.location.assign("/dashboard?payment=recovered");
          return;
        }
      } catch {
        // A recovery outage must not permanently block legitimate checkout.
      }
      if (!canceled) setRecovering(false);
    }
    void recoverPaidCheckout();
    return () => {
      canceled = true;
    };
  }, []);

  async function continueToCheckout() {
    setLoading(true);
    setError("");
    try {
      const idToken = await getFirebaseAuth().currentUser?.getIdToken();
      if (!idToken) {
        throw new Error("Your login is still loading. Refresh and try again.");
      }
      const response = await fetch("/api/checkout/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          planKey: "starter",
          billingInterval: interval,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Could not start secure checkout.");
      }
      window.location.assign(data.url);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not start checkout.",
      );
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-lg rounded-3xl border border-[#E7DCC7] bg-white p-7 shadow-xl">
      <p className="text-sm font-semibold tracking-[0.22em] text-[#DB4F9B] uppercase">
        Complete enrollment
      </p>
      <h1 className="mt-2 text-3xl font-bold text-[#173B7A]">
        Activate AgentStack Solo
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#526078]">
        {recovering
          ? "Checking Stripe for your completed payment before showing enrollment options…"
          : "Your login is ready. Choose billing and complete Stripe checkout to activate your workspace and begin setup."}
      </p>
      {searchParams.get("canceled") === "1" && (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Checkout was canceled. Your card was not charged and the workspace
          remains locked.
        </p>
      )}
      <div className="mt-6 grid grid-cols-2 rounded-xl bg-[#173B7A]/5 p-1">
        <button
          type="button"
          onClick={() => setInterval("month")}
          className={`rounded-lg px-3 py-2 text-sm font-medium ${interval === "month" ? "bg-white text-[#173B7A] shadow-sm" : "text-[#526078]"}`}
        >
          Monthly · $149
        </button>
        <button
          type="button"
          onClick={() => setInterval("year")}
          className={`rounded-lg px-3 py-2 text-sm font-medium ${interval === "year" ? "bg-white text-[#173B7A] shadow-sm" : "text-[#526078]"}`}
        >
          Annual · $1,188
        </button>
      </div>
      <p className="mt-4 text-sm text-[#526078]">
        Charged today. Includes one bonus month; automatic renewal begins
        {interval === "year" ? " in 13 months" : " in 2 months"} unless
        canceled.
      </p>
      <Button
        className="mt-6 w-full bg-[#173B7A] text-white hover:bg-[#244c8e]"
        onClick={continueToCheckout}
        disabled={loading || recovering}
      >
        {loading || recovering ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {recovering ? "Checking payment…" : "Opening secure checkout…"}
          </>
        ) : (
          "Continue to Stripe"
        )}
      </Button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <p className="mt-4 text-center text-xs text-[#7B8AA1]">
        Payment and stored card details are handled securely by Stripe.
      </p>
    </div>
  );
}
