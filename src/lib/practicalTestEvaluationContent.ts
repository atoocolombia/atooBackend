export type PracticalEvalQuestion = {
  id: string;
  text: string;
  options: string[];
  category: "experience" | "customerService" | "general";
};

export const PRACTICAL_EVAL_QUESTIONS: PracticalEvalQuestion[] = [
  {
    id: "ev-handling",
    text: "Manejo del vehículo eléctrico durante la prueba",
    category: "experience",
    options: ["Excelente", "Bueno", "Regular", "Insuficiente"],
  },
  {
    id: "traffic-safety",
    text: "Respeto de normas de tránsito y seguridad vial",
    category: "experience",
    options: ["Excelente", "Bueno", "Regular", "Insuficiente"],
  },
  {
    id: "passenger-service",
    text: "Actitud de servicio con pasajeros simulados o evaluador",
    category: "customerService",
    options: ["Excelente", "Bueno", "Regular", "Insuficiente"],
  },
  {
    id: "communication",
    text: "Comunicación clara y trato cordial",
    category: "customerService",
    options: ["Excelente", "Bueno", "Regular", "Insuficiente"],
  },
  {
    id: "recommendation",
    text: "¿Recomiendas continuar el proceso con este candidato?",
    category: "general",
    options: ["Sí, sin reservas", "Sí, con observaciones", "No por ahora"],
  },
];

const SCORE_MAP: Record<string, number> = {
  Excelente: 100,
  Bueno: 75,
  Regular: 50,
  Insuficiente: 25,
  "Sí, sin reservas": 100,
  "Sí, con observaciones": 70,
  "No por ahora": 30,
};

export function scoreFromAnswer(option: string): number {
  return SCORE_MAP[option] ?? 0;
}

export function computeEvaluationScores(answers: Record<string, string>): {
  experienceScore: number;
  customerServiceScore: number;
  overallScore: number;
} {
  const byCat: Record<string, number[]> = { experience: [], customerService: [], general: [] };
  for (const q of PRACTICAL_EVAL_QUESTIONS) {
    const ans = answers[q.id];
    if (typeof ans === "string") byCat[q.category].push(scoreFromAnswer(ans));
  }
  const avg = (arr: number[]) =>
    arr.length === 0 ? 0 : Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
  const experienceScore = avg(byCat.experience);
  const customerServiceScore = avg(byCat.customerService);
  const general = avg(byCat.general);
  const overallScore = Math.round(((experienceScore + customerServiceScore + general) / 3) * 10) / 10;
  return { experienceScore, customerServiceScore, overallScore };
}
