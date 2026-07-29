export const TEST_OPEN_BOOKING_WORKSHOP_ID =
  process.env.TEST_OPEN_BOOKING_WORKSHOP_ID?.trim() || "TLLBOG01";

export function allowsOpenBooking(workshopId: string): boolean {
  return workshopId === TEST_OPEN_BOOKING_WORKSHOP_ID;
}

export function isValidAppointmentTime(value: string | null): value is string {
  return Boolean(value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
}
