"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, CheckCircle2, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import type { CalendarProvider } from "@/types/tenancy";

const PROVIDERS: Array<{
  id: CalendarProvider;
  label: string;
  description: string;
  path: string;
}> = [
  {
    id: "google",
    label: "Google Calendar",
    description: "Authorize AgentStack to work with your Google Calendar.",
    path: "google-oauth",
  },
  {
    id: "outlook",
    label: "Outlook Calendar",
    description: "Authorize AgentStack to work with your Microsoft calendar.",
    path: "outlook-oauth",
  },
];

export function SubAccountCalendarSyncSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const [connecting, setConnecting] = useState<CalendarProvider | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("calendar_oauth");
    const error = params.get("calendar_oauth_error");
    if (status === "success") {
      toast.success("Calendar connected successfully.");
    } else if (error) {
      toast.error(formatOAuthError(error));
    }
    if (status || error) {
      const url = new URL(window.location.href);
      url.searchParams.delete("calendar_oauth");
      url.searchParams.delete("calendar_oauth_error");
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  if (!isAdmin) return null;

  const connected = subAccount?.calendarConfig ?? null;

  async function connect(provider: (typeof PROVIDERS)[number]) {
    setConnecting(provider.id);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/calendar/${provider.path}`,
        { method: "POST" },
      );
      const data = (await response.json().catch(() => ({}))) as {
        authUrl?: string;
        error?: string;
      };
      if (!response.ok || !data.authUrl) {
        throw new Error(data.error ?? "Could not start calendar sign-in.");
      }
      window.location.assign(data.authUrl);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not start calendar sign-in.",
      );
      setConnecting(null);
    }
  }

  return (
    <section id="calendar-connection" className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
          <CalendarCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Calendar connection</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Connect your calendar with an authorized Google or Microsoft sign-in.
            No calendar URLs, passwords, or pasted credentials are required.
          </p>
        </div>
      </header>

      {connected ? (
        <div className="mb-4 flex items-start gap-3 rounded-lg border bg-background p-4">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {connected.provider === "google"
                ? "Google Calendar"
                : "Outlook Calendar"}{" "}
              connected
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {connected.email}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {PROVIDERS.map((provider) => (
          <div
            key={provider.id}
            className="rounded-lg border bg-background p-4"
          >
            <p className="text-sm font-medium">{provider.label}</p>
            <p className="mt-1 min-h-10 text-xs text-muted-foreground">
              {provider.description}
            </p>
            <Button
              type="button"
              className="mt-3 w-full"
              variant={connected?.provider === provider.id ? "outline" : "default"}
              disabled={connecting !== null}
              onClick={() => void connect(provider)}
            >
              {connecting === provider.id ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="mr-2 h-4 w-4" />
              )}
              {connected?.provider === provider.id ? "Reconnect" : "Sign in & connect"}
            </Button>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        AgentStack stores only the OAuth tokens needed for the connection in
        server-only storage. They are never placed on the member-readable
        sub-account document.
      </p>
    </section>
  );
}

function formatOAuthError(error: string): string {
  switch (error) {
    case "access_denied":
      return "Calendar authorization was cancelled.";
    case "not_configured":
      return "Calendar sign-in is not configured on this deployment.";
    case "refresh_token_missing":
      return "The calendar provider did not return a refresh token. Please try connecting again.";
    case "invalid_state":
      return "The calendar sign-in expired. Please try again.";
    case "unauthorized":
      return "Only an active sub-account admin can connect a calendar.";
    default:
      return "Calendar sign-in could not be completed. Please try again.";
  }
}
