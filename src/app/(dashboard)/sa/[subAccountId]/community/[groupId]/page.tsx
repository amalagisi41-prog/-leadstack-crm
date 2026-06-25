"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { getFirebaseDb } from "@/lib/firebase/client";
import { useSubAccount } from "@/context/sub-account-context";
import { ABOUT_MAX_CHARS, TAGLINE_MAX_CHARS } from "@/config/community";
import { ImageUpload } from "@/components/community/image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  CommunityGroup,
  GroupAccess,
  GroupJoinPolicy,
  GroupStatus,
  ResourceLink,
} from "@/types/community";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background text-foreground px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&>option]:bg-background [&>option]:text-foreground";

export default function CommunityGroupSettingsPage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string }>;
}) {
  const { groupId } = use(params);
  const { subAccountId, isAdmin } = useSubAccount();
  const router = useRouter();

  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [tagline, setTagline] = useState("");
  const [brandColor, setBrandColor] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [cardImageUrl, setCardImageUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<GroupStatus>("draft");
  const [joinPolicy, setJoinPolicy] = useState<GroupJoinPolicy>("open");
  const [access, setAccess] = useState<GroupAccess>("free");
  const [price, setPrice] = useState("");
  const [categories, setCategories] = useState("");
  const [links, setLinks] = useState<ResourceLink[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);

  useEffect(() => {
    return onSnapshot(
      doc(getFirebaseDb(), `subAccounts/${subAccountId}/communityGroups/${groupId}`),
      (snap) => {
        if (!snap.exists()) {
          setGroup(null);
          setLoaded(true);
          return;
        }
        const g = { id: snap.id, ...(snap.data() as Omit<CommunityGroup, "id">) };
        setGroup(g);
        setName(g.name);
        setAbout(g.about);
        setTagline(g.tagline ?? "");
        setBrandColor(g.brandColor ?? "");
        setCoverUrl(g.coverUrl ?? null);
        setCardImageUrl(g.cardImageUrl ?? null);
        setLogoUrl(g.logoUrl ?? null);
        setStatus(g.status);
        setJoinPolicy(g.joinPolicy);
        setAccess(g.access);
        setPrice(g.priceCents != null ? (g.priceCents / 100).toString() : "");
        setCategories((g.categories ?? ["General"]).join(", "));
        setLinks(g.links ?? []);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
  }, [subAccountId, groupId]);

  async function handleSave() {
    setSaving(true);
    try {
      const priceCents =
        access === "paid" && price.trim()
          ? Math.round(parseFloat(price) * 100)
          : null;
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/community/${groupId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            about,
            tagline,
            brandColor: brandColor.trim() || null,
            coverUrl,
            cardImageUrl,
            logoUrl,
            status,
            joinPolicy,
            access,
            priceCents,
            categories: categories
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean),
            links: links.filter((l) => l.url.trim()),
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to save");
      toast.success("Group saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this group? This can't be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/community/${groupId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Group deleted.");
      router.push(`/sa/${subAccountId}/community`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-center text-sm text-muted-foreground">
        Group not found.{" "}
        <Link href={`/sa/${subAccountId}/community`} className="underline">
          Back to Community
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/sa/${subAccountId}/community`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Community
        </Link>
        <a
          href={`/c/${subAccountId}/${group.slug}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          View public page <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/sa/${subAccountId}/community/${groupId}/members`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            <Users className="h-4 w-4" /> Members
          </Link>
          <Link
            href={`/sa/${subAccountId}/community/${groupId}/classroom`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            <BookOpen className="h-4 w-4" /> Manage classroom
          </Link>
        </div>
      </div>

      <fieldset disabled={!isAdmin || saving} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="name">Group name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Public URL: <code>/c/{subAccountId}/{group.slug}</code>
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="about">About</Label>
          <Textarea
            id="about"
            value={about}
            onChange={(e) => setAbout(e.target.value.slice(0, ABOUT_MAX_CHARS))}
            maxLength={ABOUT_MAX_CHARS}
            rows={5}
            placeholder="Sell the group — what members get, who it's for."
          />
          <p className="text-right text-xs text-muted-foreground">
            {about.length}/{ABOUT_MAX_CHARS}
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <ImageUpload
            label="Cover image"
            hint="The large hero image on the public About page (16:9 works best)."
            value={coverUrl}
            onChange={setCoverUrl}
            onUploadingChange={setImgUploading}
            saId={subAccountId}
            groupId={groupId}
            kind="cover"
            aspect="video"
            disabled={!isAdmin}
          />
          <ImageUpload
            label="Card image"
            hint="The image at the top of the right-hand join card (16:9). Falls back to the cover if empty."
            value={cardImageUrl}
            onChange={setCardImageUrl}
            onUploadingChange={setImgUploading}
            saId={subAccountId}
            groupId={groupId}
            kind="card"
            aspect="video"
            disabled={!isAdmin}
          />
        </div>

        <ImageUpload
          label="Logo / icon"
          hint="Small brand mark shown in the page header. Square works best."
          value={logoUrl}
          onChange={setLogoUrl}
          onUploadingChange={setImgUploading}
          saId={subAccountId}
          groupId={groupId}
          kind="logo"
          aspect="square"
          disabled={!isAdmin}
        />

        <div className="space-y-1.5">
          <Label htmlFor="tagline">Card tagline</Label>
          <Input
            id="tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value.slice(0, TAGLINE_MAX_CHARS))}
            maxLength={TAGLINE_MAX_CHARS}
            placeholder="One short line shown under the logo in the join card."
          />
          <p className="text-right text-xs text-muted-foreground">
            {tagline.length}/{TAGLINE_MAX_CHARS}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              className={SELECT_CLASS}
              value={status}
              onChange={(e) => setStatus(e.target.value as GroupStatus)}
            >
              <option value="draft">Draft (hidden)</option>
              <option value="published">Published (live)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brandColor">Brand color (hex)</Label>
            <Input
              id="brandColor"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              placeholder="#2E6EF5"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="categories">Feed categories</Label>
          <Input
            id="categories"
            value={categories}
            onChange={(e) => setCategories(e.target.value)}
            placeholder="General, Wins, Questions, Introductions"
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated. &quot;General&quot; is always kept; up to 10 total.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Links</Label>
          <p className="text-xs text-muted-foreground">
            Shown in the community sidebar (e.g. your website, a resource). Up to
            10.
          </p>
          {links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={l.label}
                placeholder="Label"
                onChange={(e) => {
                  const next = [...links];
                  next[i] = { ...next[i], label: e.target.value };
                  setLinks(next);
                }}
                className="w-1/3"
              />
              <Input
                value={l.url}
                placeholder="https://…"
                onChange={(e) => {
                  const next = [...links];
                  next[i] = { ...next[i], url: e.target.value };
                  setLinks(next);
                }}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLinks(links.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setLinks([...links, { label: "", url: "" }])}
          >
            <Plus className="h-4 w-4" /> Add link
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="joinPolicy">Join policy</Label>
            <select
              id="joinPolicy"
              className={SELECT_CLASS}
              value={joinPolicy}
              onChange={(e) => setJoinPolicy(e.target.value as GroupJoinPolicy)}
            >
              <option value="open">Open — anyone can join instantly</option>
              <option value="approval">Approval — admin approves joins</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="access">Access</Label>
            <select
              id="access"
              className={SELECT_CLASS}
              value={access}
              onChange={(e) => setAccess(e.target.value as GroupAccess)}
            >
              <option value="free">Free</option>
              <option value="paid">Paid (one-time)</option>
            </select>
          </div>
        </div>

        {access === "paid" && (
          <div className="space-y-1.5">
            <Label htmlFor="price">One-time price</Label>
            <Input
              id="price"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="49.00"
            />
            <p className="text-xs text-muted-foreground">
              Paid joins (one-time PayPal, admin marks paid) go live with the
              access-controls slice. Until then a paid group can&apos;t be joined.
            </p>
          </div>
        )}
      </fieldset>

      {isAdmin && (
        <div className="flex items-center justify-between border-t pt-5">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={deleting || saving}
          >
            <Trash2 className="h-4 w-4" /> Delete group
          </Button>
          <Button onClick={handleSave} disabled={saving || imgUploading}>
            {saving ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : imgUploading ? (
              "Uploading image…"
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
