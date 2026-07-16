import "server-only";

import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import { markdownToHtml } from "@/lib/help-center/markdown";

const CONTENT_DIR = path.join(process.cwd(), "src", "content", "help");

export interface HelpArticleSummary {
  slug: string;
  title: string;
  description: string;
  category: string;
  order: number;
}

export interface HelpArticle extends HelpArticleSummary {
  body: string;
  html: string;
}

function parseFrontmatter(raw: string, slug: string): HelpArticleSummary & {
  body: string;
} {
  if (!raw.startsWith("---\n")) {
    throw new Error(`Help article ${slug} is missing frontmatter.`);
  }

  const endIndex = raw.indexOf("\n---\n");
  if (endIndex === -1) {
    throw new Error(`Help article ${slug} has invalid frontmatter.`);
  }

  const frontmatter = raw.slice(4, endIndex).split("\n");
  const body = raw.slice(endIndex + 5).trim();
  const meta = new Map<string, string>();

  for (const line of frontmatter) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    meta.set(key, value);
  }

  const title = meta.get("title") ?? slug;
  const description = meta.get("description") ?? "";
  const category = meta.get("category") ?? "Help";
  const order = Number(meta.get("order") ?? "999");

  return {
    slug,
    title,
    description,
    category,
    order: Number.isFinite(order) ? order : 999,
    body,
  };
}

const readAllArticles = cache((): HelpArticle[] => {
  const entries = fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const slug = file.replace(/\.md$/, "");
      const raw = fs.readFileSync(path.join(CONTENT_DIR, file), "utf8");
      const parsed = parseFrontmatter(raw, slug);
      return {
        ...parsed,
        html: markdownToHtml(parsed.body),
      };
    })
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.title.localeCompare(b.title);
    });

  return entries;
});

export function getHelpArticles(): HelpArticleSummary[] {
  return readAllArticles().map((article) => ({
    slug: article.slug,
    title: article.title,
    description: article.description,
    category: article.category,
    order: article.order,
  }));
}

export function getHelpArticle(slug: string): HelpArticle | null {
  return readAllArticles().find((article) => article.slug === slug) ?? null;
}
