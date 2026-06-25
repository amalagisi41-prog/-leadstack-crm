import { Button } from "@/components/ui/button";
import type { ResolvedBrand } from "@/config/landing";

export function CTA({ brand }: { brand: ResolvedBrand }) {
  return (
    <section className="relative overflow-hidden py-24">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,oklch(0.72_0.16_165)_/_14%,transparent_60%)]" />

      <div className="container mx-auto px-4 text-center">
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tighter sm:text-5xl">
          Get your team into{" "}
          <span className="font-serif font-normal italic">
            {brand.name}
          </span>{" "}
          this afternoon.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          Tell us about your business and we&apos;ll get you set up — contacts
          imported, pipeline configured, ready to run in days, not months.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            render={<a href={`mailto:${brand.supportEmail}`} />}
            size="lg"
            className="px-6 text-base"
          >
            Talk to us
          </Button>
        </div>
      </div>
    </section>
  );
}
