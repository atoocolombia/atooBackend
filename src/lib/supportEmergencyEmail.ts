import {
  actionButton,
  emailLayout,
  escapeHtml,
  sendTransactionalEmail,
} from "./deliveryEmails.js";
import { resolveAdminChatUrl, resolveSupportEmergencyInboxes } from "./supportHandoffEmail.js";
import { ATOO_BUSINESS_HOURS_NOTE } from "./supportEmergencyContent.js";

export async function sendSupportEmergencyReportEmail(input: {
  sessionId: string;
  clientEmail: string;
  clientName: string;
  location: string;
  description: string;
  situationLabel: string;
  clientSafe: boolean;
  vehicleLabel?: string;
}): Promise<void> {
  const to = resolveSupportEmergencyInboxes();
  const chatUrl = resolveAdminChatUrl(input.sessionId);
  const safeLine = input.clientSafe
    ? "El cliente indicó que está a salvo en este momento."
    : "⚠️ El cliente NO confirmó estar a salvo — priorizar contacto.";

  const html = emailLayout(
    "Reporte de emergencia — cliente atoo",
    `<p style="margin:0 0 12px;color:#374151;line-height:1.6;">
      <strong>${escapeHtml(input.clientName)}</strong> (${escapeHtml(input.clientEmail)})
      reportó una emergencia desde el chat de ayuda (tema Emergencia).
    </p>
    <p style="margin:0 0 12px;color:#374151;line-height:1.6;"><strong>Situación:</strong> ${escapeHtml(input.situationLabel)}</p>
    <p style="margin:0 0 12px;color:#374151;line-height:1.6;"><strong>Ubicación:</strong> ${escapeHtml(input.location)}</p>
    ${
      input.vehicleLabel
        ? `<p style="margin:0 0 12px;color:#374151;line-height:1.6;"><strong>Vehículo:</strong> ${escapeHtml(input.vehicleLabel)}</p>`
        : ""
    }
    <p style="margin:0 0 12px;color:#374151;line-height:1.6;background:#fef2f2;padding:12px;border-radius:8px;border:1px solid #fecaca;">
      <strong>Qué ocurrió:</strong><br/>${escapeHtml(input.description.slice(0, 2000))}
    </p>
    <p style="margin:0 0 12px;color:#374151;line-height:1.6;">${escapeHtml(safeLine)}</p>
    <p style="margin:0 0 12px;color:#6b7280;font-size:14px;line-height:1.6;">${escapeHtml(ATOO_BUSINESS_HOURS_NOTE)}</p>
    <p style="margin:0 0 12px;color:#374151;line-height:1.6;">Quedó en cola de seguimiento empresarial; el cliente puede seguir consultando la IA mientras tanto.</p>
    ${actionButton("Abrir conversación", chatUrl)}`,
  );

  const text = [
    `Emergencia reportada por ${input.clientName} (${input.clientEmail})`,
    `Situación: ${input.situationLabel}`,
    `Ubicación: ${input.location}`,
    input.vehicleLabel ? `Vehículo: ${input.vehicleLabel}` : "",
    `Detalle: ${input.description}`,
    safeLine,
    ATOO_BUSINESS_HOURS_NOTE,
    `Chat: ${chatUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  await sendTransactionalEmail({
    to,
    subject: `[atoo URGENTE] Emergencia — ${input.clientName}`,
    html,
    text,
  });
}
