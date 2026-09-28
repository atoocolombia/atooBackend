const YOUTUBE_ID = /^[a-zA-Z0-9_-]{11}$/;

export function extractYoutubeVideoId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return YOUTUBE_ID.test(id) ? id : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v") ?? "";
        return YOUTUBE_ID.test(id) ? id : null;
      }
      if (url.pathname.startsWith("/embed/")) {
        const id = url.pathname.split("/")[2] ?? "";
        return YOUTUBE_ID.test(id) ? id : null;
      }
      if (url.pathname.startsWith("/shorts/")) {
        const id = url.pathname.split("/")[2] ?? "";
        return YOUTUBE_ID.test(id) ? id : null;
      }
    }
  } catch {
    if (YOUTUBE_ID.test(raw)) return raw;
    return null;
  }

  return null;
}

export function normalizeYoutubeWatchUrl(input: string): string | null {
  const id = extractYoutubeVideoId(input);
  if (!id) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

export function youtubeEmbedUrlFromStored(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;
  const id = extractYoutubeVideoId(input);
  if (!id) return null;
  return `https://www.youtube-nocookie.com/embed/${id}`;
}
