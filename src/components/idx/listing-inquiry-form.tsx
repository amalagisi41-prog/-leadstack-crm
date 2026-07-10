"use client";

import { useState, type FormEvent } from "react";

/**
 * "Request a showing" form on a public IDX listing detail page. Every
 * submission captures a lead straight into the CRM via
 * POST /api/idx/[subAccountId]/[listingId]/inquire — the actual lead-gen
 * payoff of the whole IDX Listings feature. Self-contained, no dependency
 * on the dashboard's shadcn theme (matches the booking/quote public-page
 * pattern of a fully custom-branded surface).
 */

interface Props {
  subAccountId: string;
  listingId: string;
}

export function ListingInquiryForm({ subAccountId, listingId }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/idx/${subAccountId}/${listingId}/inquire`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, phone, message }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Something went wrong. Please try again.");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border bg-white p-5 text-sm">
        <p className="font-medium text-neutral-900">Thanks — request sent!</p>
        <p className="mt-1 text-neutral-600">Someone will be in touch shortly.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="sticky top-6 space-y-3 rounded-xl border bg-white p-5"
    >
      <p className="text-sm font-semibold text-neutral-900">Request a showing</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        placeholder="Your name"
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        required
        placeholder="Email"
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone (optional)"
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Anything you'd like to add? (optional)"
        rows={3}
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Request a showing"}
      </button>
    </form>
  );
}
