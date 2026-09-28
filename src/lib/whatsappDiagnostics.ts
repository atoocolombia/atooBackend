export interface WhatsAppDiagnostics {
  lastWebhookAt: string | null;
  lastWebhookField: string | null;
  lastIncomingFrom: string | null;
  lastIncomingText: string | null;
  lastSendError: string | null;
  lastSendOkAt: string | null;
  webhookHits: number;
}

const state: WhatsAppDiagnostics = {
  lastWebhookAt: null,
  lastWebhookField: null,
  lastIncomingFrom: null,
  lastIncomingText: null,
  lastSendError: null,
  lastSendOkAt: null,
  webhookHits: 0,
};

export function recordWebhookHit(field: string | null): void {
  state.webhookHits += 1;
  state.lastWebhookAt = new Date().toISOString();
  state.lastWebhookField = field;
}

export function recordIncomingMessage(from: string, text: string): void {
  state.lastIncomingFrom = from;
  state.lastIncomingText = text.slice(0, 120);
}

export function recordSendOk(): void {
  state.lastSendOkAt = new Date().toISOString();
  state.lastSendError = null;
}

export function recordSendError(detail: string): void {
  state.lastSendError = detail.slice(0, 500);
}

export function getWhatsAppDiagnostics(): WhatsAppDiagnostics {
  return { ...state };
}
