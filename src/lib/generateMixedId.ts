/**
 * Genera un id de 7 caracteres: 4 dígitos (0-9) y 3 letras (A-Z), orden aleatorio.
 */
export function generateMixedId(): string {
  const digits = Array.from({ length: 4 }, () => String(Math.floor(Math.random() * 10)));
  const letters = Array.from({ length: 3 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  );
  const chars = [...digits, ...letters];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
