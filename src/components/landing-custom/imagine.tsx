export function Imagine() {
  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,oklch(0.72_0.18_263)_/_12%,transparent_60%)]"
      />

      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            Imagine
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold leading-tight tracking-tighter sm:text-5xl">
            You became an agent{" "}
            <span className="font-sans font-normal italic">to help people.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Not to chase missed calls. Not to remember every follow-up. Not to
            organize spreadsheets at 10 p.m. AgentStack handles the business —
            so you can focus on the relationship.
          </p>
        </div>
      </div>
    </section>
  );
}
