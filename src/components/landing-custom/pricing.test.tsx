import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Pricing } from "./pricing";
it("renders the confirmed price without unfinished trial or guarantee terms", () => {
  const html = renderToStaticMarkup(<Pricing />);
  expect(html).toContain("AgentStack Solo — $99/month");
  expect(html).not.toContain("[TO CONFIRM]");
  expect(html).not.toContain("money-back guarantee");
  expect(html).toContain("Cancellation stops future billing.");
});
