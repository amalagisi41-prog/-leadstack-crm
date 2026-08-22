"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  Sparkles,
  Check,
  AlertCircle,
  Chrome,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BusinessProfileContent } from "@/types/business-profile";

interface GoogleProfileImport {
  success: boolean;
  profile?: Partial<BusinessProfileContent>;
  completeness?: number;
  source?: string;
  error?: string;
  code?: string;
}

interface GoogleOAuthImportProps {
  onProfileImported: (profile: Partial<BusinessProfileContent>) => void;
  isConnected?: boolean;
}

export function GoogleOAuthImport({
  onProfileImported,
  isConnected = false,
}: GoogleOAuthImportProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { subAccountId } = useSubAccount();

  const [isLoading, setIsLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<GoogleProfileImport | null>(
    null
  );
  const [connected, setConnected] = useState(isConnected);

  // Handle OAuth callback
  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      toast.error(
        `Google authorization failed: ${error}. Try again or use another import method.`
      );
      router.replace(window.location.pathname);
      return;
    }

    if (code) {
      handleOAuthCallback(code);
    }
  }, [searchParams, router, onProfileImported]);

  async function initiateOAuthFlow() {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/business-profile/import-google`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || "Failed to initiate Google OAuth flow"
        );
      }

      const data = await response.json();
      if (data.authUrl) {
        // Redirect to Google OAuth
        window.location.href = data.authUrl;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "OAuth flow failed";
      toast.error(message);
      setIsLoading(false);
    }
  }

  async function handleOAuthCallback(code: string) {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/business-profile/import-google?code=${code}&state=${code}`,
        {
          method: "GET",
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || "Failed to fetch Google Business Profile"
        );
      }

      const data: GoogleProfileImport = await response.json();

      if (data.success && data.profile) {
        setPreviewData(data);
        setPreviewOpen(true);
        setConnected(true);
        toast.success(
          `Google Business Profile connected (${data.completeness}% complete)`
        );
      } else {
        throw new Error(
          data.error || "Failed to extract profile from Google"
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not import from Google Business Profile";
      toast.error(message);
    } finally {
      setIsLoading(false);
      router.replace(window.location.pathname);
    }
  }

  function handleConfirmImport() {
    if (previewData?.profile) {
      onProfileImported(previewData.profile);
      setPreviewOpen(false);
      toast.success("Google Business Profile imported. Review before saving.");
    }
  }

  function handleDisconnect() {
    setConnected(false);
    setPreviewData(null);
    toast.info("Google connection cleared");
  }

  return (
    <>
      {/* Google OAuth Button */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900 dark:bg-blue-950/30">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Chrome className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold">
                Import from Google Business Profile
              </h3>
              {connected && (
                <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                  <Check className="h-3 w-3" />
                  Connected
                </span>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Sign in with your Google account to securely import your Business
              Profile data. AgentStack reads what you&apos;ve already verified on
              Google and prefills your Blueprint.
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={initiateOAuthFlow}
            disabled={isLoading}
            variant={connected ? "outline" : "default"}
            size="sm"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Chrome className="mr-2 h-4 w-4" />
            )}
            {connected ? "Reconnect" : "Connect with Google"}
          </Button>

          {connected && previewData && (
            <>
              <Button
                type="button"
                onClick={() => setPreviewOpen(true)}
                variant="outline"
                size="sm"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Review imported data
              </Button>
              <Button
                type="button"
                onClick={handleDisconnect}
                variant="ghost"
                size="sm"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Google Business Profile Preview</DialogTitle>
            <DialogDescription>
              Review the data extracted from your Google Business Profile.
              Click &quot;Import&quot; to add it to your Blueprint draft.
            </DialogDescription>
          </DialogHeader>

          {previewData && (
            <div className="space-y-4">
              {/* Completeness indicator */}
              <div className="rounded-lg border bg-muted/50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-medium">
                    Profile completeness
                  </span>
                  <span className="font-semibold">{previewData.completeness}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${previewData.completeness}%` }}
                  />
                </div>
              </div>

              {/* Profile fields */}
              <div className="space-y-3">
                {previewData.profile?.agentName && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Your name
                    </label>
                    <p className="text-sm font-medium">
                      {previewData.profile.agentName}
                    </p>
                  </div>
                )}

                {previewData.profile?.brokerage && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Brokerage
                    </label>
                    <p className="text-sm font-medium">
                      {previewData.profile.brokerage}
                    </p>
                  </div>
                )}

                {previewData.profile?.phone && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Phone
                    </label>
                    <p className="text-sm font-medium">
                      {previewData.profile.phone}
                    </p>
                  </div>
                )}

                {previewData.profile?.email && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Email
                    </label>
                    <p className="text-sm font-medium">
                      {previewData.profile.email}
                    </p>
                  </div>
                )}

                {previewData.profile?.website && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Website
                    </label>
                    <p className="text-sm font-medium">
                      {previewData.profile.website}
                    </p>
                  </div>
                )}

                {previewData.profile?.serviceAreas && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Service areas
                    </label>
                    <p className="text-sm font-medium">
                      {previewData.profile.serviceAreas}
                    </p>
                  </div>
                )}

                {previewData.profile?.businessHours && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Business hours
                    </label>
                    <p className="text-sm font-medium">
                      {previewData.profile.businessHours}
                    </p>
                  </div>
                )}

                {previewData.profile?.bio && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Bio
                    </label>
                    <p className="text-sm font-medium">
                      {previewData.profile.bio}
                    </p>
                  </div>
                )}
              </div>

              {/* Info box */}
              <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900 dark:bg-blue-950/20">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  This is a draft. You can edit any field before saving to your
                  Blueprint.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleConfirmImport}>
                  Import to Blueprint
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
