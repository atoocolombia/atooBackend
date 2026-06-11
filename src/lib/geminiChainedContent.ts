import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GenerateContentResult } from "@google/generative-ai";

export type GeminiContentPart =
  | { inlineData: { mimeType: string; data: string } }
  | { text: string };

const DEFAULT_MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
] as const;

export function extractJsonObjectFromModelText(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON en la respuesta del modelo");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
}

function parseRetryDelayMs(message: string): number | null {
  const m = message.match(/retry in ([\d.]+)\s*s/i);
  if (!m) return null;
  const sec = parseFloat(m[1]);
  if (!Number.isFinite(sec) || sec < 0) return null;
  return Math.min(25_000, Math.ceil(sec * 1000) + 500);
}

function buildModelChain(): string[] {
  const extra = process.env.GEMINI_MODEL_FALLBACKS?.trim();
  const fromEnv = extra
    ? extra
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const primary = process.env.GEMINI_MODEL?.trim();
  const defaults = [...DEFAULT_MODEL_CHAIN];
  const merged = primary
    ? [primary, ...defaults.filter((m) => m !== primary), ...fromEnv.filter((m) => m !== primary)]
    : [...defaults, ...fromEnv];
  return [...new Set(merged)];
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function callGeminiOnce(
  genAI: GoogleGenerativeAI,
  modelName: string,
  parts: GeminiContentPart[],
): Promise<GenerateContentResult> {
  const model = genAI.getGenerativeModel({ model: modelName });
  return model.generateContent(parts);
}

function logLine(prefix: string, message: string, extra?: unknown): void {
  if (extra !== undefined) {
    console.error(`${prefix} ${message}`, extra);
  } else {
    console.error(`${prefix} ${message}`);
  }
}

/** Prueba varios modelos Gemini y un reintento con espera ante 429. */
export async function generateContentWithModelChain(
  apiKey: string,
  parts: GeminiContentPart[],
  logPrefix: string,
): Promise<{ text: string }> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const chain = buildModelChain();
  logLine(logPrefix, `Cadena de modelos: ${chain.join(" → ")}`);

  let lastError: unknown;
  for (const modelName of chain) {
    const run = async (): Promise<GenerateContentResult> => callGeminiOnce(genAI, modelName, parts);

    try {
      const result = await run();
      const text = result.response.text();
      logLine(logPrefix, `Respuesta OK con modelo "${modelName}".`);
      return { text };
    } catch (err) {
      lastError = err;
      const raw = err instanceof Error ? err.message : String(err);
      logLine(logPrefix, `Fallo con modelo "${modelName}"`, raw);

      const is429 = /429|Too Many Requests|quota exceeded|Quota exceeded|RESOURCE_EXHAUSTED/i.test(raw);
      if (is429) {
        const wait = parseRetryDelayMs(raw) ?? 12_000;
        logLine(logPrefix, `429 en "${modelName}": esperando ${wait}ms y reintentando una vez…`);
        await sleep(wait);
        try {
          const result = await run();
          const text = result.response.text();
          logLine(logPrefix, `Respuesta OK tras reintento con "${modelName}".`);
          return { text };
        } catch (err2) {
          lastError = err2;
          logLine(logPrefix, `Reintento fallido "${modelName}"`, err2 instanceof Error ? err2.message : err2);
        }
      }
    }
  }

  throw lastError ?? new Error("Todos los modelos Gemini fallaron");
}
