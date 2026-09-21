"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, FolderOpen, ImagePlus, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface MediaAsset {
  id: string;
  name: string;
  url: string;
  publicUrl?: string | null;
  brandAsset?: boolean;
  propertyId?: string | null;
  folderPath?: string | null;
  contentType: string;
  size: number;
  createdAt: string | null;
  updatedAt?: string | null;
}

type Props = {
  compact?: boolean;
  onSelect?: (asset: MediaAsset) => void;
};

export function MediaLibrary({ compact = false, onSelect }: Props) {
  const { subAccountId } = useSubAccount();
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [folderFilter, setFolderFilter] = useState("all");
  const [uploadFolder, setUploadFolder] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingFolder, setEditingFolder] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/media`);
      if (!res.ok) throw new Error(`Failed to load media library: ${res.status}`);
      const data = (await res.json()) as { assets?: MediaAsset[] };
      setAssets(data.assets ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load media library");
    } finally {
      setLoading(false);
    }
  }, [subAccountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const folders = useMemo(() => {
    const names = new Set<string>();
    for (const asset of assets) {
      if (asset.folderPath?.trim()) names.add(asset.folderPath.trim());
    }
    return ["all", ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [assets]);

  const grouped = useMemo(() => {
    const filtered = folderFilter === "all"
      ? assets
      : assets.filter((asset) => (asset.folderPath?.trim() || "General") === folderFilter);
    const groups = new Map<string, MediaAsset[]>();
    for (const asset of filtered) {
      const folder = asset.folderPath?.trim() || "General";
      groups.set(folder, [...(groups.get(folder) ?? []), asset]);
    }
    return [...groups.entries()];
  }, [assets, folderFilter]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      if (uploadFolder.trim()) body.append("folderPath", uploadFolder.trim());
      const res = await fetch(`/api/sub-accounts/${subAccountId}/media`, { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { asset?: MediaAsset; error?: string };
      if (!res.ok || !data.asset) throw new Error(data.error ?? "Upload failed.");
      setAssets((current) => [data.asset!, ...current]);
      onSelect?.(data.asset);
      toast.success(`${file.name} added to your media library.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function beginEdit(asset: MediaAsset) {
    setEditingId(asset.id);
    setEditingName(asset.name);
    setEditingFolder(asset.folderPath ?? "");
  }

  async function saveEdit() {
    if (!editingId) return;
    setBusyId(editingId);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/media`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: editingId,
          name: editingName,
          folderPath: editingFolder,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { asset?: MediaAsset; error?: string };
      if (!res.ok || !data.asset) throw new Error(data.error ?? "Could not update media asset.");
      setAssets((current) => current.map((asset) => asset.id === editingId ? data.asset! : asset));
      setEditingId(null);
      toast.success("Media asset updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update media asset.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAsset(asset: MediaAsset) {
    if (!window.confirm(`Delete "${asset.name}" from the Media Library? This cannot be undone.`)) return;
    setBusyId(asset.id);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/media?assetId=${encodeURIComponent(asset.id)}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not delete media asset.");
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      if (editingId === asset.id) setEditingId(null);
      toast.success("Media asset deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete media asset.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {!compact && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Media Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep approved logos, headshots, guides, documents, and property media organized in folders you control.
          </p>
        </div>
      )}

      {!compact && (
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Add to a folder</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Use names like &quot;Brand&quot;, &quot;Seller Guides&quot;, or a property address. Leaving this blank keeps the file in General.
              </p>
              <Input
                value={uploadFolder}
                onChange={(event) => setUploadFolder(event.target.value)}
                placeholder="Folder name"
                className="mt-2 max-w-md"
              />
            </div>
            <Button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </div>
        </div>
      )}

      {compact ? (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload
          </Button>
          <input ref={inputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }} />
        </div>
      ) : null}

      {!loading && assets.length > 0 && !compact && (
        <div className="flex flex-wrap gap-1.5">
          {folders.map((folder) => (
            <button
              key={folder}
              type="button"
              onClick={() => setFolderFilter(folder)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${folderFilter === folder ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
            >
              {folder === "all" ? "All folders" : folder}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex h-28 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : assets.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <ImagePlus className="mx-auto mb-2 h-6 w-6" />
          Your approved media will appear here.
        </div>
      ) : grouped.map(([folder, group]) => (
        <section key={folder} className="space-y-3">
          {!compact && (
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <div>
                <h2 className="text-sm font-semibold">{folder}</h2>
                <p className="text-xs text-muted-foreground">{group.length} asset{group.length === 1 ? "" : "s"}</p>
              </div>
            </div>
          )}
          <div className={`grid gap-3 ${compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"}`}>
            {group.map((asset) => (
              <div key={asset.id} className="overflow-hidden rounded-xl border bg-card">
                <button
                  type="button"
                  onClick={() => onSelect?.(asset)}
                  className="block w-full text-left"
                >
                  <div className="flex aspect-square items-center justify-center bg-muted/30">
                    {asset.contentType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asset.url} alt={asset.name} className="h-full w-full object-contain p-2" />
                    ) : (
                      <FileText className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <p className="truncate px-2 py-2 text-xs font-medium">{asset.name}</p>
                </button>
                {!compact && (
                  <div className="flex items-center gap-1 border-t px-2 py-2">
                    <Button type="button" size="sm" variant="ghost" className="flex-1" onClick={() => beginEdit(asset)} disabled={busyId === asset.id}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Edit / move
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void deleteAsset(asset)} disabled={busyId === asset.id} aria-label={`Delete ${asset.name}`}>
                      {busyId === asset.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                )}
                {!compact && editingId === asset.id && (
                  <div className="space-y-2 border-t bg-muted/20 p-2">
                    <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} placeholder="File name" />
                    <Input value={editingFolder} onChange={(event) => setEditingFolder(event.target.value)} placeholder="Folder name" />
                    <div className="flex justify-end gap-1">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={busyId === asset.id}>Cancel</Button>
                      <Button type="button" size="sm" onClick={() => void saveEdit()} disabled={busyId === asset.id}>
                        {busyId === asset.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                        Save
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
