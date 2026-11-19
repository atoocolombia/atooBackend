export type WompiRuntimeConfig = {
  publicKey: string;
  integritySecret: string;
  eventsSecret: string;
};

export function isWompiConfigured(): boolean {
  const publicKey = process.env.WOMPI_PUBLIC_KEY?.trim();
  const integrity = process.env.WOMPI_INTEGRITY_SECRET?.trim();
  return Boolean(publicKey && integrity);
}

export function getWompiConfig(): WompiRuntimeConfig {
  const publicKey = process.env.WOMPI_PUBLIC_KEY?.trim();
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET?.trim();
  const eventsSecret = process.env.WOMPI_EVENTS_SECRET?.trim() ?? "";

  if (!publicKey || !integritySecret) {
    throw new Error("Wompi no está configurado (WOMPI_PUBLIC_KEY / WOMPI_INTEGRITY_SECRET)");
  }

  return {
    publicKey,
    integritySecret,
    eventsSecret,
  };
}