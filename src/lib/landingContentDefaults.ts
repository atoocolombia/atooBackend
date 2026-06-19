export interface BenefitItem {
  icon: string;
  title: string;
  description: string;
  gradient: string;
}

export interface BenefitsSectionContent {
  badge: string;
  titleBefore: string;
  titleHighlight: string;
  titleAfter: string;
  description: string;
  items: BenefitItem[];
}

export interface StepItem {
  number: string;
  icon: string;
  title: string;
  description: string;
}

export interface StepsSectionContent {
  badge: string;
  titleBefore: string;
  titleHighlight: string;
  titleAfter: string;
  description: string;
  ctaText: string;
  ctaNote: string;
  items: StepItem[];
}

export interface ContactSectionContent {
  badge: string;
  titleBefore: string;
  titleHighlight: string;
  titleAfter: string;
  description: string;
  driverCount: string;
  phoneLabel: string;
  phone: string;
  emailLabel: string;
  email: string;
  trustItems: string[];
}

export interface LandingContent {
  benefits: BenefitsSectionContent;
  steps: StepsSectionContent;
  contact: ContactSectionContent;
}

export function defaultLandingContent(): LandingContent {
  return {
    benefits: {
      badge: "Beneficios atoo",
      titleBefore: "¿Por Qué Elegir ",
      titleHighlight: "atoo",
      titleAfter: "?",
      description:
        "La mejor alternativa para que puedas tener tu propio vehículo mientras generas ingresos.",
      items: [
        {
          icon: "trending-up",
          title: "Incrementa tus Ganancias",
          description:
            "Sin pagos de renta diarios. Todo lo que ganes es tuyo mientras cumples tu cuota semanal.",
          gradient: "from-[#1A1FE8] to-[#3D42F0]",
        },
        {
          icon: "shield",
          title: "Sin Enganche",
          description: "Comienza a conducir tu vehículo sin necesidad de desembolso inicial.",
          gradient: "from-cyan-500 to-[#1A1FE8]",
        },
        {
          icon: "clock",
          title: "Proceso Rápido",
          description: "Aprobación en 24 horas. Mínimos requisitos y trámites simples.",
          gradient: "from-emerald-500 to-teal-600",
        },
        {
          icon: "heart",
          title: "Seguro Incluido",
          description: "Todos nuestros vehículos incluyen seguro de cobertura amplia.",
          gradient: "from-[#1A1FE8] to-[#6B70F5]",
        },
        {
          icon: "wrench",
          title: "Mantenimiento",
          description: "Servicio y mantenimiento preventivo incluido durante el periodo de renta.",
          gradient: "from-orange-500 to-amber-500",
        },
        {
          icon: "percent",
          title: "Mejores Tasas",
          description: "Tasas competitivas y transparentes. Sin cargos ocultos.",
          gradient: "from-[#3D42F0] to-[#1A1FE8]",
        },
      ],
    },
    steps: {
      badge: "Proceso Simple",
      titleBefore: "¿Cómo ",
      titleHighlight: "Funciona",
      titleAfter: "?",
      description: "En solo 4 pasos simples estarás manejando tu futuro vehículo",
      ctaText: "Iniciar Mi Solicitud",
      ctaNote: "⚡ Respuesta en menos de 24 horas",
      items: [
        {
          number: "01",
          icon: "file-text",
          title: "Solicitud",
          description:
            "Completa el formulario en línea con tus datos básicos. Solo necesitas INE y comprobante de domicilio.",
        },
        {
          number: "02",
          icon: "check-circle-2",
          title: "Aprobación",
          description:
            "Nuestro equipo revisa tu solicitud y te contacta en menos de 24 horas con una respuesta.",
        },
        {
          number: "03",
          icon: "car",
          title: "Entrega",
          description: "Elige tu vehículo y firma el contrato. Comienza a conducir el mismo día.",
        },
        {
          number: "04",
          icon: "trophy",
          title: "¡Es Tuyo!",
          description:
            "Después de 60 meses de pagos semanales puntuales, el vehículo pasa a tu nombre.",
        },
      ],
    },
    contact: {
      badge: "¡Comienza Tu Viaje Hoy!",
      titleBefore: "¿Listo para ",
      titleHighlight: "Yours Tomorrow",
      titleAfter: "?",
      description: "Únete a más de {count} que ya están construyendo su patrimonio mientras trabajan",
      driverCount: "100 conductores",
      phoneLabel: "Llámanos",
      phone: "55 1234 5678",
      emailLabel: "Escríbenos",
      email: "hola@atoo.com",
      trustItems: ["Aprobación en 24h", "Sin enganche", "Pagos semanales"],
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeBenefitItem(raw: unknown, fallback: BenefitItem): BenefitItem {
  if (!isRecord(raw)) return fallback;
  return {
    icon: typeof raw.icon === "string" ? raw.icon : fallback.icon,
    title: typeof raw.title === "string" ? raw.title : fallback.title,
    description: typeof raw.description === "string" ? raw.description : fallback.description,
    gradient: typeof raw.gradient === "string" ? raw.gradient : fallback.gradient,
  };
}

function mergeStepItem(raw: unknown, fallback: StepItem): StepItem {
  if (!isRecord(raw)) return fallback;
  return {
    number: typeof raw.number === "string" ? raw.number : fallback.number,
    icon: typeof raw.icon === "string" ? raw.icon : fallback.icon,
    title: typeof raw.title === "string" ? raw.title : fallback.title,
    description: typeof raw.description === "string" ? raw.description : fallback.description,
  };
}

function pickStrings(raw: unknown, fallback: Record<string, string>, keys: string[]): Record<string, string> {
  const result = { ...fallback };
  if (!isRecord(raw)) return result;
  for (const key of keys) {
    if (typeof raw[key] === "string") {
      result[key] = raw[key];
    }
  }
  return result;
}

export function mergeLandingContent(stored: unknown): LandingContent {
  const defaults = defaultLandingContent();
  if (!isRecord(stored)) return defaults;

  const benefitsRaw = isRecord(stored.benefits) ? stored.benefits : {};
  const stepsRaw = isRecord(stored.steps) ? stored.steps : {};
  const contactRaw = isRecord(stored.contact) ? stored.contact : {};

  const benefitsItemsRaw = Array.isArray(benefitsRaw.items) ? benefitsRaw.items : null;
  const stepsItemsRaw = Array.isArray(stepsRaw.items) ? stepsRaw.items : null;
  const trustItemsRaw = Array.isArray(contactRaw.trustItems) ? contactRaw.trustItems : null;

  const benefitsFields = pickStrings(benefitsRaw, {
    badge: defaults.benefits.badge,
    titleBefore: defaults.benefits.titleBefore,
    titleHighlight: defaults.benefits.titleHighlight,
    titleAfter: defaults.benefits.titleAfter,
    description: defaults.benefits.description,
  }, ["badge", "titleBefore", "titleHighlight", "titleAfter", "description"]);

  const stepsFields = pickStrings(stepsRaw, {
    badge: defaults.steps.badge,
    titleBefore: defaults.steps.titleBefore,
    titleHighlight: defaults.steps.titleHighlight,
    titleAfter: defaults.steps.titleAfter,
    description: defaults.steps.description,
    ctaText: defaults.steps.ctaText,
    ctaNote: defaults.steps.ctaNote,
  }, ["badge", "titleBefore", "titleHighlight", "titleAfter", "description", "ctaText", "ctaNote"]);

  const contactFields = pickStrings(contactRaw, {
    badge: defaults.contact.badge,
    titleBefore: defaults.contact.titleBefore,
    titleHighlight: defaults.contact.titleHighlight,
    titleAfter: defaults.contact.titleAfter,
    description: defaults.contact.description,
    driverCount: defaults.contact.driverCount,
    phoneLabel: defaults.contact.phoneLabel,
    phone: defaults.contact.phone,
    emailLabel: defaults.contact.emailLabel,
    email: defaults.contact.email,
  }, [
    "badge",
    "titleBefore",
    "titleHighlight",
    "titleAfter",
    "description",
    "driverCount",
    "phoneLabel",
    "phone",
    "emailLabel",
    "email",
  ]);

  return {
    benefits: {
      badge: benefitsFields.badge,
      titleBefore: benefitsFields.titleBefore,
      titleHighlight: benefitsFields.titleHighlight,
      titleAfter: benefitsFields.titleAfter,
      description: benefitsFields.description,
      items: benefitsItemsRaw
        ? benefitsItemsRaw.map((item, i) =>
            mergeBenefitItem(item, defaults.benefits.items[i] ?? defaults.benefits.items[0]),
          )
        : defaults.benefits.items,
    },
    steps: {
      badge: stepsFields.badge,
      titleBefore: stepsFields.titleBefore,
      titleHighlight: stepsFields.titleHighlight,
      titleAfter: stepsFields.titleAfter,
      description: stepsFields.description,
      ctaText: stepsFields.ctaText,
      ctaNote: stepsFields.ctaNote,
      items: stepsItemsRaw
        ? stepsItemsRaw.map((item, i) =>
            mergeStepItem(item, defaults.steps.items[i] ?? defaults.steps.items[0]),
          )
        : defaults.steps.items,
    },
    contact: {
      badge: contactFields.badge,
      titleBefore: contactFields.titleBefore,
      titleHighlight: contactFields.titleHighlight,
      titleAfter: contactFields.titleAfter,
      description: contactFields.description,
      driverCount: contactFields.driverCount,
      phoneLabel: contactFields.phoneLabel,
      phone: contactFields.phone,
      emailLabel: contactFields.emailLabel,
      email: contactFields.email,
      trustItems: trustItemsRaw
        ? trustItemsRaw.filter((item): item is string => typeof item === "string")
        : defaults.contact.trustItems,
    },
  };
}

export function validateLandingContent(body: unknown): LandingContent | null {
  if (!isRecord(body)) return null;

  const merged = mergeLandingContent(body);

  if (merged.benefits.items.length === 0 || merged.steps.items.length === 0) {
    return null;
  }
  if (!merged.contact.phone.trim() || !merged.contact.email.trim()) {
    return null;
  }

  return merged;
}
