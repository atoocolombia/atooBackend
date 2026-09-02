export const PASSWORD_POLICY_MESSAGE =
  "La contraseña debe tener al menos 8 caracteres e incluir mayúsculas, minúsculas y caracteres especiales";

export function validatePassword(password: string): string | null {
  if (password.length < 8) return PASSWORD_POLICY_MESSAGE;
  if (!/[A-Z]/.test(password)) return PASSWORD_POLICY_MESSAGE;
  if (!/[a-z]/.test(password)) return PASSWORD_POLICY_MESSAGE;
  if (!/[^A-Za-z0-9]/.test(password)) return PASSWORD_POLICY_MESSAGE;
  return null;
}
