export type KnowledgeQuestion = {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
};

export type KnowledgeSectionId = "ev" | "vial" | "customerService";

export type KnowledgeSectionDef = {
  id: KnowledgeSectionId;
  title: string;
  description: string;
  questions: KnowledgeQuestion[];
};

const EV_QUESTIONS: KnowledgeQuestion[] = [
  {
    id: "ev-1",
    text: "¿Qué precaución es clave al usar cargador doméstico para un vehículo eléctrico?",
    options: [
      "Usar cualquier extensión multipolar sin revisar amperaje",
      "Verificar que el circuito y tomacorriente soporten la carga indicada por el fabricante",
      "Cargar siempre con el capó abierto para ventilar",
    ],
    correctIndex: 1,
  },
  {
    id: "ev-2",
    text: "El regenerative braking (frenado regenerativo) principalmente…",
    options: [
      "Recarga parcialmente la batería al desacelerar",
      "Sustituye por completo el frenado de disco en emergencias",
      "Solo funciona en pendientes descendentes",
    ],
    correctIndex: 0,
  },
  {
    id: "ev-3",
    text: "Antes de iniciar marcha en un EV, ¿qué conviene confirmar?",
    options: [
      "Que el motor térmico esté caliente",
      "Nivel de carga/autonomía acorde al trayecto planeado",
      "Que el tubo de escape esté libre",
    ],
    correctIndex: 1,
  },
  {
    id: "ev-4",
    text: "En Colombia, ¿dónde suele ser más seguro detenerse a cargar en viaje interurbano?",
    options: [
      "En la berma sin señalización",
      "En estaciones o puntos de carga señalizados y bien iluminados",
      "Solo en gasolineras de combustible líquido",
    ],
    correctIndex: 1,
  },
  {
    id: "ev-5",
    text: "Si un pasajero pregunta por la autonomía real del EV, lo más adecuado es…",
    options: [
      "Prometer siempre la autonomía máxima del fabricante sin contexto",
      "Explicar que depende de tráfico, clima, carga y ruta, con estimación prudente",
      "Evitar responder para no confundir",
    ],
    correctIndex: 1,
  },
];

const VIAL_QUESTIONS: KnowledgeQuestion[] = [
  {
    id: "vial-1",
    text: "En Colombia, el límite de velocidad en zonas urbanas residenciales suele ser…",
    options: ["80 km/h", "30 km/h salvo señalización distinta", "120 km/h"],
    correctIndex: 1,
  },
  {
    id: "vial-2",
    text: "El cinturón de seguridad es obligatorio…",
    options: [
      "Solo para el conductor",
      "Para conductor y pasajeros en asientos delanteros y traseros según normativa",
      "Solo en carretera",
    ],
    correctIndex: 1,
  },
  {
    id: "vial-3",
    text: "Al aproximarse a un paso de peatones sin semáforo, el conductor debe…",
    options: [
      "Acelerar para cruzar antes que lleguen peatones",
      "Reducir velocidad y ceder el paso a quienes vayan a cruzar",
      "Tocar claxon continuamente",
    ],
    correctIndex: 1,
  },
  {
    id: "vial-4",
    text: "Conducir usando el celular sin manos libres está…",
    options: [
      "Permitido si el tráfico es lento",
      "Prohibido y constituye infracción según normas de tránsito",
      "Permitido solo para apps de navegación sin sostener el equipo",
    ],
    correctIndex: 1,
  },
  {
    id: "vial-5",
    text: "La distancia de seguimiento prudente implica…",
    options: [
      "Ir pegado al vehículo de adelante para ahorrar tiempo",
      "Mantener espacio suficiente para reaccionar y frenar con seguridad",
      "Usar luces altas todo el tiempo",
    ],
    correctIndex: 1,
  },
];

const CUSTOMER_SERVICE_QUESTIONS: KnowledgeQuestion[] = [
  {
    id: "cs-1",
    text: "Un pasajero llega molesto porque el viaje tardó más de lo esperado. Lo primero es…",
    options: [
      "Discutir y culpar al tráfico de forma agresiva",
      "Escuchar con calma, disculparse por la experiencia y explicar con respeto",
      "Cancelar el viaje a mitad de camino sin avisar",
    ],
    correctIndex: 1,
  },
  {
    id: "cs-2",
    text: "Si un pasajero olvida un objeto en el vehículo, debe…",
    options: [
      "Reportarlo por los canales de la plataforma y coordinar devolución segura",
      "Quedárselo si no reclama en una hora",
      "Publicarlo en redes sociales con datos del pasajero",
    ],
    correctIndex: 0,
  },
  {
    id: "cs-3",
    text: "Antes de iniciar el servicio, una buena práctica es…",
    options: [
      "Confirmar nombre/destino y saludar cordialmente",
      "Evitar hablar para concentrarse",
      "Pedir al pasajero que maneje si hay prisa",
    ],
    correctIndex: 0,
  },
  {
    id: "cs-4",
    text: "Ante una queja sobre limpieza o aroma del vehículo, lo más profesional es…",
    options: [
      "Negar el problema y culpar al pasajero anterior",
      "Agradecer el comentario y tomar acción (ventilar/limpiar) sin discusión",
      "Terminar el viaje de inmediato en la calle",
    ],
    correctIndex: 1,
  },
  {
    id: "cs-5",
    text: "En servicio de transporte, tratar con respeto implica…",
    options: [
      "Solo cuando el pasajero califica bien",
      "En todo momento, sin discriminación ni comentarios inapropiados",
      "Solo si el pasajero es puntual",
    ],
    correctIndex: 1,
  },
];

export const KNOWLEDGE_SECTIONS: Record<KnowledgeSectionId, KnowledgeSectionDef> = {
  ev: {
    id: "ev",
    title: "Vehículos eléctricos",
    description: "Conocimientos básicos de operación y carga de EV.",
    questions: EV_QUESTIONS,
  },
  vial: {
    id: "vial",
    title: "Normas viales en Colombia",
    description: "Seguridad vial y comportamiento en el tránsito.",
    questions: VIAL_QUESTIONS,
  },
  customerService: {
    id: "customerService",
    title: "Servicio al cliente al conducir",
    description: "Trato al pasajero y resolución de situaciones frecuentes.",
    questions: CUSTOMER_SERVICE_QUESTIONS,
  },
};

export function publicQuestionsForSection(section: KnowledgeSectionDef) {
  return section.questions.map((q) => ({
    id: q.id,
    text: q.text,
    options: q.options,
  }));
}

export function allQuestionIds(includeEv: boolean): string[] {
  const ids: string[] = [];
  if (includeEv) {
    for (const q of KNOWLEDGE_SECTIONS.ev.questions) ids.push(q.id);
  }
  for (const q of KNOWLEDGE_SECTIONS.vial.questions) ids.push(q.id);
  for (const q of KNOWLEDGE_SECTIONS.customerService.questions) ids.push(q.id);
  return ids;
}

export function findQuestion(questionId: string): KnowledgeQuestion | null {
  for (const section of Object.values(KNOWLEDGE_SECTIONS)) {
    const hit = section.questions.find((q) => q.id === questionId);
    if (hit) return hit;
  }
  return null;
}
