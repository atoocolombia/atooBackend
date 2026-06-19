import type { LandingContent } from "./landingContentDefaults.js";

type ReqLike = { protocol?: string; get?: (name: string) => string | undefined };

function buildPublicUrl(pathSuffix: string, req?: ReqLike): string {
  const base = process.env.PUBLIC_API_URL?.replace(/\/+$/, "");
  if (base) {
    return `${base}${pathSuffix}`;
  }
  if (req?.get && req.protocol) {
    const host = req.get("host");
    if (host) {
      return `${req.protocol}://${host}${pathSuffix}`;
    }
  }
  return pathSuffix;
}

export type LandingContentDto = LandingContent & {
  hero: LandingContent["hero"] & {
    video: string;
    poster: string;
  };
};

export function mapLandingContentToDto(
  content: LandingContent,
  req?: ReqLike,
): LandingContentDto {
  const { hero } = content;
  const video = hero.videoStoredPath
    ? buildPublicUrl("/api/v1/landing/hero/video/file", req)
    : hero.videoUrl;
  const poster = hero.posterStoredPath
    ? buildPublicUrl("/api/v1/landing/hero/poster/file", req)
    : hero.posterUrl;

  return {
    ...content,
    hero: {
      ...hero,
      video,
      poster,
    },
  };
}
