import sanitizeHtml from "sanitize-html";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("#")
  ) {
    return trimmed;
  }
  return "#";
}

function renderInline(markdown: string): string {
  let html = escapeHtml(markdown);

  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, text: string, href: string) =>
      `<a href="${escapeHtml(sanitizeUrl(href))}">${text}</a>`,
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  return html;
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const parts: string[] = [];
  let paragraph: string[] = [];
  let list:
    | {
        type: "ul" | "ol";
        items: string[];
      }
    | null = null;
  let inCode = false;
  let codeLines: string[] = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    parts.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!list) return;
    const items = list.items
      .map((item) => `<li>${renderInline(item)}</li>`)
      .join("");
    parts.push(`<${list.type}>${items}</${list.type}>`);
    list = null;
  }

  function flushCode() {
    if (!codeLines.length) return;
    parts.push(
      `<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
    );
    codeLines = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      const text = renderInline(headingMatch[2]);
      parts.push(`<h${level}>${text}</h${level}>`);
      continue;
    }

    const unorderedMatch = /^-\s+(.*)$/.exec(trimmed);
    if (unorderedMatch) {
      flushParagraph();
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(unorderedMatch[1]);
      continue;
    }

    const orderedMatch = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (orderedMatch) {
      flushParagraph();
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(orderedMatch[1]);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushCode();

  return sanitizeHtml(parts.join("\n"), {
    allowedTags: [
      "p",
      "h1",
      "h2",
      "h3",
      "ul",
      "ol",
      "li",
      "strong",
      "code",
      "pre",
      "a",
    ],
    allowedAttributes: {
      a: ["href"],
    },
  });
}
