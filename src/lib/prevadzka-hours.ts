import { parseHoursSpec, type HoursSpec } from "./alert-config";
import {
  openingHoursSet,
  type StoreOpeningHours,
} from "./prevadzka-profile";
import { prevadzkaKey } from "./vyjazd-stops";

export type HoursDeviceLike = {
  uuid?: string;
  code?: string;
  partner?: string;
  city?: string;
  address?: string;
  name?: string;
};

const cache = new Map<string, StoreOpeningHours>();

export function setPrevadzkaHoursCache(
  rows: Array<{ keys: string[]; hours: StoreOpeningHours }>,
) {
  cache.clear();
  for (const row of rows) {
    if (!openingHoursSet(row.hours)) continue;
    for (const key of row.keys) {
      const k = key.trim().toLowerCase();
      if (k) cache.set(k, row.hours);
    }
  }
}

export function hoursForDay(
  hours: StoreOpeningHours,
  day: number,
): HoursSpec | { closed: true } | null {
  const raw =
    day === 0 ? hours.sunday : day === 6 ? hours.saturday : hours.monFri;
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (/zatvor|closed|off/i.test(value)) return { closed: true };
  const spec = parseHoursSpec(value, {
    startMinutes: 0,
    endMinutes: 0,
    always: false,
  });
  if (spec.startMinutes === 0 && spec.endMinutes === 0 && !spec.always) {
    return null;
  }
  return spec;
}

function cacheKeys(device: HoursDeviceLike) {
  return [
    device.uuid,
    device.code,
    device.code ? `#${device.code}` : "",
    device.partner,
    device.city,
    device.name,
    device.partner && device.city ? `${device.partner}|${device.city}` : "",
    prevadzkaKey({
      partner: device.partner,
      city: device.city,
      address: device.address,
      uuid: device.uuid,
    }),
  ]
    .map((k) => (k ?? "").trim().toLowerCase())
    .filter(Boolean);
}

export function lookupPrevadzkaHours(
  device: HoursDeviceLike,
  day: number,
): HoursSpec | { closed: true } | null {
  for (const key of cacheKeys(device)) {
    const hours = cache.get(key);
    if (!hours) continue;
    const spec = hoursForDay(hours, day);
    if (spec) return spec;
  }
  return null;
}
