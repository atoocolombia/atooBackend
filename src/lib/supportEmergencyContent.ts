/** Contactos de emergencia relevantes para clientes en Bogotá (referencia rápida, no sustituye 123). */
export const BOGOTA_EMERGENCY_CONTACTS = [
  {
    name: "Emergencias Colombia",
    number: "123",
    detail: "Policía, ambulancia y coordinación de emergencias (24 horas).",
  },
  {
    name: "Ambulancia / urgencias médicas",
    number: "125",
    detail: "Atención prehospitalaria en Bogotá.",
  },
  {
    name: "Bomberos",
    number: "119",
    detail: "Incendios, rescates y emergencias con riesgo de fuego.",
  },
  {
    name: "Policía de Tránsito",
    number: "127",
    detail: "Accidentes de tránsito y reporte en vía.",
  },
] as const;

export const EMERGENCY_SAFETY_STEPS = [
  "Tu vida y la de los demás van primero. Si hay riesgo, aléjate del vehículo y del tráfico.",
  "No toques cables, batería dañada ni partes de alto voltaje del vehículo eléctrico.",
  "Si hay heridos, llama de inmediato al 123 o 125. No muevas a personas con posible lesión de columna salvo peligro inminente.",
  "Señaliza la zona (triángulos, luces) si es seguro hacerlo.",
  "Cuando estés a salvo, reporta a atoo para el trámite con la empresa en horario laboral.",
] as const;

export const ATOO_BUSINESS_HOURS_NOTE =
  "El equipo atoo atiende trámites de empresa (seguro, grúa, contrato) en horario laboral: lunes a viernes, 8:00 a 18:00 (hora Colombia).";
