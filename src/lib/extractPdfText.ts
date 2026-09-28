import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (
  buffer: Buffer,
) => Promise<{ text: string; numpages: number }>;

/** PDFs adjuntos completos en Gemini; por encima se extrae texto. */
export const PDF_INLINE_MAX_BYTES = 4 * 1024 * 1024;

const EXCERPT_MAX_CHARS = 90_000;

const SAFETY_TERMS = [
  "agua",
  "submerg",
  "inund",
  "emerg",
  "accident",
  "incend",
  "fuego",
  "bater",
  "alto voltaje",
  "grua",
  "salvament",
];

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

export function pickRelevantTextExcerpt(
  fullText: string,
  question: string,
  maxLen = EXCERPT_MAX_CHARS,
): string {
  const collapsed = fullText.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLen) return collapsed;

  const qNorm = normalizeForSearch(question);
  const qWords = qNorm.split(/\W+/).filter((w) => w.length >= 4);
  const terms = [...new Set([...qWords, ...SAFETY_TERMS.map(normalizeForSearch)])];

  const lower = normalizeForSearch(collapsed);
  let bestIdx = 0;
  let bestScore = 0;

  for (const term of terms) {
    if (term.length < 3) continue;
    let from = 0;
    while (from < lower.length) {
      const found = lower.indexOf(term, from);
      if (found === -1) break;
      const windowStart = Math.max(0, found - 2500);
      const windowEnd = Math.min(lower.length, found + 2500);
      const window = lower.slice(windowStart, windowEnd);
      let score = 0;
      for (const t of terms) {
        if (t.length >= 3 && window.includes(t)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = found;
      }
      from = found + term.length;
    }
  }

  const anchor = bestScore > 0 ? bestIdx : 0;
  const half = Math.floor(maxLen / 2);
  const start = Math.max(0, anchor - half);
  const excerpt = collapsed.slice(start, start + maxLen);
  const prefix = start > 0 ? "… " : "";
  const suffix = start + maxLen < collapsed.length ? " …" : "";
  return `${prefix}${excerpt}${suffix}`;
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text ?? "";
}
