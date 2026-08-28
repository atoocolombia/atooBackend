import { prisma } from "./prisma.js";
import { sendWhatsAppSequence, sendWhatsAppText } from "./whatsappCloudApi.js";

type BotState =
  | "awaiting_profile"
  | "awaiting_menu"
  | "awaiting_vehicle_model"
  | "awaiting_question";

interface Session {
  state: BotState;
  name?: string;
  email?: string;
  vehicle?: "nammi" | "aeolus" | "none" | "unknown";
  topic?: number;
  updatedAt: number;
}

const sessions = new Map<string, Session>();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function getSession(waId: string): Session {
  const existing = sessions.get(waId);
  if (existing && Date.now() - existing.updatedAt < SESSION_TTL_MS) {
    return existing;
  }
  const fresh: Session = { state: "awaiting_profile", updatedAt: Date.now() };
  sessions.set(waId, fresh);
  return fresh;
}

function saveSession(waId: string, session: Session): void {
  session.updatedAt = Date.now();
  sessions.set(waId, session);
}

function normalizeText(raw: string): string {
  return raw.trim().toLowerCase();
}

function extractEmail(text: string): string | undefined {
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?.[0]?.toLowerCase();
}

function extractVehicle(text: string): Session["vehicle"] {
  const t = normalizeText(text);
  if (/\bnammi\b/.test(t)) return "nammi";
  if (/\baeolus\b|\bsky\b/.test(t)) return "aeolus";
  if (/no tengo|sin veh[ií]culo|a[uú]n no/.test(t)) return "none";
  return "unknown";
}

function extractName(text: string, email?: string): string | undefined {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (extractEmail(line)) continue;
    if (/^\d+$/.test(line)) continue;
    if (/nammi|aeolus|sky|veh[ií]culo/i.test(line)) continue;
    if (line.length >= 3 && line.length <= 80) return line;
  }
  return undefined;
}

function menuMessage(): string {
  return `Elige una opción (responde con el número):

*1* 🚗 Dudas del vehículo
*2* 📄 Dudas del contrato
*3* 💳 Dudas de pagos y cuotas
*4* 🛡️ Dudas del seguro
*5* 🆘 Emergencia

Escribe *menu* para ver esto de nuevo.`;
}

async function welcomeSequence(waId: string): Promise<void> {
  await sendWhatsAppSequence(waId, [
    "¡Hola! 👋 Soy el asistente de soporte de *atoo*.",
    "Para ayudarte, envíame en *un solo mensaje*:\n• Tu *nombre completo*\n• Tu *correo* o *cédula* registrada en atoo\n• Tu *vehículo*: Nammi, Aeolus o «aún no tengo»",
    menuMessage(),
  ]);
  saveSession(waId, { state: "awaiting_profile", updatedAt: Date.now() });
}

async function lookupClient(email?: string) {
  if (!email) return null;
  return prisma.user.findUnique({
    where: { email },
    include: {
      vehiclePlan: true,
      identityExtraction: true,
    },
  });
}

function vehicleFromDb(
  plan: { vehicleName: string } | null | undefined,
): Session["vehicle"] {
  if (!plan?.vehicleName) return "none";
  const name = plan.vehicleName.toLowerCase();
  if (name.includes("nammi")) return "nammi";
  if (name.includes("aeolus") || name.includes("sky")) return "aeolus";
  return "unknown";
}

async function confirmProfile(waId: string, session: Session, text: string): Promise<void> {
  const email = extractEmail(text);
  const vehicleHint = extractVehicle(text);
  let name = extractName(text, email);

  const dbUser = await lookupClient(email);
  if (dbUser) {
    const fromDb = dbUser.identityExtraction;
    name =
      [fromDb?.firstName, fromDb?.lastName].filter(Boolean).join(" ").trim() ||
      name ||
      dbUser.email.split("@")[0];
    session.email = dbUser.email;
    session.vehicle = vehicleFromDb(dbUser.vehiclePlan) ?? vehicleHint;
  } else {
    session.email = email;
    session.vehicle = vehicleHint;
    session.name = name;
  }

  session.name = name ?? session.name;
  session.state = "awaiting_menu";
  saveSession(waId, session);

  const vehicleLabel =
    session.vehicle === "nammi"
      ? "Dongfeng Nammi"
      : session.vehicle === "aeolus"
        ? "Dongfeng Aeolus Sky EV01"
        : session.vehicle === "none"
          ? "sin vehículo asignado aún"
          : "vehículo por confirmar";

  const greeting = dbUser
    ? `Gracias, *${session.name ?? "cliente"}*. Te encontré en atoo (${session.email}). Tu vehículo registrado: *${vehicleLabel}*.`
    : `Gracias, *${session.name ?? "cliente"}*. ${email ? `Anoté ${email}.` : "No vi un correo; si ya estás registrado, inclúyelo."} Vehículo: *${vehicleLabel}*.`;

  await sendWhatsAppSequence(waId, [greeting, menuMessage()]);
}

function topicIntro(topic: number, session: Session): string {
  const who = session.name ? `, ${session.name}` : "";
  switch (topic) {
    case 1:
      return `Perfecto${who}. Sobre tu vehículo:`;
    case 2:
      return `Sobre tu *contrato Rent to Own*${who}:`;
    case 3:
      return `Sobre *pagos y cuotas*${who}:`;
    case 4:
      return `Sobre *seguro*${who}:`;
    case 5:
      return `🆘 *Emergencia*${who} — responde de inmediato:`;
    default:
      return "Cuéntame más:";
  }
}

function extractTrailingMenuChoice(text: string): { body: string; choice?: number } {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { body: text };
  const last = lines[lines.length - 1];
  if (/^[1-5]$/.test(last)) {
    return { body: lines.slice(0, -1).join("\n"), choice: Number(last) };
  }
  return { body: text };
}

function topicBody(topic: number, session: Session): string {
  const vehicle =
    session.vehicle === "nammi"
      ? "Nammi"
      : session.vehicle === "aeolus"
        ? "Aeolus"
        : "tu vehículo";

  switch (topic) {
    case 1:
      if (session.vehicle === "nammi" || session.vehicle === "aeolus") {
        return (
          `Puedo ayudarte con carga, autonomía, mantenimiento y uso diario del ${vehicle}.\n\n` +
          "Escribe tu duda concreta (ej.: «¿cada cuánto cargo?», «luz de batería»).\n\n" +
          "Pronto conectaremos la IA con el manual oficial; por ahora un asesor revisará tu caso."
        );
      }
      return (
        "¿Tu vehículo es *Nammi* o *Aeolus*? Responde con el nombre.\n\n" +
        "Si aún no tienes asignación, indícalo y revisamos tu solicitud."
      );
    case 2:
      return (
        "Temas frecuentes: plazo del contrato, cuándo pasa a tu nombre, devolución o terminación.\n\n" +
        "Escribe tu pregunta específica. No compartas datos bancarios completos por este chat."
      );
    case 3:
      return (
        "Indica: fecha del pago, monto, si ves un cobro duplicado o un retraso.\n\n" +
        "Revisaremos tu cuenta en atoo y te respondemos en horario hábil (lun–vie 8:00–18:00)."
      );
    case 4:
      return (
        "¿Es sobre *cobertura*, *siniestro* o *renovación*?\n\n" +
        "Describe qué pasó. Si hubo accidente, incluye ciudad y si hay lesionados."
      );
    case 5:
      return (
        "¿Estás a salvo? Indica:\n• Ubicación aproximada\n• Placa o VIN\n• Qué ocurrió (falla, accidente, batería)\n\n" +
        "Escalamos a asistencia lo antes posible."
      );
    default:
      return menuMessage();
  }
}

async function handleMenuChoice(waId: string, session: Session, choice: number): Promise<void> {
  session.topic = choice;
  if (choice === 1 && session.vehicle !== "nammi" && session.vehicle !== "aeolus") {
    session.state = "awaiting_vehicle_model";
    saveSession(waId, session);
    await sendWhatsAppText(
      waId,
      "¿Tu vehículo es *Nammi* o *Aeolus*? (o escribe «aún no tengo»)",
    );
    return;
  }

  session.state = "awaiting_question";
  saveSession(waId, session);
  await sendWhatsAppSequence(waId, [topicIntro(choice, session), topicBody(choice, session)]);
}

export async function handleWhatsAppIncoming(waId: string, textBody: string): Promise<void> {
  const text = textBody.trim();
  if (!text) return;

  const normalized = normalizeText(text);

  if (/^(hola|buenas|menu|menú|inicio|ayuda|soporte|atoo)/.test(normalized)) {
    await welcomeSequence(waId);
    return;
  }

  const session = getSession(waId);

  if (/^menu$|^menú$/.test(normalized)) {
    session.state = "awaiting_menu";
    saveSession(waId, session);
    await sendWhatsAppText(waId, menuMessage());
    return;
  }

  const menuDigit = normalized.match(/^([1-5])$/);
  if (menuDigit && (session.state === "awaiting_menu" || session.state === "awaiting_question")) {
    await handleMenuChoice(waId, session, Number(menuDigit[1]));
    return;
  }

  if (session.state === "awaiting_vehicle_model") {
    session.vehicle = extractVehicle(text);
    session.state = "awaiting_question";
    saveSession(waId, session);
    await sendWhatsAppSequence(waId, [
      `Anotado: ${session.vehicle === "nammi" ? "Nammi" : session.vehicle === "aeolus" ? "Aeolus" : "por confirmar"}.`,
      topicBody(1, session),
    ]);
    return;
  }

  if (session.state === "awaiting_profile") {
    const { body, choice } = extractTrailingMenuChoice(text);
    await confirmProfile(waId, session, body);
    if (choice) {
      const updated = getSession(waId);
      await handleMenuChoice(waId, updated, choice);
    }
    return;
  }

  if (session.state === "awaiting_question") {
    await sendWhatsAppSequence(waId, [
      "Recibí tu consulta. Un asesor o la IA revisará los documentos oficiales y te responderá pronto.",
      "Si necesitas otra cosa, escribe *menu*.\n\n" + menuMessage(),
    ]);
    session.state = "awaiting_menu";
    saveSession(waId, session);
    return;
  }

  await welcomeSequence(waId);
}
