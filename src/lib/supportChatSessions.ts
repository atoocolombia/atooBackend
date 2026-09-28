import { randomBytes } from "node:crypto";
import type { SupportChatMessage, SupportChatSession } from "@prisma/client";
import { SupportChatSessionStatus } from "@prisma/client";
import { prisma } from "./prisma.js";
import { detectSupportHumanRequest } from "./detectSupportHumanRequest.js";
import { sendSupportHandoffEmail } from "./supportHandoffEmail.js";
import { SUPPORT_TOPICS } from "./supportKnowledgePaths.js";
import { buildClientName } from "./mapVehicleDelivery.js";

function newId(): string {
  return randomBytes(12).toString("hex");
}

const OPEN_STATUSES: SupportChatSessionStatus[] = [
  SupportChatSessionStatus.AI,
  SupportChatSessionStatus.HUMAN_REQUESTED,
  SupportChatSessionStatus.HUMAN_ACTIVE,
];

export type SupportChatMessageDto = {
  id: string;
  role: "user" | "bot" | "agent";
  text: string;
  createdAt: string;
};

export type SupportChatSessionDto = {
  id: string;
  status: "ai" | "human_requested" | "human_active" | "closed";
  topic: number | null;
  messages: SupportChatMessageDto[];
  updatedAt: string;
};

function mapRole(role: SupportChatMessage["role"]): SupportChatMessageDto["role"] {
  switch (role) {
    case "USER":
      return "user";
    case "AGENT":
      return "agent";
    default:
      return "bot";
  }
}

function mapStatus(status: SupportChatSession["status"]): SupportChatSessionDto["status"] {
  switch (status) {
    case "HUMAN_REQUESTED":
      return "human_requested";
    case "HUMAN_ACTIVE":
      return "human_active";
    case "CLOSED":
      return "closed";
    default:
      return "ai";
  }
}

function mapSession(
  session: SupportChatSession & { messages: SupportChatMessage[] },
): SupportChatSessionDto {
  return {
    id: session.id,
    status: mapStatus(session.status),
    topic: session.topic,
    updatedAt: session.updatedAt.toISOString(),
    messages: session.messages.map((m) => ({
      id: m.id,
      role: mapRole(m.role),
      text: m.text,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function getActiveSupportChatSession(userId: string): Promise<SupportChatSessionDto | null> {
  const session = await prisma.supportChatSession.findFirst({
    where: { userId, status: { in: OPEN_STATUSES } },
    orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return session ? mapSession(session) : null;
}

export async function getOrCreateSupportChatSession(
  userId: string,
  sessionId?: string,
): Promise<SupportChatSession & { messages: SupportChatMessage[] }> {
  if (sessionId) {
    const existing = await prisma.supportChatSession.findFirst({
      where: { id: sessionId, userId, status: { in: OPEN_STATUSES } },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (existing) return existing;
  }

  const active = await prisma.supportChatSession.findFirst({
    where: { userId, status: { in: OPEN_STATUSES } },
    orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (active) return active;

  return prisma.supportChatSession.create({
    data: { id: newId(), userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

async function appendMessage(
  sessionId: string,
  role: SupportChatMessage["role"],
  text: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.supportChatMessage.create({
      data: { id: newId(), sessionId, role, text },
    }),
    prisma.supportChatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    }),
  ]);
}

function topicLabel(topic: number | null | undefined): string | undefined {
  if (!topic) return undefined;
  return SUPPORT_TOPICS.find((t) => t.id === topic)?.label;
}

async function loadUserForHandoff(userId: string): Promise<{ email: string; clientName: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { identityExtraction: true },
  });
  if (!user) throw new Error("Usuario no encontrado");
  return {
    email: user.email,
    clientName: buildClientName(user.identityExtraction, user.email),
  };
}

export async function requestHumanHandoff(input: {
  userId: string;
  sessionId: string;
  triggerMessage: string;
}): Promise<{ notified: boolean }> {
  const session = await prisma.supportChatSession.findFirst({
    where: { id: input.sessionId, userId: input.userId },
  });
  if (!session) throw new Error("Sesión no encontrada");

  const now = new Date();
  const needsEmail = !session.humanNotifiedAt;

  await prisma.supportChatSession.update({
    where: { id: session.id },
    data: {
      status: SupportChatSessionStatus.HUMAN_REQUESTED,
      handoffAt: session.handoffAt ?? now,
      humanNotifiedAt: needsEmail ? now : session.humanNotifiedAt,
    },
  });

  if (!needsEmail) return { notified: false };

  const { email, clientName } = await loadUserForHandoff(input.userId);
  try {
    await sendSupportHandoffEmail({
      sessionId: session.id,
      clientEmail: email,
      clientName,
      lastUserMessage: input.triggerMessage,
      topicLabel: topicLabel(session.topic),
    });
    return { notified: true };
  } catch (err) {
    console.error("[support-chat] No se pudo enviar correo de escalamiento:", err);
    return { notified: false };
  }
}

const HANDOFF_ACK =
  "Entendido. Un miembro del equipo de atoo revisará esta conversación y te responderá aquí mismo en breve. Puedes seguir escribiendo tu consulta.";

const HUMAN_QUEUE_ACK =
  "Tu mensaje fue recibido. Estamos en cola para atención humana; te responderemos pronto en este chat.";

export async function handleSupportChatUserMessage(input: {
  userId: string;
  sessionId?: string;
  topic?: number;
  question: string;
  requestHuman?: boolean;
}): Promise<{
  session: SupportChatSessionDto;
  answer: string;
  handoff: boolean;
  skipAi: boolean;
}> {
  const question = input.question.trim();
  if (question.length < 1) {
    throw new Error("Escribe un mensaje");
  }

  let session = await getOrCreateSupportChatSession(input.userId, input.sessionId);
  if (input.topic && [1, 2, 3, 4, 5].includes(input.topic)) {
    if (session.topic !== input.topic) {
      session = await prisma.supportChatSession.update({
        where: { id: session.id },
        data: { topic: input.topic },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    }
  }

  await appendMessage(session.id, "USER", question);

  const current = await prisma.supportChatSession.findUniqueOrThrow({
    where: { id: session.id },
  });

  if (detectSupportHumanRequest(question) || input.requestHuman) {
    await requestHumanHandoff({
      userId: input.userId,
      sessionId: session.id,
      triggerMessage: question,
    });
    await appendMessage(session.id, "BOT", HANDOFF_ACK);
    const refreshed = await prisma.supportChatSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    return {
      session: mapSession(refreshed),
      answer: HANDOFF_ACK,
      handoff: true,
      skipAi: true,
    };
  }

  if (current.status !== SupportChatSessionStatus.AI) {
    await appendMessage(session.id, "BOT", HUMAN_QUEUE_ACK);
    const refreshed = await prisma.supportChatSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    return {
      session: mapSession(refreshed),
      answer: HUMAN_QUEUE_ACK,
      handoff: true,
      skipAi: true,
    };
  }

  const refreshed = await prisma.supportChatSession.findUniqueOrThrow({
    where: { id: session.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return {
    session: mapSession(refreshed),
    answer: "",
    handoff: false,
    skipAi: false,
  };
}

export async function appendBotAnswer(sessionId: string, answer: string): Promise<SupportChatSessionDto> {
  await appendMessage(sessionId, "BOT", answer);
  const refreshed = await prisma.supportChatSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return mapSession(refreshed);
}

export async function listSupportChatSessionsForAdmin(statusFilter?: string) {
  const openStatuses: SupportChatSessionStatus[] = [
    SupportChatSessionStatus.HUMAN_REQUESTED,
    SupportChatSessionStatus.HUMAN_ACTIVE,
  ];
  const allListed: SupportChatSessionStatus[] = [
    ...openStatuses,
    SupportChatSessionStatus.CLOSED,
  ];
  const where =
    statusFilter === "closed"
      ? { status: SupportChatSessionStatus.CLOSED }
      : statusFilter === "all"
        ? { status: { in: allListed } }
        : { status: { in: openStatuses } };

  const rows = await prisma.supportChatSession.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      user: { include: { identityExtraction: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    status: mapStatus(row.status),
    topic: row.topic,
    topicLabel: topicLabel(row.topic),
    updatedAt: row.updatedAt.toISOString(),
    clientEmail: row.user.email,
    clientName: buildClientName(row.user.identityExtraction, row.user.email),
    lastMessage: row.messages[0]
      ? {
          role: mapRole(row.messages[0].role),
          text: row.messages[0].text,
          createdAt: row.messages[0].createdAt.toISOString(),
        }
      : null,
  }));
}

export async function getSupportChatSessionForAdmin(sessionId: string) {
  const row = await prisma.supportChatSession.findUnique({
    where: { id: sessionId },
    include: {
      user: { include: { identityExtraction: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!row) return null;
  return {
    ...mapSession(row),
    clientEmail: row.user.email,
    clientName: buildClientName(row.user.identityExtraction, row.user.email),
    topicLabel: topicLabel(row.topic),
  };
}

export async function postAgentSupportMessage(sessionId: string, text: string, agentEmail: string) {
  const trimmed = text.trim();
  if (trimmed.length < 1) throw new Error("Escribe un mensaje");

  const session = await prisma.supportChatSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("Sesión no encontrada");
  if (session.status === SupportChatSessionStatus.CLOSED) {
    throw new Error("Esta conversación está cerrada");
  }

  const prefix = `[${agentEmail.split("@")[0]}] `;
  await appendMessage(sessionId, "AGENT", `${prefix}${trimmed}`);

  if (session.status === SupportChatSessionStatus.HUMAN_REQUESTED) {
    await prisma.supportChatSession.update({
      where: { id: sessionId },
      data: { status: SupportChatSessionStatus.HUMAN_ACTIVE },
    });
  }

  return getSupportChatSessionForAdmin(sessionId);
}

export async function updateSupportChatSessionStatus(
  sessionId: string,
  status: "HUMAN_ACTIVE" | "CLOSED",
) {
  const prismaStatus =
    status === "CLOSED"
      ? SupportChatSessionStatus.CLOSED
      : SupportChatSessionStatus.HUMAN_ACTIVE;
  await prisma.supportChatSession.update({
    where: { id: sessionId },
    data: { status: prismaStatus },
  });
  return getSupportChatSessionForAdmin(sessionId);
}
