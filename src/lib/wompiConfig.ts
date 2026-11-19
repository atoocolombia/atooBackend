export type WompiRuntimeConfig = {
  publicKey: string;
  integritySecret: string;
  eventsSecret: string;
  sandbox: boolean;
};

/** true = usar llaves WOMPI_TEST_* (APP_ENV staging/development o local sin production). */
export function isWompiTestAppEnv(): boolean {
  const appEnv = (process.env.APP_ENV ?? "").trim().toLowerCase();
  if (appEnv === "production") return false;
  if (appEnv === "staging" || appEnv === "development" || appEnv === "test") return true;
  // Local sin APP_ENV explícito → sandbox por defecto
  if (!appEnv && process.env.NODE_ENV !== "production") return true;
  return false;
}

type ResolvedWompiKeys = {
  publicKey: string | undefined;
  integritySecret: string | undefined;
  eventsSecret: string;
};

function resolveWompiKeys(): ResolvedWompiKeys {
  const useTest = isWompiTestAppEnv();

  if (useTest) {
    return {
      publicKey: process.env.WOMPI_TEST_PUBLIC_KEY?.trim(),
      integritySecret: process.env.WOMPI_TEST_INTEGRITY_SECRET?.trim(),
      eventsSecret: process.env.WOMPI_TEST_EVENTS_SECRET?.trim() ?? "",
    };
  }

  return {
    publicKey: process.env.WOMPI_PUBLIC_KEY?.trim(),
    integritySecret: process.env.WOMPI_INTEGRITY_SECRET?.trim(),
    eventsSecret: process.env.WOMPI_EVENTS_SECRET?.trim() ?? "",
  };
}

export function isWompiConfigured(): boolean {
  const { publicKey, integritySecret } = resolveWompiKeys();
  return Boolean(publicKey && integritySecret);
}

export function isWompiSandbox(): boolean {
  if (!isWompiConfigured()) return false;
  const { publicKey } = resolveWompiKeys();
  return Boolean(publicKey?.startsWith("pub_test_"));
}

export function getWompiConfig(): WompiRuntimeConfig {
  const { publicKey, integritySecret, eventsSecret } = resolveWompiKeys();

  if (!publicKey || !integritySecret) {
    const which = isWompiTestAppEnv() ? "WOMPI_TEST_*" : "WOMPI_PUBLIC_KEY / WOMPI_INTEGRITY_SECRET";
    throw new Error(`Wompi no está configurado (${which})`);
  }

  const sandbox = publicKey.startsWith("pub_test_");
  if (isWompiTestAppEnv() && !sandbox) {
    console.warn(
      "[wompi] APP_ENV no es production pero la llave pública no es pub_test_; usa sandbox para pruebas.",
    );
  }
  if (!isWompiTestAppEnv() && sandbox) {
    console.warn(
      "[wompi] APP_ENV=production con pub_test_; en Railway prod usa pub_prod_ en WOMPI_PUBLIC_KEY.",
    );
  }

  return {
    publicKey,
    integritySecret,
    eventsSecret,
    sandbox,
  };
}