import { Button } from "@/components/ui/button";
import type { ResolvedBrand } from "@/config/landing";

export function CTA({ brand }: { brand: ResolvedBrand }) {
  return (
    <section className="relative overflow-hidden py-24">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,oklch(0.72_0.16_165)_/_14%,transparent_60%)]" />

      <div className="container mx-auto px-4 text-center">
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tighter sm:text-5xl">
          Ready to close more deals with{" "}
          <span className="font-serif font-normal italic">
            less hustle?
          </span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          Book a 20-minute call. We&apos;ll import your contacts, configure your pipeline, and have you running with AI follow-up before the week is out.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            render={<a href={`mailto:${brand.supportEmail}`} />}
            size="lg"
            className="px-6 text-base"
          >
            Book a demo
          </Button>
          <Button
            render={<a href={`mailto:${brand.supportEmail}?subject=AgentEdge%20questions`} />}
            variant="outline"
            size="lg"
            className="px-6 text-base"
          >
            Ask a question
          </Button>
        </div>
      </div>
    </section>
  );
}
