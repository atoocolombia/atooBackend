import { buildAllPlatformSlotStatuses } from "./platformSlotAggregate.js";

export function serializeWorkAddressStepMeta(
  row: {
    mobilityDrivenElectricVehicle: boolean | null;
    mobilityElectricExperienceText: string | null;
    platformCapturesMeta: unknown;
  } | null,
) {
  const mobilityDrivenElectricVehicle = row?.mobilityDrivenElectricVehicle ?? null;
  const mobilityElectricExperienceText = row?.mobilityElectricExperienceText?.trim() || null;
  const slots = buildAllPlatformSlotStatuses(row?.platformCapturesMeta ?? null, mobilityDrivenElectricVehicle);

  return {
    mobilityDrivenElectricVehicle,
    mobilityElectricExperienceText,
    platformSlot1Complete: slots[1].complete,
    platformSlot2Complete: slots[2].complete,
    platformSlot3Complete: slots[3].complete,
    platformSlots: {
      "1": { complete: slots[1].complete, missing: slots[1].missing },
      "2": { complete: slots[2].complete, missing: slots[2].missing },
      "3": { complete: slots[3].complete, missing: slots[3].missing },
    },
  };
}
