import {
  allQuestionIds,
  findQuestion,
  KNOWLEDGE_SECTIONS,
  publicQuestionsForSection,
  type KnowledgeSectionId,
} from "./applicationKnowledgeTestContent.js";
import { prisma } from "./prisma.js";

function sectionScorePercent(sectionId: KnowledgeSectionId, answers: Record<string, number>): number {
  const section = KNOWLEDGE_SECTIONS[sectionId];
  if (section.questions.length === 0) return 0;
  let correct = 0;
  for (const q of section.questions) {
    const chosen = answers[q.id];
    if (typeof chosen === "number" && chosen === q.correctIndex) correct += 1;
  }
  return Math.round((correct / section.questions.length) * 1000) / 10;
}

export function computeWeightedScore(scores: {
  includeEv: boolean;
  evScore: number | null;
  vialScore: number;
  customerServiceScore: number;
}): number {
  if (scores.includeEv && scores.evScore != null) {
    const w = 0.25 * scores.evScore + 0.375 * scores.vialScore + 0.375 * scores.customerServiceScore;
    return Math.round(w * 10) / 10;
  }
  const w = 0.5 * scores.vialScore + 0.5 * scores.customerServiceScore;
  return Math.round(w * 10) / 10;
}

export async function userRequiresEvKnowledgeTest(userId: string): Promise<boolean> {
  const row = await prisma.userWorkAddressExtraction.findUnique({
    where: { userId },
    select: { mobilityDrivenElectricVehicle: true },
  });
  return row?.mobilityDrivenElectricVehicle === true;
}

export async function getApplicationKnowledgeTestState(userId: string) {
  const includeEv = await userRequiresEvKnowledgeTest(userId);
  const existing = await prisma.userApplicationKnowledgeTest.findUnique({ where: { userId } });

  const sections = [];
  if (includeEv) {
    sections.push({
      id: KNOWLEDGE_SECTIONS.ev.id,
      title: KNOWLEDGE_SECTIONS.ev.title,
      description: KNOWLEDGE_SECTIONS.ev.description,
      questions: publicQuestionsForSection(KNOWLEDGE_SECTIONS.ev),
    });
  }
  sections.push({
    id: KNOWLEDGE_SECTIONS.vial.id,
    title: KNOWLEDGE_SECTIONS.vial.title,
    description: KNOWLEDGE_SECTIONS.vial.description,
    questions: publicQuestionsForSection(KNOWLEDGE_SECTIONS.vial),
  });
  sections.push({
    id: KNOWLEDGE_SECTIONS.customerService.id,
    title: KNOWLEDGE_SECTIONS.customerService.title,
    description: KNOWLEDGE_SECTIONS.customerService.description,
    questions: publicQuestionsForSection(KNOWLEDGE_SECTIONS.customerService),
  });

  return {
    completed: Boolean(existing),
    includeEvSection: includeEv,
    sections,
    scores: existing
      ? {
          evScore: existing.evScore,
          vialScore: existing.vialScore,
          customerServiceScore: existing.customerServiceScore,
          weightedScore: existing.weightedScore,
        }
      : null,
  };
}

export async function submitApplicationKnowledgeTest(
  userId: string,
  answers: Record<string, unknown>,
): Promise<
  | { ok: true; scores: { evScore: number | null; vialScore: number; customerServiceScore: number; weightedScore: number } }
  | { ok: false; error: string }
> {
  const existing = await prisma.userApplicationKnowledgeTest.findUnique({ where: { userId } });
  if (existing) {
    return { ok: false, error: "Ya completaste esta evaluación." };
  }

  const includeEv = await userRequiresEvKnowledgeTest(userId);
  const requiredIds = allQuestionIds(includeEv);
  const normalized: Record<string, number> = {};

  for (const id of requiredIds) {
    const raw = answers[id];
    if (typeof raw !== "number" || !Number.isInteger(raw)) {
      return { ok: false, error: `Falta respuesta válida para la pregunta ${id}` };
    }
    const q = findQuestion(id);
    if (!q || raw < 0 || raw >= q.options.length) {
      return { ok: false, error: `Respuesta inválida para la pregunta ${id}` };
    }
    normalized[id] = raw;
  }

  const vialScore = sectionScorePercent("vial", normalized);
  const customerServiceScore = sectionScorePercent("customerService", normalized);
  const evScore = includeEv ? sectionScorePercent("ev", normalized) : null;
  const weightedScore = computeWeightedScore({
    includeEv,
    evScore,
    vialScore,
    customerServiceScore,
  });

  await prisma.userApplicationKnowledgeTest.upsert({
    where: { userId },
    create: {
      userId,
      includeEvSection: includeEv,
      evScore,
      vialScore,
      customerServiceScore,
      weightedScore,
    },
    update: {
      includeEvSection: includeEv,
      evScore,
      vialScore,
      customerServiceScore,
      weightedScore,
    },
  });

  return {
    ok: true,
    scores: { evScore, vialScore, customerServiceScore, weightedScore },
  };
}
