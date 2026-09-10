"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Search, Sparkles } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { CampaignBriefDoc } from "@/types/marketing-campaigns";

export default function MarketingCampaignsPage() {
  const { subAccountId, isAdmin } = useSubAccount();
  const [mlsId, setMlsId] = useState("");
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState({ address: "", city: "", state: "", zip: "", price: "", beds: "", baths: "", sqft: "", propertyType: "", remarks: "", disclaimer: "", photos: "" });
  const [brief, setBrief] = useState<CampaignBriefDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [landingPageUrl, setLandingPageUrl] = useState<string | null>(null);

  async function createBrief() {
    setLoading(true);
    try {
      const payload = manual ? { ...form, mlsId: "", photos: form.photos.split(/\s*,\s*|\n/).filter(Boolean), price: Number(form.price), beds: Number(form.beds), baths: Number(form.baths), sqft: Number(form.sqft) } : { mlsId };
      const res = await fetch(`/api/sub-accounts/${subAccountId}/marketing/campaigns`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json() as { ok?: boolean; error?: string; brief?: CampaignBriefDoc };
      if (!res.ok || !data.ok || !data.brief) throw new Error(data.error ?? "Could not build campaign brief.");
      setBrief(data.brief);
      toast.success("Facts-only campaign brief created.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not build campaign brief."); }
    finally { setLoading(false); }
  }

  async function approveReadyDrafts() {
    if (!brief) return;
    setApproving(true);
    try {
      const channels = brief.brief.channels.filter((draft) => draft.status === "ready" && draft.findings.length === 0).map((draft) => draft.channel);
      const res = await fetch(`/api/sub-accounts/${subAccountId}/marketing/campaigns/${brief.listingId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channels }) });
      const data = await res.json() as { ok?: boolean; error?: string; landingPageUrl?: string | null };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not approve campaign drafts.");
      setLandingPageUrl(data.landingPageUrl ?? null);
      toast.success("Ready campaign drafts approved.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not approve campaign drafts."); }
    finally { setApproving(false); }
  }

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold">MLS Campaign Panel</h1><p className="mt-1 text-sm text-muted-foreground">Build reviewable, facts-only campaign drafts from the licensed IDX feed.</p></div>
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-end gap-3"><div className="min-w-64 flex-1 space-y-1.5"><Label htmlFor="campaign-mls">MLS number</Label><Input id="campaign-mls" value={mlsId} onChange={(e) => setMlsId(e.target.value)} placeholder="Search synced IDX listings by MLS#" disabled={manual} /></div><Button onClick={createBrief} disabled={!isAdmin || loading || (!manual && !mlsId.trim())}>{loading ? "Building…" : <><Search className="mr-1 h-4 w-4" /> Find listing</>}</Button></div>
      <p className="mt-3 text-xs text-muted-foreground">Enter a listing number from your connected IDX Broker account. AgentStack will refresh your official featured-listing feed automatically, then build the campaign drafts for you.</p>
      <button type="button" className="mt-2 text-xs underline" onClick={() => setManual((v) => !v)}>{manual ? "Use synced IDX listing" : "Use guided manual entry"}</button>
      {manual && <div className="mt-4 grid gap-3 sm:grid-cols-2">{([['address','Address'],['city','City'],['state','State'],['zip','ZIP'],['price','Price'],['beds','Beds'],['baths','Baths'],['sqft','Square feet'],['propertyType','Property type']] as const).map(([key,label]) => <div key={key} className="space-y-1"><Label htmlFor={`manual-${key}`}>{label}</Label><Input id={`manual-${key}`} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></div>)}<div className="space-y-1 sm:col-span-2"><Label htmlFor="manual-remarks">Remarks</Label><Textarea id="manual-remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div><div className="space-y-1 sm:col-span-2"><Label htmlFor="manual-photos">Photo URLs (one per line)</Label><Textarea id="manual-photos" value={form.photos} onChange={(e) => setForm({ ...form, photos: e.target.value })} /></div><div className="space-y-1 sm:col-span-2"><Label htmlFor="manual-disclaimer">MLS disclaimer (verbatim)</Label><Textarea id="manual-disclaimer" value={form.disclaimer} onChange={(e) => setForm({ ...form, disclaimer: e.target.value })} /></div></div>}
    </div>
    {brief && <div className="space-y-4"><div className="rounded-2xl border bg-card p-5"><div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="font-semibold">{brief.brief.title}</h2><p className="mt-1 text-sm text-muted-foreground">{brief.brief.description}</p><p className="mt-2 text-xs">Boost schedule: {brief.brief.boostTier ?? "not eligible yet"}{brief.brief.daysOnMarket == null ? " · days on market unavailable" : ` · ${brief.brief.daysOnMarket} days on market`}</p></div></div>{brief.brief.dataGaps.length > 0 && <p className="mt-4 text-xs text-amber-700">Data gaps (not invented): {brief.brief.dataGaps.join(", ")}</p>}<div className="mt-4 flex flex-wrap items-center gap-3"><Button onClick={approveReadyDrafts} disabled={!isAdmin || approving}>{approving ? "Approving…" : "Approve ready drafts"}</Button>{landingPageUrl && <a className="text-sm underline" href={landingPageUrl} target="_blank" rel="noreferrer">View approved landing page</a>}</div></div><div className="grid gap-3 md:grid-cols-2">{brief.brief.channels.map((draft) => <div key={draft.channel} className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between"><h3 className="font-medium capitalize">{draft.channel}</h3><span className="text-xs text-muted-foreground">{draft.approval}</span></div><p className="mt-2 text-sm">{draft.body}</p>{draft.findings.length > 0 && <p className="mt-2 flex gap-1 text-xs text-amber-700"><AlertTriangle className="h-4 w-4 shrink-0" /> Review: {draft.findings.join(", ")}</p>}<p className="mt-2 text-[11px] text-muted-foreground">Status: {draft.status} · audited approval required</p></div>)}</div></div>}
  </div>;
}
