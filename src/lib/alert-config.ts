import { parseIgnoreList } from "./alert-suppress";

export type HoursSpec = {
  startMinutes: number;
  endMinutes: number;
  /** `true` = 24/7, offline sa nikdy neskryje pre otváracie hodiny. */
  always: boolean;
};

export type AlertConfig = {
  autoTickets: boolean;
  autoClose: boolean;
  offlineGraceMinutes: number;
  /** Continuous offline from Balena `last_connectivity_event` before an Offline auto-ticket. */
  offlineThresholdHours: number;
  /** Monday local hour that ends the weekend hold (Europe/Bratislava). */
  weekendHoldMondayHour: number;
  massWindowMinutes: number;
  massMinDevices: number;
  hotOpenC: number;
  hotCloseC: number;
  hotMinMinutes: number;
  storeHours: HoursSpec;
  storeTimezone: string;
  storeDays: number[];
  hoursOverrides: Record<string, HoursSpec>;
  flapWindowDays: number;
  flapMinCount: number;
  /** Offline dlhšie ako N dní (Balena last-seen) = žiadny nový ticket, len prehľad „Dlhodobo offline“. */
  longOfflineDays: number;
  /** `ALERT_IGNORE_DEVICES` — UUID / názvy / kódy testovacích zariadení (bez auto ticketov). */
  ignoreDevices: string[];
};

const DEFAULT_HOURS = "07:00-21:00";
const DEFAULT_TZ = "Europe/Bratislava";

/** Offline auto-ticket only after this many continuous hours (Balena last seen). */
export const ALERT_OFFLINE_THRESHOLD_HOURS = 12;
/** No weekend-offline auto-ticket before this Monday hour in `storeTimezone`. */
export const ALERT_WEEKEND_HOLD_MONDAY_HOUR = 7;

export function parseEnvFlag(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback;
  return value !== "0" && value.toLowerCase() !== "false";
}

export function parseEnvInt(
  value: string | undefined,
  fallback: number,
  opts?: { min?: number; max?: number },
) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  if (opts?.min != null && rounded < opts.min) return opts.min;
  if (opts?.max != null && rounded > opts.max) return opts.max;
  return rounded;
}

export function parseHoursSpec(raw: string | undefined, fallback: HoursSpec): HoursSpec {
  const value = (raw ?? "").trim();
  if (!value) return fallback;
  const lower = value.toLowerCase();
  if (lower === "off" || lower === "24/7" || lower === "always") {
    return { startMinutes: 0, endMinutes: 24 * 60, always: true };
  }
  const match = value.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  if (
    start < 0 ||
    end < 0 ||
    start > 24 * 60 ||
    end > 24 * 60 ||
    start === end
  ) {
    return fallback;
  }
  return { startMinutes: start, endMinutes: end, always: false };
}

export function parseStoreDays(raw: string | undefined): number[] {
  if (!raw?.trim()) return [0, 1, 2, 3, 4, 5, 6];
  const days = raw
    .split(",")
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return days.length > 0 ? [...new Set(days)] : [0, 1, 2, 3, 4, 5, 6];
}

export function parseHoursOverrides(raw: string | undefined): Record<string, HoursSpec> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, HoursSpec> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const k = key.trim();
      if (!k) continue;
      out[k.toLowerCase()] = parseHoursSpec(String(value), {
        startMinutes: 7 * 60,
        endMinutes: 21 * 60,
        always: false,
      });
    }
    return out;
  } catch {
    return {};
  }
}

export function defaultAlertConfig(): AlertConfig {
  return {
    autoTickets: true,
    autoClose: true,
    offlineGraceMinutes: 15,
    offlineThresholdHours: ALERT_OFFLINE_THRESHOLD_HOURS,
    weekendHoldMondayHour: ALERT_WEEKEND_HOLD_MONDAY_HOUR,
    massWindowMinutes: 10,
    massMinDevices: 15,
    hotOpenC: 82,
    hotCloseC: 75,
    hotMinMinutes: 10,
    storeHours: parseHoursSpec(DEFAULT_HOURS, {
      startMinutes: 7 * 60,
      endMinutes: 21 * 60,
      always: false,
    }),
    storeTimezone: DEFAULT_TZ,
    storeDays: [0, 1, 2, 3, 4, 5, 6],
    hoursOverrides: {},
    flapWindowDays: 7,
    flapMinCount: 5,
    longOfflineDays: 7,
    ignoreDevices: [],
  };
}

export function loadAlertConfig(env: NodeJS.ProcessEnv = process.env): AlertConfig {
  const defaults = defaultAlertConfig();
  return {
    autoTickets: parseEnvFlag(env.ALERT_AUTO_TICKETS, true),
    autoClose: parseEnvFlag(env.ALERT_AUTO_CLOSE, true),
    offlineGraceMinutes: parseEnvInt(env.ALERT_OFFLINE_GRACE_MINUTES, 15, {
      min: 0,
      max: 24 * 60,
    }),
    offlineThresholdHours: parseEnvInt(
      env.ALERT_OFFLINE_THRESHOLD_HOURS,
      ALERT_OFFLINE_THRESHOLD_HOURS,
      { min: 1, max: 24 * 7 },
    ),
    weekendHoldMondayHour: parseEnvInt(
      env.ALERT_WEEKEND_HOLD_MONDAY_HOUR,
      ALERT_WEEKEND_HOLD_MONDAY_HOUR,
      { min: 0, max: 23 },
    ),
    massWindowMinutes: parseEnvInt(env.ALERT_MASS_WINDOW_MINUTES, 10, {
      min: 1,
      max: 24 * 60,
    }),
    massMinDevices: parseEnvInt(env.ALERT_MASS_MIN_DEVICES, 15, {
      min: 2,
      max: 10_000,
    }),
    hotOpenC: parseEnvInt(env.ALERT_HOT_OPEN_C, 82, { min: 40, max: 120 }),
    hotCloseC: parseEnvInt(env.ALERT_HOT_CLOSE_C, 75, { min: 30, max: 119 }),
    hotMinMinutes: parseEnvInt(env.ALERT_HOT_MIN_MINUTES, 10, {
      min: 0,
      max: 24 * 60,
    }),
    storeHours: parseHoursSpec(env.ALERT_STORE_HOURS, defaults.storeHours),
    storeTimezone: env.ALERT_STORE_TIMEZONE?.trim() || DEFAULT_TZ,
    storeDays: parseStoreDays(env.ALERT_STORE_DAYS),
    hoursOverrides: parseHoursOverrides(env.ALERT_HOURS_OVERRIDES),
    flapWindowDays: parseEnvInt(env.ALERT_FLAP_WINDOW_DAYS, 7, {
      min: 1,
      max: 90,
    }),
    flapMinCount: parseEnvInt(env.ALERT_FLAP_MIN_COUNT, 5, { min: 2, max: 1000 }),
    longOfflineDays: parseEnvInt(env.ALERT_LONG_OFFLINE_DAYS, 7, {
      min: 1,
      max: 365,
    }),
    ignoreDevices: parseIgnoreList(env.ALERT_IGNORE_DEVICES),
  };
}

export function getAlertConfig() {
  return loadAlertConfig();
}

export function isAlertsEnabled() {
  return getAlertConfig().autoTickets;
}

export function isAlertAutoCloseEnabled() {
  return getAlertConfig().autoClose;
}
