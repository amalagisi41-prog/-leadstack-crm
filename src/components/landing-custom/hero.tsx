export function Hero() {
  return (
    <section className="relative overflow-hidden bg-white px-4 pb-8 pt-10 text-center md:pb-10 md:pt-16">
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-[#f7cddd]/35 blur-3xl" />
      <div className="relative mx-auto max-w-6xl">
        <h1 className="mx-auto max-w-5xl text-balance font-sans text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.045em] text-[#173B7A] sm:text-[4rem] md:text-[5.25rem]">
          The easiest way to run your{" "}
          <span className="font-normal italic text-[#DB4F9B]">real estate business.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-3xl text-balance text-base leading-7 text-[#526078] sm:text-lg md:text-xl">
          Capture leads, respond instantly, stay organized, and close more transactions with one simple system powered by AI.
        </p>
      </div>
    </section>
  );
}
