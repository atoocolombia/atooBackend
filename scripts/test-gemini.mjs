/**
 * Prueba rápida de Gemini con la clave de backend/.env
 *
 * Uso:
 *   cd backend && npm run test:gemini
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const DEPRECATED = new Set([
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
  "gemini-1.5-pro-latest",
]);

const DEFAULT_CHAIN = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

function resolveChain() {
  const primary = process.env.GEMINI_MODEL?.trim();
  const extra = (process.env.GEMINI_MODEL_FALLBACKS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const validPrimary = primary && !DEPRECATED.has(primary) ? primary : null;
  const merged = validPrimary
    ? [validPrimary, ...DEFAULT_CHAIN.filter((m) => m !== validPrimary), ...extra]
    : [...DEFAULT_CHAIN, ...extra];
  return [...new Set(merged.filter((m) => !DEPRECATED.has(m)))];
}

const apiKey = process.env.GEMINI_API_KEY?.trim();
const skip = process.env.DATA_TREATMENT_SKIP_AI_VERIFY === "true";
const configuredModel = process.env.GEMINI_MODEL?.trim() || "(default)";

console.log("=== Test Gemini (Atoo) ===");
console.log(`GEMINI_API_KEY: ${apiKey ? "configurada" : "FALTA"}`);
console.log(`GEMINI_MODEL: ${configuredModel}`);
if (configuredModel !== "(default)" && DEPRECATED.has(configuredModel)) {
  console.warn(`  ⚠ "${configuredModel}" está obsoleto; se usará la cadena por defecto.`);
}
console.log(`DATA_TREATMENT_SKIP_AI_VERIFY: ${skip}`);

if (!apiKey) {
  console.error("\nFalta GEMINI_API_KEY. Crea una en https://aistudio.google.com/apikey");
  process.exit(1);
}

const chain = resolveChain();
console.log(`Cadena: ${chain.join(" → ")}`);

const ai = new GoogleGenAI({ apiKey });
let ok = false;

for (const modelName of chain) {
  process.stdout.write(`Probando ${modelName}… `);
  try {
    const supportsThinking = /gemini-2\.5|gemini-3/i.test(modelName);
    const response = await ai.models.generateContent({
      model: modelName,
      contents: 'Responde solo con el JSON {"ok":true} sin markdown.',
      config: {
        ...(supportsThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        temperature: 0.1,
        maxOutputTokens: 64,
      },
    });
    const text = (response.text ?? "").trim();
    console.log(`OK → ${text.slice(0, 60)}`);
    ok = true;
    break;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("FAIL");
    console.log(`  ${msg.slice(0, 280)}`);
  }
}

if (!ok) {
  console.error("\nNingún modelo respondió. Revisa clave, cuota y facturación en AI Studio.");
  process.exit(1);
}

console.log("\nGemini OK.");
