import fs from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import {
  generateContentWithModelChain,
  userMessageForGeminiFailure,
  classifyGeminiError,
  type GeminiContentPart,
} from "./geminiChainedContent.js";
import {
  resolveKnowledgeFiles,
  SUPPORT_TOPICS,
  type SupportTopicId,
  type SupportVehicle,
} from "./supportKnowledgePaths.js";

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 4;

async function fileToParts(filePath: string): Promise<GeminiContentPart[]> {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  const buf = fs.readFileSync(filePath);
  if (buf.length > MAX_FILE_BYTES) {
    return [{ text: `[Documento omitido por tamaño: ${name}]` }];
  }

  if (ext === ".pdf") {
    return [
      { text: `--- Documento: ${name} ---` },
      { inlineData: { mimeType: "application/pdf", data: buf.toString("base64") } },
    ];
  }

  if (ext === ".txt") {
    return [{ text: `--- Documento: ${name} ---\n${buf.toString("utf8").slice(0, 120_000)}` }];
  }

  if (ext === ".docx") {
    const extracted = await mammoth.extractRawText({ buffer: buf });
    const text = extracted.value.trim().slice(0, 120_000);
    return [{ text: `--- Documento: ${name} ---\n${text || "(sin texto extraíble)"}` }];
  }

  return [];
}

function topicLabel(topic: SupportTopicId, vehicle?: SupportVehicle): string {
  const meta = SUPPORT_TOPICS.find((t) => t.id === topic);
  let label = meta ? `${meta.emoji} ${meta.label}` : `Tema ${topic}`;
  if (topic === 1 && vehicle) {
    label += vehicle === "nammi" ? " (Nammi)" : " (Aeolus / Sky)";
  }
  return label;
}

export async function answerSupportKnowledgeQuestion(input: {
  topic: SupportTopicId;
  vehicle?: SupportVehicle;
  question: string;
  clientName?: string;
}): Promise<{ answer: string; sources: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("El asistente no está configurado (falta GEMINI_API_KEY).");
  }

  const question = input.question.trim();
  if (question.length < 3) {
    throw new Error("Escribe una pregunta un poco más detallada.");
  }
  if (question.length > 2000) {
    throw new Error("La pregunta es demasiado larga.");
  }

  if (input.topic === 1 && !input.vehicle) {
    throw new Error("Indica si tu vehículo es Nammi o Aeolus.");
  }

  const files = resolveKnowledgeFiles(input.topic, input.vehicle).slice(0, MAX_FILES_PER_REQUEST);
  if (!files.length) {
    throw new Error(
      "No hay documentos cargados para este tema todavía. Contacta a soporte atoo.",
    );
  }

  const docParts: GeminiContentPart[] = [];
  for (const file of files) {
    docParts.push(...(await fileToParts(file)));
  }

  const sources = files.map((f) => path.basename(f));
  const who = input.clientName?.trim() ? `El cliente se llama ${input.clientName.trim()}.` : "";
  const category = topicLabel(input.topic, input.vehicle);

  const system = [
    "Eres el asistente de soporte de atoo (Colombia, vehículos eléctricos rent to own).",
    who,
    `Categoría actual: ${category}.`,
    "Responde en español, claro y breve (máximo 8 oraciones salvo que pidan pasos).",
    "Usa SOLO la información de los documentos adjuntos. Si no está en los documentos, dilo y sugiere contactar soporte humano.",
    "No inventes cifras, fechas, teléfonos ni cláusulas legales.",
    "Si es emergencia (tema 5), prioriza seguridad y pasos inmediatos.",
    "No pidas datos bancarios completos ni contraseñas.",
  ].join("\n");

  const parts: GeminiContentPart[] = [
    { text: system },
    ...docParts,
    { text: `Pregunta del cliente:\n${question}` },
  ];

  try {
    const { text } = await generateContentWithModelChain(apiKey, parts, "[support-chat]");
    return { answer: text.trim(), sources };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const kind = classifyGeminiError(raw);
    throw new Error(userMessageForGeminiFailure(kind));
  }
}
