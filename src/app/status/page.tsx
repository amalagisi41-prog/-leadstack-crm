import { PublicInfoShell } from "@/components/public/public-info-shell";

export default function StatusPage() {
  return (
    <PublicInfoShell
      eyebrow="Product status"
      title="AgentStack systems are operating normally."
      intro="This page reports AgentStack's current product state. Provider-specific incidents and scheduled maintenance will be added here as production monitoring is connected."
    >
      <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-emerald-500" />
          <h2 className="text-lg font-semibold">No known platform-wide incident</h2>
        </div>
        <p className="mt-3 text-sm leading-6 text-[#526078]">
          Marketing, signup, authenticated workspace routing, and public support
          pages are available. Individual integrations may remain in Private
          Preview and require account-specific configuration.
        </p>
        <p className="mt-5 text-xs text-[#7B8AA1]">
          Status copy last reviewed August 8, 2026.
        </p>
      </div>
    </PublicInfoShell>
  );
}
