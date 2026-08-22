"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  X,
  Cloud,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DnsRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  ttl?: string;
  priority?: number;
  status?: string;
}

type EmailProvider = "resend" | "google";
type Step = "reply-to" | "provider-select" | "domain" | "dns-records" | "verify" | "google-connect" | "complete";

function CopyValue({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="bg-background flex-1 rounded px-2 py-1 text-xs break-all">
        {value}
      </code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={() => {
          void navigator.clipboard.writeText(value);
          toast.success("Copied");
        }}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  if (total === 0) return null;
  return (
    <div className="text-muted-foreground text-xs font-medium">
      Step {current} of {total}
    </div>
  );
}

export function EmailSetupWizardDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { subAccountId, subAccount } = useSubAccount();

  const cfg = subAccount?.resendConfig ?? null;
  const hasReplyTo = !!subAccount?.replyToEmail?.trim();
  const gateOpen = subAccount?.emailDomainEnabledByAgency === true;
  const googleConfig = subAccount?.googleWorkspaceConfig ?? null;

  const [step, setStep] = useState<Step>("reply-to");
  const [provider, setProvider] = useState<EmailProvider | null>(null);
  const [replyToEmail, setReplyToEmail] = useState(
    subAccount?.replyToEmail ?? ""
  );
  const [replyToSaving, setReplyToSaving] = useState(false);

  const [domainName, setDomainName] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromLocalPart, setFromLocalPart] = useState("");
  const [domainAdding, setDomainAdding] = useState(false);

  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [verifying, setVerifying] = useState(false);

  const [googleConnecting, setGoogleConnecting] = useState(false);

  const loadRecords = useCallback(async () => {
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/resend`);
      const data = (await res.json().catch(() => ({}))) as {
        records?: DnsRecord[];
      };
      if (Array.isArray(data.records)) setRecords(data.records);
    } catch {
      /* non-fatal */
    }
  }, [subAccountId]);

  useEffect(() => {
    if (!open) return;

    // Detect existing configuration
    if (cfg && cfg.status === "verified") {
      setProvider("resend");
      setStep("complete");
    } else if (googleConfig && googleConfig.status === "connected") {
      setProvider("google");
      setStep("complete");
    } else if (hasReplyTo && !cfg && !googleConfig) {
      if (gateOpen) {
        setStep("provider-select");
      }
    } else {
      setStep("reply-to");
    }
  }, [open, hasReplyTo, cfg, gateOpen, googleConfig]);

  async function handleReplyToSave(e: FormEvent) {
    e.preventDefault();
    setReplyToSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/reply-to`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyToEmail: replyToEmail }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        throw new Error(data.error ?? "Could not save.");
      }
      toast.success("Reply-To address saved");
      // Auto-advance if gate is open
      if (gateOpen) {
        setStep("provider-select");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setReplyToSaving(false);
    }
  }

  async function handleAddDomain(e: FormEvent) {
    e.preventDefault();
    setDomainAdding(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domainName: domainName.trim(),
          fromName: fromName.trim() || undefined,
          fromLocalPart: fromLocalPart.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        records?: DnsRecord[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to add the domain.");
      }
      setRecords(data.records ?? []);
      toast.success("Domain registered. DNS records shown next.");
      setStep("dns-records");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add domain.");
    } finally {
      setDomainAdding(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/resend/verify`,
        { method: "POST" }
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        status?: string;
        records?: DnsRecord[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Verification failed.");
      }
      if (Array.isArray(data.records)) setRecords(data.records);
      if (data.status === "verified") {
        toast.success("Domain verified!");
        setStep("complete");
      } else {
        toast.info(
          "Not verified yet. DNS can take 5-15 minutes to propagate. Try again shortly."
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleGoogleConnect() {
    setGoogleConnecting(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/email/google-oauth`,
        { method: "POST" }
      );
      const data = (await res.json().catch(() => ({}))) as {
        authUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.authUrl) {
        throw new Error(data.error ?? "Failed to initiate Google OAuth.");
      }
      // Redirect to Google OAuth
      window.location.href = data.authUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to connect Google.");
      setGoogleConnecting(false);
    }
  }

  if (!open) return null;

  const getHeaderDescription = () => {
    if (step === "reply-to") return "Set your reply-to address first";
    if (step === "provider-select") return "Choose how you want to send emails";
    if (provider === "google") return "Quick setup via Google Workspace";
    return "Configure your custom domain";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card w-full max-w-lg rounded-lg border shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-6">
          <div>
            <h2 className="text-lg font-semibold">Set Up Business Email</h2>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {getHeaderDescription()}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="space-y-6 p-6">
          {/* Step 1: Reply-To Email */}
          {step === "reply-to" && (
            <>
              <StepIndicator current={1} total={3} />
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium">Set your Reply-To address</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    This is where email replies will go. We recommend using your
                    work email address.
                  </p>
                </div>
                <form onSubmit={handleReplyToSave} className="space-y-3">
                  <div>
                    <Label htmlFor="reply-to-email" className="text-xs">
                      Your email address
                    </Label>
                    <Input
                      id="reply-to-email"
                      type="email"
                      value={replyToEmail}
                      onChange={(e) => setReplyToEmail(e.target.value)}
                      placeholder="you@yourbrokerage.com"
                      required
                      className="mt-1"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={replyToSaving || !replyToEmail.trim()}
                  >
                    {replyToSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      "Continue"
                    )}
                  </Button>
                </form>
              </div>
            </>
          )}

          {/* Step 2: Provider Selection */}
          {step === "provider-select" && (
            <>
              <StepIndicator current={2} total={0} />
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div className="text-xs text-emerald-700 dark:text-emerald-400">
                    <p className="font-medium">Reply-To saved</p>
                    <p className="mt-0.5">Replies will go to {replyToEmail}</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium">Choose your email provider</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Pick the quickest option for your team
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Resend Option */}
                  <button
                    onClick={() => {
                      setProvider("resend");
                      setStep("domain");
                    }}
                    className="w-full text-left p-4 border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <div className="font-medium text-sm">Resend Custom Domain</div>
                    <p className="text-muted-foreground text-xs mt-1">
                      Add your own domain via DNS records. Full control, professional setup.
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">~3 steps · 5-15 min setup</p>
                  </button>

                  {/* Google Workspace Option */}
                  <button
                    onClick={() => {
                      setProvider("google");
                      setStep("google-connect");
                    }}
                    className="w-full text-left p-4 border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Cloud className="h-4 w-4" />
                      <span className="font-medium text-sm">Google Workspace</span>
                    </div>
                    <p className="text-muted-foreground text-xs mt-1">
                      Quick OAuth setup if you use Google Workspace. Email from your Workspace domain.
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">Quick · 1 click to authorize</p>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Step 3: Domain (Resend Path) */}
          {step === "domain" && (
            <>
              <StepIndicator current={3} total={5} />
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div className="text-xs text-emerald-700 dark:text-emerald-400">
                    <p className="font-medium">Reply-To saved</p>
                    <p className="mt-0.5">Replies will go to {replyToEmail}</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium">Add your sending domain</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Use a subdomain like mail.yourdomain.com to keep your main
                    domain&apos;s reputation safe.
                  </p>
                </div>

                <form onSubmit={handleAddDomain} className="space-y-3">
                  <div>
                    <Label htmlFor="domain-name" className="text-xs">
                      Sending subdomain
                    </Label>
                    <Input
                      id="domain-name"
                      value={domainName}
                      onChange={(e) => setDomainName(e.target.value)}
                      placeholder="mail.yourdomain.com"
                      autoComplete="off"
                      spellCheck={false}
                      required
                      className="mt-1"
                    />
                    <p className="text-muted-foreground mt-1 text-xs">
                      Must be a subdomain you own and can add DNS records for
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="from-name" className="text-xs">
                        From name (optional)
                      </Label>
                      <Input
                        id="from-name"
                        value={fromName}
                        onChange={(e) => setFromName(e.target.value)}
                        placeholder={subAccount?.name ?? "Your business"}
                        autoComplete="off"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="from-local" className="text-xs">
                        Send-from mailbox
                      </Label>
                      <Input
                        id="from-local"
                        value={fromLocalPart}
                        onChange={(e) => setFromLocalPart(e.target.value)}
                        placeholder="hello"
                        autoComplete="off"
                        spellCheck={false}
                        className="mt-1"
                      />
                      <p className="text-muted-foreground text-xs mt-1">
                        The part before the @. Defaults to hello.
                      </p>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={domainAdding || !domainName.trim()}
                  >
                    {domainAdding ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Registering…
                      </>
                    ) : (
                      "Add domain & next"
                    )}
                  </Button>
                </form>
              </div>
            </>
          )}

          {/* Step 4: DNS Records */}
          {step === "dns-records" && cfg && (
            <>
              <StepIndicator current={4} total={5} />
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="text-xs text-amber-700 dark:text-amber-400">
                    <p className="font-medium">Add these DNS records</p>
                    <p className="mt-1">
                      Go to your domain registrar (GoDaddy, Cloudflare, Route53,
                      etc.) and add these records to prove you own the domain.
                    </p>
                  </div>
                </div>

                {records.length > 0 && (
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {records.map((r, i) => (
                      <div
                        key={`${r.type}-${r.name}-${i}`}
                        className="bg-muted/30 space-y-2 rounded-lg border p-3"
                      >
                        <div className="text-foreground flex items-center gap-2 text-xs font-medium">
                          <span className="bg-background rounded px-1.5 py-0.5 uppercase tracking-wide">
                            {r.type}
                          </span>
                          {typeof r.priority === "number" && (
                            <span className="text-muted-foreground">
                              priority {r.priority}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-muted-foreground text-xs">Name</p>
                          <CopyValue value={r.name} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-muted-foreground text-xs">Value</p>
                          <CopyValue value={r.value} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
                    💡 Pro tip
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-300">
                    DNS changes typically propagate within 5-15 minutes, but can
                    sometimes take up to 48 hours. Click Verify when you&apos;ve added
                    the records.
                  </p>
                </div>

                <Button
                  type="button"
                  className="w-full"
                  disabled={verifying}
                  onClick={handleVerify}
                >
                  {verifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking DNS…
                    </>
                  ) : (
                    "I've added the DNS records — Verify"
                  )}
                </Button>
              </div>
            </>
          )}

          {/* Step 2: Google Workspace Connect (Google Path) */}
          {step === "google-connect" && (
            <>
              <StepIndicator current={2} total={3} />
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div className="text-xs text-emerald-700 dark:text-emerald-400">
                    <p className="font-medium">Reply-To saved</p>
                    <p className="mt-0.5">Replies will go to {replyToEmail}</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium">Connect your Google Workspace</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Authorize AgentStack to send emails from your Google Workspace account.
                  </p>
                </div>

                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
                    What happens next
                  </p>
                  <ul className="text-xs text-blue-600 dark:text-blue-300 space-y-1 list-disc list-inside">
                    <li>You&apos;ll be redirected to Google to authorize</li>
                    <li>We&apos;ll store your authorization securely</li>
                    <li>Your emails will send from your Workspace domain</li>
                  </ul>
                </div>

                <Button
                  onClick={handleGoogleConnect}
                  disabled={googleConnecting}
                  className="w-full"
                >
                  {googleConnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting…
                    </>
                  ) : (
                    <>
                      <Cloud className="mr-2 h-4 w-4" />
                      Connect with Google
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setStep("provider-select")}
                  disabled={googleConnecting}
                  className="w-full"
                >
                  Back
                </Button>
              </div>
            </>
          )}

          {/* Complete */}
          {step === "complete" && ((cfg && cfg.status === "verified") || (googleConfig && googleConfig.status === "connected")) && (
            <>
              <div className="text-center space-y-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/10">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-semibold">Business email is ready!</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Your sub-account now sends from
                    <br />
                    <span className="text-foreground font-medium">
                      {provider === "google" && googleConfig
                        ? googleConfig.senderEmail
                        : cfg?.emailFrom ?? "your domain"}
                    </span>
                  </p>
                </div>

                <div className="bg-muted/30 rounded-lg border p-3 text-xs space-y-2">
                  <p className="font-medium">What&apos;s next?</p>
                  <ul className="space-y-1 text-left text-muted-foreground">
                    <li>✓ Send emails from your domain</li>
                    <li>✓ Build automations with replies</li>
                    <li>✓ Send broadcasts to your list</li>
                  </ul>
                </div>

                <Button
                  className="w-full"
                  onClick={() => onOpenChange(false)}
                >
                  Done
                </Button>
              </div>
            </>
          )}

          {/* Not gate open */}
          {!gateOpen && step !== "reply-to" && (
            <div className="space-y-4 rounded-lg border border-dashed p-4 text-center">
              <p className="text-sm font-medium">Feature locked</p>
              <p className="text-muted-foreground text-sm">
                Ask your agency owner to enable business email domain setup for
                this sub-account.
              </p>
              <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
