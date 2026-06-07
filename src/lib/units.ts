// src/lib/units.ts
export type UnitSystem = "metric" | "imperial";

const KM_TO_MI = 0.621371;
const MI_TO_KM = 1.609344;

/** Long unit word for big labels ("kilometers" / "miles"). */
export const distanceUnitLong = (system: UnitSystem) =>
  system === "imperial" ? "miles" : "kilometers";

/** Short unit ("km" / "mi"). */
export const distanceUnitShort = (system: UnitSystem) =>
  system === "imperial" ? "mi" : "km";

/** Speed unit ("km/h" / "mph"). */
export const speedUnitShort = (system: UnitSystem) =>
  system === "imperial" ? "mph" : "km/h";

/** km (stored) → number in the user's unit, for display. */
export const fromKm = (km: number, system: UnitSystem) =>
  system === "imperial" ? km * KM_TO_MI : km;

/** user's unit (typed) → km, for storage. ALWAYS call before saving input. */
export const toKm = (value: number, system: UnitSystem) =>
  system === "imperial" ? value * MI_TO_KM : value;

/**
 * Format a stored km value for display in the user's unit.
 * Returns just the number string (no unit) so you can place the unit label yourself.
 */
export const formatDistance = (
  km: number,
  system: UnitSystem,
  maxFractionDigits = 1,
) =>
  fromKm(km, system).toLocaleString(undefined, {
    maximumFractionDigits: maxFractionDigits,
  });
