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
  extractPdfText,
  PDF_INLINE_MAX_BYTES,
  pickRelevantTextExcerpt,
} from "./extractPdfText.js";
import {
  resolveKnowledgeFiles,
  SUPPORT_TOPICS,
  type SupportTopicId,
  type SupportVehicle,
} from "./supportKnowledgePaths.js";
import {
  SUPPORT_CHAT_GEMINI_IMAGE_MAX_BYTES,
  SUPPORT_CHAT_GEMINI_VIDEO_MAX_BYTES,
  supportChatAttachmentKind,
} from "./supportChatUpload.js";

const MAX_FILES_PER_REQUEST = 4;

async function fileToParts(
  filePath: string,
  question: string,
): Promise<GeminiContentPart[]> {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  const buf = fs.readFileSync(filePath);

  if (ext === ".pdf") {
    if (buf.length <= PDF_INLINE_MAX_BYTES) {
      return [
        { text: `--- Documento: ${name} ---` },
        { inlineData: { mimeType: "application/pdf", data: buf.toString("base64") } },
      ];
    }
    const raw = await extractPdfText(buf);
    const excerpt = pickRelevantTextExcerpt(raw, question);
    return [
      {
        text: `--- Manual (texto extraído de ${name}, manual grande) ---\n${excerpt || "(no se pudo extraer texto)"}`,
      },
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
  userMedia?: { absolutePath: string; mimeType: string };
}): Promise<{ answer: string; sources: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("El asistente no está configurado (falta GEMINI_API_KEY).");
  }

  const question = input.question.trim();
  if (question.length < 3 && !input.userMedia) {
    throw new Error("Escribe una pregunta un poco más detallada o adjunta una foto o video.");
  }
  if (question.length > 2000) {
    throw new Error("La pregunta es demasiado larga.");
  }

  if ((input.topic === 1 || input.topic === 5) && !input.vehicle) {
    throw new Error(
      "Aún no tenemos registrado tu modelo de vehículo en atoo. Escríbenos por WhatsApp para actualizar tus datos.",
    );
  }

  const files = resolveKnowledgeFiles(input.topic, input.vehicle).slice(0, MAX_FILES_PER_REQUEST);
  if (!files.length) {
    throw new Error(
      "No hay documentos cargados para este tema todavía. Contacta a soporte atoo.",
    );
  }

  const docParts: GeminiContentPart[] = [];
  for (const file of files) {
    docParts.push(...(await fileToParts(file, question)));
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
    "En seguridad (agua, incendio, accidente, alta tensión), cita los pasos del manual tal cual: salir del vehículo, no circular en agua profunda, apagar energía si aplica, no rescatar hasta que no haya riesgo eléctrico.",
    "No inventes cifras, fechas, teléfonos ni cláusulas legales.",
    "Si es emergencia (tema 5), prioriza seguridad y pasos inmediatos.",
    "No pidas datos bancarios completos ni contraseñas.",
    "Si el cliente envía foto o video, descríbelo con cuidado y relaciona con los manuales cuando aplique.",
  ].join("\n");

  const userMediaParts: GeminiContentPart[] = [];
  if (input.userMedia) {
    const kind = supportChatAttachmentKind(input.userMedia.mimeType);
    const buf = fs.readFileSync(input.userMedia.absolutePath);
    const maxBytes =
      kind === "video" ? SUPPORT_CHAT_GEMINI_VIDEO_MAX_BYTES : SUPPORT_CHAT_GEMINI_IMAGE_MAX_BYTES;
    if (kind && buf.length <= maxBytes) {
      userMediaParts.push({
        text: `--- ${kind === "video" ? "Video" : "Foto"} enviada por el cliente ---`,
      });
      userMediaParts.push({
        inlineData: { mimeType: input.userMedia.mimeType, data: buf.toString("base64") },
      });
    } else {
      userMediaParts.push({
        text:
          "--- El cliente adjuntó un archivo multimedia. Si no puedes verlo, pídele más detalle por texto o sugiere hablar con un humano. ---",
      });
    }
  }

  const questionBlock =
    question.length >= 1
      ? question
      : "El cliente adjuntó una foto o video sin texto. Describe lo que observes y responde según los manuales.";

  const parts: GeminiContentPart[] = [
    { text: system },
    ...docParts,
    ...userMediaParts,
    { text: `Pregunta del cliente:\n${questionBlock}` },
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
