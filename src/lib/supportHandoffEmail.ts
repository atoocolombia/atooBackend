import {
  actionButton,
  emailLayout,
  escapeHtml,
  sendTransactionalEmail,
} from "./deliveryEmails.js";
import { resolvePublicClientOrigin } from "./clientPublicOrigin.js";

/** Quién recibe el aviso cuando un cliente pide humano (no es el remitente). */
export function resolveSupportHandoffInbox(): string {
  return (
    process.env.SUPPORT_HANDOFF_EMAIL?.trim().toLowerCase() || "atoocolombia@gmail.com"
  );
}

export function resolveAdminChatUrl(sessionId: string): string {
  const base = resolvePublicClientOrigin();
  return `${base}/admin?supportChat=${encodeURIComponent(sessionId)}`;
}

/** Mismo canal Resend y mismo remitente (`RESEND_FROM`) que «Activa tu cuenta atoo». */
export async function sendSupportHandoffEmail(input: {
  sessionId: string;
  clientEmail: string;
  clientName: string;
  lastUserMessage: string;
  topicLabel?: string;
  reminder?: boolean;
}): Promise<void> {
  const to = resolveSupportHandoffInbox();
  const chatUrl = resolveAdminChatUrl(input.sessionId);
  const safeName = escapeHtml(input.clientName);
  const safeEmail = escapeHtml(input.clientEmail);
  const safeMsg = escapeHtml(input.lastUserMessage.slice(0, 500));
  const topicLine = input.topicLabel
    ? `<p style="margin:0 0 12px;color:#374151;line-height:1.6;"><strong>Tema:</strong> ${escapeHtml(input.topicLabel)}</p>`
    : "";

  const title = input.reminder
    ? "Recordatorio: cliente sigue esperando atención humana"
    : "Cliente pide hablar con un humano";

  const html = emailLayout(
    title,
    `<p style="margin:0 0 12px;color:#374151;line-height:1.6;">
      <strong>${safeName}</strong> (${safeEmail}) solicitó atención humana en el chat de ayuda IA.
    </p>
    ${topicLine}
    <p style="margin:0 0 12px;color:#374151;line-height:1.6;background:#f3f4f6;padding:12px;border-radius:8px;">
      <strong>Último mensaje:</strong><br/>${safeMsg}
    </p>
    ${actionButton("Ver conversación y responder", chatUrl)}`,
  );

  const text = `Cliente ${input.clientName} (${input.clientEmail}) pide hablar con un humano.\n\nÚltimo mensaje: ${input.lastUserMessage}\n\nAbrir chat: ${chatUrl}`;

  const subjectPrefix = input.reminder ? "Recordatorio chat IA" : "Chat IA";

  await sendTransactionalEmail({
    to,
    subject: `[atoo] ${subjectPrefix} — ${input.clientName} pide atención humana`,
    html,
    text,
  });
}
