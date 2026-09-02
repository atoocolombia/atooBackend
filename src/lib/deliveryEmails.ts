import { Resend } from "resend";

const BRAND_COLOR = "#1A1FE8";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function emailLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:${BRAND_COLOR};padding:20px 24px;color:#ffffff;font-size:24px;font-weight:700;">
                atoo
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px;">
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#111827;">${escapeHtml(title)}</h1>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px;color:#6b7280;font-size:12px;line-height:1.5;">
                Este correo fue enviado por atoo. Si no esperabas este mensaje, puedes ignorarlo.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function actionButton(label: string, href: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `<p style="margin:24px 0;">
    <a href="${safeHref}" style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:700;">
      ${safeLabel}
    </a>
  </p>
  <p style="margin:0;color:#6b7280;font-size:13px;word-break:break-all;">${safeHref}</p>`;
}

function normalizeClientEmail(email: string | null | undefined): string {
  const normalized = email?.trim().toLowerCase() ?? "";
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("El cliente no tiene un correo válido registrado en la entrega");
  }
  return normalized;
}

function resolveFromAddress(): string {
  const from = process.env.RESEND_FROM?.trim() || "soporte@atoo.io";
  if (from.includes("<")) return from;
  return `atoo soporte <${from}>`;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = resolveFromAddress();
  const to = normalizeClientEmail(input.to);

  if (!apiKey) {
    console.warn("[email] Falta RESEND_API_KEY");
    throw new Error("El servicio de correo no está configurado");
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (error) {
    console.error("[email] Error al enviar:", error);
    throw new Error(error.message ?? "No se pudo enviar el correo");
  }

  console.info(`[email] Enviado a ${to} desde ${from} (id: ${data?.id ?? "n/a"})`);
}

export async function sendDeliveryDocumentsEmail(clientName: string, email: string): Promise<void> {
  const clientEmail = normalizeClientEmail(email);
  const safeName = escapeHtml(clientName);
  const html = emailLayout(
    "Documentos para firmar",
    `<p style="margin:0 0 12px;color:#374151;line-height:1.6;">
      Hola ${safeName}, desde <strong>atoo</strong> te enviamos los documentos para firmar:
      contrato Rent to Own, seguro y pagaré.
    </p>
    <p style="margin:0;color:#374151;line-height:1.6;">
      Revisa los archivos que recibiste y avísanos cuando los hayas firmado para continuar con la entrega de tu vehículo.
    </p>`,
  );

  await sendTransactionalEmail({
    to: clientEmail,
    subject: "Documentos para firmar — atoo",
    html,
    text: `Hola ${clientName}, desde atoo te enviamos los documentos para firmar: contrato Rent to Own, seguro y pagaré. Avísanos cuando los hayas firmado.`,
  });
}

export async function sendDeliveryActivationEmail(
  clientName: string,
  email: string,
  setupUrl: string,
): Promise<void> {
  const clientEmail = normalizeClientEmail(email);
  const safeName = escapeHtml(clientName);
  const html = emailLayout(
    "Activa tu cuenta atoo",
    `<p style="margin:0 0 12px;color:#374151;line-height:1.6;">
      Hola ${safeName}, tu vehículo <strong>atoo</strong> fue entregado.
    </p>
    <p style="margin:0 0 12px;color:#374151;line-height:1.6;">
      Tu correo registrado es <strong>${escapeHtml(clientEmail)}</strong>. Crea tu contraseña para ingresar a la plataforma.
    </p>
    ${actionButton("Crear contraseña e ingresar", setupUrl)}`,
  );

  await sendTransactionalEmail({
    to: clientEmail,
    subject: "Activa tu cuenta atoo",
    html,
    text: `Hola ${clientName}, tu vehículo atoo fue entregado. Crea tu acceso aquí: ${setupUrl}. Tu correo registrado es ${clientEmail}.`,
  });
}

export async function sendDeliveryConfirmationEmail(
  clientName: string,
  email: string,
  confirmUrl: string,
): Promise<void> {
  const clientEmail = normalizeClientEmail(email);
  const safeName = escapeHtml(clientName);
  const html = emailLayout(
    "Confirma la entrega de tu vehículo",
    `<p style="margin:0 0 12px;color:#374151;line-height:1.6;">
      Hola ${safeName}, tu vehículo <strong>atoo</strong> fue entregado.
    </p>
    <p style="margin:0 0 12px;color:#374151;line-height:1.6;">
      Por favor confirma el recibido exitoso para activar tu panel de cliente.
    </p>
    ${actionButton("Confirmar recibido", confirmUrl)}`,
  );

  await sendTransactionalEmail({
    to: clientEmail,
    subject: "Confirma la entrega de tu vehículo atoo",
    html,
    text: `Hola ${clientName}, tu vehículo atoo fue entregado. Confirma el recibido aquí: ${confirmUrl}`,
  });
}
