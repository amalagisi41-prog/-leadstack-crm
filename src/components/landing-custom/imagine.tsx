import { Heart, Home } from "lucide-react";

export function Imagine() {
  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,oklch(0.72_0.18_263)_/_12%,transparent_60%)]"
      />

      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          {/* Supporting graphic — a house-and-heart mark standing in for the
              "help people" theme, since no photography is available here. */}
          <div className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/15 to-indigo-500/15">
            <Home className="h-10 w-10 text-blue-600" strokeWidth={1.5} />
            <span className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5">
              <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
            </span>
          </div>

          <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tighter sm:text-5xl">
            You became an agent{" "}
            <span className="font-sans font-normal italic">to help people.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Not to chase missed calls. Not to remember every follow-up. Not to
            organize spreadsheets at 10 p.m.{" "}
            <span className="font-semibold text-[#4F91FF]">AgentStack</span>{" "}
            handles the business — so you can focus on the relationship.
          </p>
        </div>
      </div>
    </section>
  );
}
