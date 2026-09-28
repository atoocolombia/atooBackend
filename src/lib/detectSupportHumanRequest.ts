const HUMAN_REQUEST_PATTERNS: RegExp[] = [
  /hablar con (un[a]? )?(humano|persona|agente|asesor|alguien)/i,
  /quiero (un[a]? )?(humano|persona|agente|asesor)/i,
  /persona real/i,
  /soporte humano/i,
  /atenci[oó]n humana/i,
  /conect(a|ar)(me)? con (soporte|alguien|una persona)/i,
  /no quiero (hablar con )?(la )?(ia|bot|robot)/i,
  /prefiero (un )?(humano|persona)/i,
  /necesito (un )?(humano|asesor|agente)/i,
];

export function detectSupportHumanRequest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return HUMAN_REQUEST_PATTERNS.some((re) => re.test(trimmed));
}
