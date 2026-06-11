/**
 * Mensajes para el usuario final: distingue responsabilidad sin tecnicismos.
 * El detalle técnico va en logs del servidor, no aquí.
 */

/** Fallo del servicio, cuotas, servidor o configuración: no implica que el archivo sea “malo”. */
export function platformMessage(detail: string): string {
  return `Plataforma: ${detail}`;
}

/** Algo que la persona puede corregir (archivo, formato o contenido del PDF). */
export function documentMessage(detail: string): string {
  return `Documento: ${detail}`;
}
