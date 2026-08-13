"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, ImagePlus, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";

export interface MediaAsset { id: string; name: string; url: string; contentType: string; size: number; createdAt: string | null }

export function MediaLibrary({ compact = false, onSelect }: { compact?: boolean; onSelect?: (asset: MediaAsset) => void }) {
  const { subAccountId } = useSubAccount();
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sub-accounts/${subAccountId}/media`);
    const data = await res.json() as { assets?: MediaAsset[] };
    setAssets(data.assets ?? []); setLoading(false);
  }, [subAccountId]);
  useEffect(() => { void load(); }, [load]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData(); body.append("file", file);
      const res = await fetch(`/api/sub-accounts/${subAccountId}/media`, { method: "POST", body });
      const data = await res.json() as { asset?: MediaAsset; error?: string };
      if (!res.ok || !data.asset) throw new Error(data.error ?? "Upload failed.");
      setAssets((current) => [data.asset!, ...current]); onSelect?.(data.asset);
      toast.success(`${file.name} added to your media library.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Upload failed."); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  return <div className="space-y-4">
    {!compact && <div><h1 className="text-2xl font-bold tracking-tight">Media Library</h1><p className="mt-1 text-sm text-muted-foreground">One place for approved logos, headshots, guides, and documents used throughout AgentStack.</p></div>}
    <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4">
      <div><p className="text-sm font-semibold">Upload once, use everywhere</p><p className="text-xs text-muted-foreground">JPG, PNG, WebP, GIF, SVG, or PDF · up to 10 MB</p></div>
      <Button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Upload</Button>
      <input ref={inputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { const file=e.target.files?.[0]; if(file) void upload(file); }} />
    </div>
    {loading ? <div className="flex h-28 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : assets.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground"><ImagePlus className="mx-auto mb-2 h-6 w-6" />Your approved media will appear here.</div> : <div className={`grid gap-3 ${compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"}`}>{assets.map((asset) => <button key={asset.id} type="button" onClick={() => onSelect?.(asset)} className="overflow-hidden rounded-xl border bg-card text-left transition hover:border-blue-400 hover:ring-2 hover:ring-blue-500/10">
      <div className="flex aspect-square items-center justify-center bg-muted/30">{asset.contentType.startsWith("image/") ? (
        // Remote user uploads do not have a fixed host or intrinsic dimensions.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.url} alt={asset.name} className="h-full w-full object-contain p-2" />
      ) : <FileText className="h-8 w-8 text-muted-foreground" />}</div>
      <p className="truncate px-2 py-2 text-xs font-medium">{asset.name}</p>
    </button>)}</div>}
  </div>;
}
