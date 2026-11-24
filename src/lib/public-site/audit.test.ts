import { expect, it } from "vitest";
import { getHelpArticle, getHelpArticles } from "@/lib/help-center/articles";
import { homepageSchema } from "./homepage-schema";
import { HOMEPAGE_DESCRIPTION } from "./offer";
it("homepage schema parses and publishes no unconfirmed price or invented profiles", () => {
  const schema = JSON.parse(JSON.stringify(homepageSchema()));
  expect(schema["@graph"][0]).not.toHaveProperty("sameAs");
  const app = schema["@graph"][1];
  expect(app).not.toHaveProperty("offers");
  expect(app.description).toBe(HOMEPAGE_DESCRIPTION);
  expect(app.name).toBe("AgentStack CRM");
});
it("all 15 help bodies leave H1 ownership to the shared page template", () => {
  expect(getHelpArticles()).toHaveLength(15);
  for (const article of getHelpArticles())
    expect(getHelpArticle(article.slug)!.html).not.toMatch(/<h1[ >]/);
});
it("the five expanded guides contain 600–900 words and a next-article link", () => {
  for (const slug of [
    "a2p-registration",
    "idx-broker-connect",
    "ai-persona-setup",
    "import-contacts",
    "booking-pages",
  ]) {
    const article = getHelpArticle(slug)!;
    const words = article.body.split(/\s+/).length;
    expect(words, slug).toBeGreaterThanOrEqual(600);
    expect(words, slug).toBeLessThanOrEqual(900);
    expect(article.html).toMatch(/href="\/help\//);
    expect(article.html).toContain("<ol>");
  }
});
