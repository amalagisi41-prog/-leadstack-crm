import type { VideoProvider } from "@/types/community";

/**
 * Parse a pasted YouTube or Vimeo URL into a provider + id + canonical embed
 * URL. Client-safe (no server-only deps) so the builder validates on paste and
 * the player renders the iframe from the same logic. v1 supports YouTube +
 * Vimeo only (no Loom/Wistia/native upload).
 */
export interface ParsedVideo {
  provider: VideoProvider;
  id: string;
  embedUrl: string;
}

export function parseVideoUrl(raw: string): ParsedVideo | null {
  const url = raw.trim();
  if (!url) return null;

  // YouTube — watch?v=, youtu.be/, /embed/, /shorts/
  const yt =
    url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/) ??
    null;
  if (yt) {
    return {
      provider: "youtube",
      id: yt[1],
      embedUrl: `https://www.youtube.com/embed/${yt[1]}`,
    };
  }

  // Vimeo — vimeo.com/123456789 (optionally with a hash) or player.vimeo.com
  const vimeo =
    url.match(/vimeo\.com\/(?:video\/)?(\d+)/) ??
    url.match(/player\.vimeo\.com\/video\/(\d+)/) ??
    null;
  if (vimeo) {
    return {
      provider: "vimeo",
      id: vimeo[1],
      embedUrl: `https://player.vimeo.com/video/${vimeo[1]}`,
    };
  }

  return null;
}

export function embedUrlFor(
  provider: VideoProvider | null,
  id: string | null,
): string | null {
  if (!provider || !id) return null;
  return provider === "youtube"
    ? `https://www.youtube.com/embed/${id}`
    : `https://player.vimeo.com/video/${id}`;
}
