"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Camera, Loader2 } from "lucide-react";

const BIO_MAX = 300;

export function ProfileEditor({
  saId,
  groupSlug,
  initial,
  brand,
}: {
  saId: string;
  groupSlug: string;
  initial: {
    displayName: string;
    avatarUrl: string | null;
    bio: string;
    email: string;
  };
  brand: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/community/${saId}/avatar`, {
        method: "POST",
        body: fd,
      });
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        error?: string;
      };
      if (!res.ok || !d.ok || !d.url) throw new Error(d.error ?? "Upload failed");
      setAvatarUrl(d.url);
      toast.success("Photo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/community/${saId}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, bio }),
      });
      if (!res.ok) throw new Error();
      toast.success("Profile saved");
      router.refresh();
    } catch {
      toast.error("Couldn't save profile");
    } finally {
      setSaving(false);
    }
  }

  const initialLetter = (displayName || initial.email).charAt(0).toUpperCase();

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <Link
        href={`/c/${saId}/${groupSlug}/community`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to community
      </Link>

      <div className="rounded-xl border border-[#E4E4E4] bg-white p-6">
        <h1 className="text-xl font-semibold text-[#202124]">Your profile</h1>

        <div className="mt-5 flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="group relative h-20 w-20 overflow-hidden rounded-full"
            title="Change photo"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span
                className="flex h-full w-full items-center justify-center text-2xl font-semibold text-white"
                style={{ backgroundColor: brand }}
              >
                {initialLetter}
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Camera className="h-5 w-5" />
              )}
            </span>
          </button>
          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-sm font-medium text-[#202124] underline-offset-2 hover:underline disabled:opacity-60"
            >
              {uploading ? "Uploading…" : "Change photo"}
            </button>
            <p className="text-xs text-[#909090]">JPG, PNG or GIF, under 5 MB.</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </div>

        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#202124]">
              Display name
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              placeholder="Your name"
              className="h-10 w-full rounded-md border border-[#E4E4E4] bg-white px-3 text-sm text-[#202124] outline-none placeholder:text-[#909090]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#202124]">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              maxLength={BIO_MAX}
              rows={3}
              placeholder="Tell the community a bit about you."
              className="w-full resize-none rounded-md border border-[#E4E4E4] bg-white p-3 text-sm text-[#3a3a44] outline-none placeholder:text-[#909090]"
            />
            <p className="text-right text-xs text-[#909090]">
              {bio.length}/{BIO_MAX}
            </p>
          </div>
        </div>

        <div className="mt-2 flex justify-end">
          <button
            onClick={save}
            disabled={saving || uploading}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: brand }}
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
