import { GoogleGenAI } from "@google/genai";
import { resolveGeminiModelChain } from "./geminiModels.js";

export type GeminiContentPart =
  | { inlineData: { mimeType: string; data: string } }
  | { text: string };

export type GeminiCallFailureKind =
  | "quota"
  | "auth"
  | "billing"
  | "model"
  | "timeout"
  | "network"
  | "blocked"
  | "unknown";

export function classifyGeminiError(message: string): GeminiCallFailureKind {
  if (/leaked|API key|401|403|PERMISSION_DENIED|UNAUTHENTICATED/i.test(message)) return "auth";
  if (/FAILED_PRECONDITION|not available in your country|enable billing|billing/i.test(message)) {
    return "billing";
  }
  if (/429|Too Many Requests|quota exceeded|Quota exceeded|RESOURCE_EXHAUSTED/i.test(message)) {
    return "quota";
  }
  if (/404|not found|not supported for generateContent|is not found for API version/i.test(message)) {
    return "model";
  }
  if (/DEADLINE_EXCEEDED|timeout|ETIMEDOUT|timed out/i.test(message)) return "timeout";
  if (/fetch failed|ECONNRESET|ENOTFOUND|socket|network|UNAVAILABLE|503/i.test(message)) {
    return "network";
  }
  if (/SAFETY|blocked|BLOCK/i.test(message)) return "blocked";
  return "unknown";
}

export function userMessageForGeminiFailure(kind: GeminiCallFailureKind): string {
  switch (kind) {
    case "quota":
      return "El servicio de revisión está saturado o sin cuota. Inténtalo de nuevo en unos minutos.";
    case "auth":
      return "La clave de revisión no es válida. El equipo de atoo debe revisar GEMINI_API_KEY.";
    case "billing":
      return "El servicio de revisión requiere facturación activa en Google AI Studio.";
    case "model":
      return "El modelo de revisión no está disponible. Inténtalo de nuevo en unos minutos.";
    case "timeout":
      return "La revisión tardó demasiado. Sube una imagen más liviana e inténtalo de nuevo.";
    case "network":
      return "No pudimos conectar con el servicio de revisión. Inténtalo de nuevo en unos minutos.";
    case "blocked":
      return "El servicio bloqueó este archivo por seguridad. Prueba con otra captura más clara.";
    default:
      return "No pudimos completar la revisión automática. Inténtalo de nuevo en unos minutos.";
  }
}

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

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function logLine(prefix: string, message: string, extra?: unknown): void {
  if (extra !== undefined) {
    console.error(`${prefix} ${message}`, extra);
  } else {
    console.error(`${prefix} ${message}`);
  }
}

function toSdkContents(parts: GeminiContentPart[]) {
  return [
    {
      role: "user" as const,
      parts: parts.map((p) => {
        if ("text" in p) return { text: p.text };
        return {
          inlineData: {
            mimeType: p.inlineData.mimeType,
            data: p.inlineData.data,
          },
        };
      }),
    },
  ];
}

async function callGeminiOnce(
  ai: GoogleGenAI,
  modelName: string,
  parts: GeminiContentPart[],
): Promise<string> {
  const supportsThinking = /gemini-2\.5|gemini-3/i.test(modelName);
  const response = await ai.models.generateContent({
    model: modelName,
    contents: toSdkContents(parts),
    config: {
      ...(supportsThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  });

  const text = response.text?.trim() ?? "";
  if (!text) {
    const block = response.promptFeedback?.blockReason;
    throw new Error(block ? `Response blocked: ${block}` : "Empty model response");
  }
  return text;
}

/** Prueba varios modelos Gemini y un reintento con espera ante 429. */
export async function generateContentWithModelChain(
  apiKey: string,
  parts: GeminiContentPart[],
  logPrefix: string,
): Promise<{ text: string }> {
  const ai = new GoogleGenAI({ apiKey });
  const chain = resolveGeminiModelChain(logPrefix);
  logLine(logPrefix, `Cadena de modelos: ${chain.join(" → ")}`);

  let lastError: unknown;
  for (const modelName of chain) {
    const run = async (): Promise<string> => callGeminiOnce(ai, modelName, parts);

    try {
      const text = await run();
      logLine(logPrefix, `Respuesta OK con modelo "${modelName}".`);
      return { text };
    } catch (err) {
      lastError = err;
      const raw = err instanceof Error ? err.message : String(err);
      const kind = classifyGeminiError(raw);
      logLine(logPrefix, `Fallo con modelo "${modelName}" (${kind})`, raw);

      if (kind === "quota") {
        const wait = parseRetryDelayMs(raw) ?? 12_000;
        logLine(logPrefix, `429 en "${modelName}": esperando ${wait}ms y reintentando una vez…`);
        await sleep(wait);
        try {
          const text = await run();
          logLine(logPrefix, `Respuesta OK tras reintento con "${modelName}".`);
          return { text };
        } catch (err2) {
          lastError = err2;
          logLine(
            logPrefix,
            `Reintento fallido "${modelName}"`,
            err2 instanceof Error ? err2.message : err2,
          );
        }
      }
    }
  }

  throw lastError ?? new Error("Todos los modelos Gemini fallaron");
}

/** Llamada mínima para diagnosticar Railway / local sin subir documentos. */
export async function pingGemini(apiKey: string): Promise<{
  ok: boolean;
  model: string | null;
  kind: GeminiCallFailureKind | null;
  detail: string | null;
  latencyMs: number;
}> {
  const started = Date.now();
  const chain = resolveGeminiModelChain("[health/ai/ping]");
  const ai = new GoogleGenAI({ apiKey });

  for (const modelName of chain) {
    try {
      const text = await callGeminiOnce(ai, modelName, [
        { text: 'Responde solo con el JSON {"ok":true} sin markdown.' },
      ]);
      return {
        ok: true,
        model: modelName,
        kind: null,
        detail: text.slice(0, 80),
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const kind = classifyGeminiError(raw);
      // Keep trying next model unless auth/billing — those won't change per model.
      if (kind === "auth" || kind === "billing") {
        return {
          ok: false,
          model: modelName,
          kind,
          detail: raw.slice(0, 280),
          latencyMs: Date.now() - started,
        };
      }
      if (modelName === chain[chain.length - 1]) {
        return {
          ok: false,
          model: modelName,
          kind,
          detail: raw.slice(0, 280),
          latencyMs: Date.now() - started,
        };
      }
    }
  }

  return {
    ok: false,
    model: null,
    kind: "unknown",
    detail: "Sin modelos en la cadena",
    latencyMs: Date.now() - started,
  };
}
