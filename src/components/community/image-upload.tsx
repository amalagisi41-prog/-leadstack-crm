"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { uploadCommunityImage } from "@/lib/community/upload-image";
import { cn } from "@/lib/utils";

/**
 * Image upload field for a community group's cover / logo. Uploads straight to
 * Firebase Storage (staff are Firebase-authed) and hands the resulting public
 * URL back via `onChange`. Shows a preview with replace + remove. The parent
 * persists the URL on its normal Save.
 */
export function ImageUpload({
  label,
  hint,
  value,
  onChange,
  onUploadingChange,
  saId,
  groupId,
  kind,
  aspect = "video",
  disabled,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (url: string | null) => void;
  /** Fires true while a file is uploading — let the parent block Save until done. */
  onUploadingChange?: (uploading: boolean) => void;
  saId: string;
  groupId: string;
  kind: "cover" | "card" | "logo" | "course";
  /** "video" = 16:9 cover, "square" = logo. */
  aspect?: "video" | "square";
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const url = await uploadCommunityImage(file, saId, groupId, kind);
      onChange(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const box =
    aspect === "square" ? "h-24 w-24" : "aspect-video w-full max-w-sm";

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border border-dashed",
          box,
        )}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt={label}
              className="h-full w-full object-cover"
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                title="Remove image"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-muted/40 disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <ImagePlus className="h-5 w-5" />
                <span className="text-xs">Upload image</span>
              </>
            )}
          </button>
        )}
      </div>
      {value && !disabled && (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-60"
        >
          {uploading ? "Uploading…" : "Replace image"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
    </div>
  );
}
