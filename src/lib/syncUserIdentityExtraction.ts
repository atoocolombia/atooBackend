import { DocumentValidationStatus } from "@prisma/client";
import fs from "node:fs/promises";
import { extractJsonObjectFromModelText, generateContentWithModelChain, type GeminiContentPart } from "./geminiChainedContent.js";
import { prisma } from "./prisma.js";
import { resolveStoredFile } from "./uploadStorage.js";
import { compareSelfieWithIdentityFront, type SelfieIdentityComparison } from "./verifySelfieAgainstIdentityDocument.js";

const LOG_PREFIX = "[identity-extraction]";

const GEMINI_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function inlineMimeForGemini(mimeType: string): string | null {
  if (mimeType === "application/pdf") return "application/pdf";
  if (GEMINI_IMAGE_MIMES.has(mimeType)) return mimeType;
  return null;
}

function logLine(message: string, extra?: unknown): void {
  if (extra !== undefined) {
    console.error(`${LOG_PREFIX} ${message}`, extra);
  } else {
    console.error(`${LOG_PREFIX} ${message}`);
  }
}

function optionalString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function optionalBool(v: unknown): boolean | null {
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

function partFromBuffer(buf: Buffer, mimeType: string): GeminiContentPart | null {
  const mime = inlineMimeForGemini(mimeType);
  if (!mime) return null;
  return {
    inlineData: {
      mimeType: mime,
      data: buf.toString("base64"),
    },
  };
}

const IDENTITY_DOC_PROMPT = `Analiza las imágenes o PDF adjuntos de un **documento de identidad** válido en Colombia. Puede ser **cédula de ciudadanía**, **cédula de extranjería**, **pasaporte** u otro documento oficial de identificación con foto y datos del titular (puede mostrarse solo el frente, o frente y reverso). Extrae únicamente lo legible.

Responde ÚNICAMENTE un JSON válido (sin markdown, sin texto adicional) con esta forma exacta:
{"firstName":"string o null","lastName":"string o null","birthDate":"YYYY-MM-DD o null","idDocumentNumber":"string o null","extractionNotesEs":"string breve si hubo dudas"}

- firstName: nombres de pila como en el documento.
- lastName: apellidos como en el documento.
- birthDate: fecha de nacimiento en formato YYYY-MM-DD si se distingue con claridad; si no, null.
- idDocumentNumber: número o código del documento **exactamente como conviene para ese tipo** (cédula: suele ser solo dígitos; cédula de extranjería o pasaporte: puede incluir letras y dígitos). Sin espacios innecesarios; sin puntos de miles. Si no es legible, null.`;

const LICENSE_PROMPT = (ctx: {
  firstName: string | null;
  lastName: string | null;
  idDocumentNumber: string | null;
}) => `Las imágenes o PDF adjuntos son el FRENTE y el REVERSO de un pase/licencia de conducción colombiano.

Datos del titular según el **documento de identidad** (cédula, cédula de extranjería, pasaporte, etc.) para comparar si es la misma persona:
- Nombres: ${ctx.firstName ?? "no disponible"}
- Apellidos: ${ctx.lastName ?? "no disponible"}
- Número o código de documento: ${ctx.idDocumentNumber ?? "no disponible"}

Tareas:
1) Determina si la licencia corresponde a la **MISMA PERSONA** que el documento de identidad (coherencia de foto, nombres, apellidos, número o código de identificación si aparece en la licencia).
2) Extrae la fecha de vigencia del pase: la fecha hasta la cual la licencia está vigente o la fecha de vencimiento principal que figure en el documento. Usa YYYY-MM-DD si es claro; si no puedes determinarla con seguridad, null.

Responde ÚNICAMENTE un JSON válido (sin markdown, sin texto adicional) con esta forma exacta:
{"licenseMatchesIdentityPerson":boolean o null si no hay datos del documento de identidad para comparar,"licenseValidUntil":"YYYY-MM-DD o null","explanationEs":"string breve"}`;

function normalizeIdDocumentNumber(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const noSpaces = s.replace(/\s+/g, "");
  const noThousandsDots = noSpaces.replace(/\.(?=\d)/g, "");
  const cleaned = noThousandsDots.replace(/[^A-Za-z0-9\-]/g, "");
  return cleaned.length >= 3 ? cleaned.toUpperCase() : null;
}

async function extractIdentityDocumentFields(parts: GeminiContentPart[]): Promise<{
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  idDocumentNumber: string | null;
} | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || process.env.DATA_TREATMENT_SKIP_AI_VERIFY === "true") return null;
  const allParts: GeminiContentPart[] = [...parts, { text: IDENTITY_DOC_PROMPT }];
  const { text } = await generateContentWithModelChain(apiKey, allParts, LOG_PREFIX);
  const parsed = extractJsonObjectFromModelText(text);
  return {
    firstName: optionalString(parsed.firstName),
    lastName: optionalString(parsed.lastName),
    birthDate: optionalString(parsed.birthDate),
    idDocumentNumber: normalizeIdDocumentNumber(optionalString(parsed.idDocumentNumber) ?? ""),
  };
}

async function extractLicenseFields(
  parts: GeminiContentPart[],
  idDocCtx: { firstName: string | null; lastName: string | null; idDocumentNumber: string | null },
): Promise<{
  licenseMatchesCedula: boolean | null;
  licenseValidUntil: string | null;
} | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || process.env.DATA_TREATMENT_SKIP_AI_VERIFY === "true") return null;
  const allParts: GeminiContentPart[] = [...parts, { text: LICENSE_PROMPT(idDocCtx) }];
  const { text } = await generateContentWithModelChain(apiKey, allParts, LOG_PREFIX);
  const parsed = extractJsonObjectFromModelText(text);
  return {
    licenseMatchesCedula: optionalBool(
      parsed.licenseMatchesIdentityPerson ?? parsed.licenseMatchesCedulaPerson,
    ),
    licenseValidUntil: optionalString(parsed.licenseValidUntil),
  };
}

export type SyncUserIdentityExtractionOptions = {
  /** Si la selfie acaba de validarse, evita una segunda llamada a Gemini con el mismo resultado. */
  selfieComparison?: SelfieIdentityComparison;
};

/**
 * Tras validar documentos de identificación, vuelve a leer los archivos aprobados y actualiza `UserIdentityExtraction`.
 * No lanza: los fallos se registran en consola.
 */
export async function syncUserIdentityExtractionFromDocuments(
  userId: string,
  options?: SyncUserIdentityExtractionOptions,
): Promise<void> {
  try {
    const docs = await prisma.document.findMany({
      where: {
        userId,
        validationStatus: DocumentValidationStatus.VALIDATED,
        documentKind: { in: ["idFront", "idBack", "licenseFront", "licenseBack", "selfieWhiteBackground"] },
      },
      select: { id: true, documentKind: true, storedPath: true, mimeType: true },
    });

    const byKind = Object.fromEntries(docs.map((d) => [d.documentKind, d])) as Record<
      string,
      { id: string; documentKind: string; storedPath: string; mimeType: string }
    >;

    const readBuf = async (kind: string): Promise<{ buf: Buffer; mimeType: string } | null> => {
      const d = byKind[kind];
      if (!d) return null;
      try {
        const buf = await fs.readFile(resolveStoredFile(d.storedPath));
        return { buf, mimeType: d.mimeType };
      } catch (e) {
        logLine(`readFile falló (${kind})`, e);
        return null;
      }
    };

    const idFront = await readBuf("idFront");
    const idBack = await readBuf("idBack");
    const licFront = await readBuf("licenseFront");
    const licBack = await readBuf("licenseBack");

    const existing = await prisma.userIdentityExtraction.findUnique({ where: { userId } });

    let firstName = existing?.firstName ?? null;
    let lastName = existing?.lastName ?? null;
    let birthDate = existing?.birthDate ?? null;
    let idDocumentNumber = existing?.idDocumentNumber ?? null;
    let licenseMatchesCedula = existing?.licenseMatchesCedula ?? null;
    let licenseValidUntil = existing?.licenseValidUntil ?? null;
    let identityPhotoDocumentId = existing?.identityPhotoDocumentId ?? null;
    let selfieMatchesIdentityPerson = existing?.selfieMatchesIdentityPerson ?? null;
    let selfieIsDistinctCaptureFromIdentity = existing?.selfieIsDistinctCaptureFromIdentity ?? null;

    if (byKind.idFront) {
      identityPhotoDocumentId = byKind.idFront.id;
    }

    if (idFront) {
      const idDocParts: GeminiContentPart[] = [];
      const p1 = partFromBuffer(idFront.buf, idFront.mimeType);
      if (p1) idDocParts.push(p1);
      if (idBack) {
        const p2 = partFromBuffer(idBack.buf, idBack.mimeType);
        if (p2) idDocParts.push(p2);
      }
      if (idDocParts.length > 0) {
        const extracted = await extractIdentityDocumentFields(idDocParts);
        if (extracted) {
          firstName = extracted.firstName ?? firstName;
          lastName = extracted.lastName ?? lastName;
          birthDate = extracted.birthDate ?? birthDate;
          idDocumentNumber = extracted.idDocumentNumber ?? idDocumentNumber;
          logLine("Documento de identidad extraído.", { userId, extracted });
        }
      }
    }

    if (licFront && licBack) {
      const licParts: GeminiContentPart[] = [];
      const lf = partFromBuffer(licFront.buf, licFront.mimeType);
      const lb = partFromBuffer(licBack.buf, licBack.mimeType);
      if (lf && lb) {
        licParts.push(lf, lb);
        const lic = await extractLicenseFields(licParts, { firstName, lastName, idDocumentNumber });
        if (lic) {
          licenseMatchesCedula = lic.licenseMatchesCedula ?? licenseMatchesCedula;
          licenseValidUntil = lic.licenseValidUntil ?? licenseValidUntil;
          logLine("Pase/licencia extraída.", { userId, lic });
        }
      }
    }

    const selfie = await readBuf("selfieWhiteBackground");
    if (idFront && selfie) {
      if (options?.selfieComparison) {
        selfieMatchesIdentityPerson = options.selfieComparison.samePerson;
        selfieIsDistinctCaptureFromIdentity = options.selfieComparison.distinctCapture;
      } else {
        const cmp = await compareSelfieWithIdentityFront(
          idFront.buf,
          idFront.mimeType,
          selfie.buf,
          selfie.mimeType,
        );
        if (cmp) {
          selfieMatchesIdentityPerson = cmp.samePerson;
          selfieIsDistinctCaptureFromIdentity = cmp.distinctCapture;
          logLine("Comparación selfie vs documento de identidad.", { userId, cmp });
        }
      }
    }

    const hasAny =
      firstName != null ||
      lastName != null ||
      birthDate != null ||
      idDocumentNumber != null ||
      licenseMatchesCedula != null ||
      licenseValidUntil != null ||
      identityPhotoDocumentId != null ||
      selfieMatchesIdentityPerson != null ||
      selfieIsDistinctCaptureFromIdentity != null;

    if (!hasAny) {
      return;
    }

    await prisma.userIdentityExtraction.upsert({
      where: { userId },
      create: {
        userId,
        firstName,
        lastName,
        birthDate,
        idDocumentNumber,
        licenseMatchesCedula,
        licenseValidUntil,
        identityPhotoDocumentId,
        selfieMatchesIdentityPerson,
        selfieIsDistinctCaptureFromIdentity,
      },
      update: {
        firstName,
        lastName,
        birthDate,
        idDocumentNumber,
        licenseMatchesCedula,
        licenseValidUntil,
        identityPhotoDocumentId,
        selfieMatchesIdentityPerson,
        selfieIsDistinctCaptureFromIdentity,
      },
    });
  } catch (err) {
    logLine("syncUserIdentityExtractionFromDocuments falló", err);
  }
}
