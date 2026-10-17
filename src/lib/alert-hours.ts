import type { AlertConfig, HoursSpec } from "./alert-config";
import { lookupPrevadzkaHours } from "./prevadzka-hours";
import { prevadzkaKey } from "./vyjazd-stops";

export type HoursDevice = {
  uuid?: string;
  code?: string;
  partner?: string;
  city?: string;
  address?: string;
  name?: string;
};

export function minutesOfDay(hours: number, minutes: number) {
  return hours * 60 + minutes;
}

export function zonedClock(at: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(at);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    day: dayMap[weekday] ?? at.getUTCDay(),
    minute: minutesOfDay(hour, minute),
  };
}

export function isWithinHoursSpec(
  spec: HoursSpec,
  minuteOfDay: number,
  day: number,
  storeDays: number[],
) {
  if (spec.always) return true;
  if (!storeDays.includes(day)) return false;
  if (spec.startMinutes < spec.endMinutes) {
    return minuteOfDay >= spec.startMinutes && minuteOfDay < spec.endMinutes;
  }
  // cez polnoc: 21:00–07:00
  return minuteOfDay >= spec.startMinutes || minuteOfDay < spec.endMinutes;
}

export function hoursLookupKeys(device: HoursDevice) {
  const keys = [
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
  ];
  return keys
    .map((k) => (k ?? "").trim().toLowerCase())
    .filter(Boolean);
}

export function resolveHoursSpec(device: HoursDevice, config: AlertConfig): HoursSpec {
  for (const key of hoursLookupKeys(device)) {
    const override = config.hoursOverrides[key];
    if (override) return override;
  }
  return config.storeHours;
}

export function isWithinStoreHours(
  at: Date,
  device: HoursDevice,
  config: AlertConfig,
) {
  const clock = zonedClock(at, config.storeTimezone);
  const fromStore = lookupPrevadzkaHours(device, clock.day);
  if (fromStore) {
    if ("closed" in fromStore) return false;
    return isWithinHoursSpec(fromStore, clock.minute, clock.day, [clock.day]);
  }
  const spec = resolveHoursSpec(device, config);
  return isWithinHoursSpec(spec, clock.minute, clock.day, config.storeDays);
}
