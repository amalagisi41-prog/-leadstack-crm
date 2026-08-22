"use client";

import { useState } from "react";
import { Download, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface WebsiteImportDialogProps {
  subAccountId: string;
  onImportSuccess?: () => void;
}

/**
 * Dialog for importing an existing website domain.
 * User pastes their domain, we scrape it with Firecrawl, and create
 * a new website doc with the extracted config.
 */
export function WebsiteImportDialog({
  subAccountId,
  onImportSuccess,
}: WebsiteImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    const trimmed = domain.trim();
    if (!trimmed) {
      toast.error("Please enter a domain");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/website/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: trimmed }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        siteId?: string;
      };

      if (!res.ok) {
        throw new Error(payload.error ?? "Import failed");
      }

      toast.success(
        `Website imported from ${trimmed} — you can now edit and customize it.`
      );
      setDomain("");
      setOpen(false);
      onImportSuccess?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not import website"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Import existing site
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Import your website
          </DialogTitle>
          <DialogDescription>
            Paste your domain (e.g., example.com or https://example.com). We&apos;ll
            scrape your site&apos;s content and convert it to a Vibe Builder template
            you can customize.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder="example.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleImport();
            }}
          />
          <p className="text-xs text-muted-foreground">
            We use Firecrawl to scrape your site&apos;s main content. Public pages
            only. May take 30 seconds.
          </p>
        </div>

        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={loading || !domain.trim()}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {loading ? "Importing..." : "Import"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
