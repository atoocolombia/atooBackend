import {
  actionButton,
  emailLayout,
  escapeHtml,
  sendTransactionalEmail,
} from "./deliveryEmails.js";
import { resolveSupportHandoffInbox } from "./supportHandoffEmail.js";

function publicAppUrl(path: string): string {
  const base = (process.env.FRONTEND_URL ?? "https://www.atoo.io").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function formatDateColombia(d: Date): string {
  return d.toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "long",
  });
}

/** Aviso al equipo analista cuando un cliente solicita salir de la geocerca. */
export async function sendGeofenceExitRequestToAnalystEmail(input: {
  clientName: string;
  clientEmail: string;
  reason: string;
  destination: string | null;
  requestedFrom: Date;
  requestedUntil: Date;
}): Promise<void> {
  const to = resolveSupportHandoffInbox();
  const reviewUrl = publicAppUrl("/analista?view=geofence-exit");
  const safeName = escapeHtml(input.clientName);
  const safeEmail = escapeHtml(input.clientEmail);
  const safeReason = escapeHtml(input.reason);
  const fromLabel = formatDateColombia(input.requestedFrom);
  const untilLabel = formatDateColombia(input.requestedUntil);
  const destLine = input.destination
    ? `<p style="margin:0 0 12px;color:#374151;line-height:1.6;"><strong>Destino:</strong> ${escapeHtml(input.destination)}</p>`
    : "";

  const html = emailLayout(
    "Nueva solicitud de salida de geocerca",
    `<p style="margin:0 0 12px;color:#374151;line-height:1.6;">
      <strong>${safeName}</strong> (${safeEmail}) pidió autorización para circular fuera del perímetro.
    </p>
    <p style="margin:0 0 12px;color:#374151;line-height:1.6;">
      <strong>Salida:</strong> ${escapeHtml(fromLabel)}<br/>
      <strong>Regreso:</strong> ${escapeHtml(untilLabel)}
    </p>
    ${destLine}
    <p style="margin:0 0 12px;color:#374151;line-height:1.6;background:#f3f4f6;padding:12px;border-radius:8px;">
      <strong>Motivo:</strong><br/>${safeReason}
    </p>
    ${actionButton("Revisar en panel analista", reviewUrl)}`,
  );

  const text = `Salida de geocerca — ${input.clientName} (${input.clientEmail})
Salida: ${fromLabel}
Regreso: ${untilLabel}
${input.destination ? `Destino: ${input.destination}\n` : ""}Motivo: ${input.reason}

Revisar: ${reviewUrl}`;

  await sendTransactionalEmail({
    to,
    subject: `Salida de geocerca — ${input.clientName}`,
    html,
    text,
  });
}
