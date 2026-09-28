export const DEFAULT_ACCESSORY_CHECKLIST = [
  { key: "keys", label: "Llaves", delivered: false },
  { key: "charger", label: "Cargador", delivered: false },
  { key: "manual", label: "Manual de uso", delivered: false },
  { key: "jack", label: "Gato y herramientas", delivered: false },
  { key: "spare", label: "Llanta de repuesto / kit", delivered: false },
] as const;

export type AccessoryChecklistItem = {
  key: string;
  label: string;
  delivered: boolean;
};

export function normalizeAccessoryChecklist(raw: unknown): AccessoryChecklistItem[] {
  if (!Array.isArray(raw)) return DEFAULT_ACCESSORY_CHECKLIST.map((i) => ({ ...i }));
  return raw.map((item) => {
    const row = item as Partial<AccessoryChecklistItem>;
    return {
      key: String(row.key ?? ""),
      label: String(row.label ?? ""),
      delivered: Boolean(row.delivered),
    };
  });
}

export function allDocumentsSigned(delivery: {
  contractSignedAt: Date | null;
  insuranceSignedAt: Date | null;
  promissoryNoteSignedAt: Date | null;
}): boolean {
  return Boolean(
    delivery.contractSignedAt && delivery.insuranceSignedAt && delivery.promissoryNoteSignedAt,
  );
}

export function allAccessoriesDelivered(items: AccessoryChecklistItem[]): boolean {
  return items.length > 0 && items.every((i) => i.delivered);
}
