/**
 * Prueba rápida de Gemini con la clave de backend/.env
 *
 * Uso:
 *   cd backend && node scripts/test-gemini.mjs
 *
 * No imprime la API key. Solo indica si la llamada funciona.
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenerativeAI } from "@google/generative-ai";

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

if (skip) {
  console.warn("\nSKIP activo: la app no llamará a Gemini en uploads.");
}

const chain = resolveChain();
console.log(`Cadena: ${chain.join(" → ")}`);

const genAI = new GoogleGenerativeAI(apiKey);
let ok = false;

for (const modelName of chain) {
  process.stdout.write(`Probando ${modelName}… `);
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(
      'Responde solo con el JSON {"ok":true} sin markdown.',
    );
    const text = result.response.text().trim();
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
  console.error("\nNingún modelo respondió. Revisa:");
  console.error("  1) Que la clave sea de AI Studio (https://aistudio.google.com/apikey)");
  console.error("  2) Que GEMINI_MODEL no sea gemini-1.5-* (obsoleto)");
  console.error("  3) Cuota / facturación en Google AI Studio");
  process.exit(1);
}

console.log("\nGemini OK. Puedes subir un documento en la solicitud y debería validarse con IA.");
