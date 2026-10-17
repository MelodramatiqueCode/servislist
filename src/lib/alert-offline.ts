import type { AlertConfig } from "./alert-config";
import { zonedClock } from "./alert-hours";
import type { ServiceDevice, Ticket } from "./types";

const HOUR_MS = 60 * 60 * 1000;

export function parseTimestamp(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const t = new Date(raw);
  return Number.isNaN(t.getTime()) ? null : t;
}

/** Balena last seen, with optional pending/first-seen fallback. */
export function deviceLastSeen(
  device: Pick<ServiceDevice, "lastConnectivityEvent">,
  fallbackIso?: string | null,
): Date | null {
  return parseTimestamp(device.lastConnectivityEvent) ?? parseTimestamp(fallbackIso);
}

export function hoursBetween(from: Date, to: Date) {
  return Math.max(0, (to.getTime() - from.getTime()) / HOUR_MS);
}

export function meetsOfflineThreshold(
  lastSeen: Date,
  now: Date,
  thresholdHours: number,
) {
  return hoursBetween(lastSeen, now) >= thresholdHours;
}

/**
 * Weekend window: Saturday 00:00 – Monday `mondayHour`:00 in `timeZone`
 * (default Monday 07:00 Europe/Bratislava).
 */
export function isInWeekendOfflineWindow(
  at: Date,
  timeZone: string,
  mondayHour: number,
) {
  const clock = zonedClock(at, timeZone);
  if (clock.day === 6 || clock.day === 0) return true;
  return clock.day === 1 && clock.minute < mondayHour * 60;
}

function weekendHoldReleased(
  at: Date,
  timeZone: string,
  mondayHour: number,
) {
  const clock = zonedClock(at, timeZone);
  if (clock.day === 6 || clock.day === 0) return false;
  if (clock.day === 1) return clock.minute >= mondayHour * 60;
  return true;
}

/** Instant the weekend hold ends (Monday `mondayHour`:00 local), or null. */
export function weekendHoldUntil(
  lastSeen: Date,
  timeZone: string,
  mondayHour: number,
): Date | null {
  if (!isInWeekendOfflineWindow(lastSeen, timeZone, mondayHour)) return null;
  let lo = lastSeen.getTime();
  let hi = lo + 4 * 24 * HOUR_MS;
  while (!weekendHoldReleased(new Date(hi), timeZone, mondayHour)) {
    hi += 2 * 24 * HOUR_MS;
    if (hi - lo > 10 * 24 * HOUR_MS) return new Date(hi);
  }
  while (hi - lo > 30_000) {
    const mid = Math.floor((lo + hi) / 2);
    if (weekendHoldReleased(new Date(mid), timeZone, mondayHour)) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

export function isWeekendHoldActive(
  lastSeen: Date,
  now: Date,
  timeZone: string,
  mondayHour: number,
) {
  const until = weekendHoldUntil(lastSeen, timeZone, mondayHour);
  return until != null && now.getTime() < until.getTime();
}

export function offlineConfirmBlocked(
  device: Pick<ServiceDevice, "isOnline" | "lastConnectivityEvent">,
  now: Date,
  config: Pick<
    AlertConfig,
    "offlineThresholdHours" | "weekendHoldMondayHour" | "storeTimezone"
  >,
  fallbackIso?: string | null,
): "wait" | "weekend_hold" | null {
  if (device.isOnline) return "wait";
  const lastSeen = deviceLastSeen(device, fallbackIso);
  if (!lastSeen) return "wait";
  if (
    isWeekendHoldActive(
      lastSeen,
      now,
      config.storeTimezone,
      config.weekendHoldMondayHour,
    )
  ) {
    return "weekend_hold";
  }
  if (!meetsOfflineThreshold(lastSeen, now, config.offlineThresholdHours)) {
    return "wait";
  }
  return null;
}

const LAST_CONN_LINE = /Posledná konektivita:\s*(\S+)/i;

export function lastSeenFromOfflineTicket(
  ticket: Pick<Ticket, "description" | "createdAt">,
  device?: Pick<ServiceDevice, "isOnline" | "lastConnectivityEvent"> | null,
): Date | null {
  if (device && !device.isOnline) {
    const live = parseTimestamp(device.lastConnectivityEvent);
    const created = parseTimestamp(ticket.createdAt);
    if (live && created && live.getTime() <= created.getTime()) return live;
  }
  const match = (ticket.description ?? "").match(LAST_CONN_LINE);
  if (match?.[1]) {
    const fromNote = parseTimestamp(match[1]);
    if (fromNote) return fromNote;
  }
  return parseTimestamp(ticket.createdAt);
}

/**
 * Would this open auto Offline ticket have been created under 12 h + weekend hold?
 * Used only to report existing noise — tickets are not archived.
 */
export function wouldOpenOfflineTicketExist(
  ticket: Pick<Ticket, "description" | "createdAt">,
  device: Pick<ServiceDevice, "isOnline" | "lastConnectivityEvent"> | null,
  config: Pick<
    AlertConfig,
    "offlineThresholdHours" | "weekendHoldMondayHour" | "storeTimezone"
  >,
  at?: Date,
) {
  const created = parseTimestamp(ticket.createdAt);
  if (!created) return false;
  const when = at ?? created;
  const lastSeen = lastSeenFromOfflineTicket(ticket, device);
  if (!lastSeen) return false;
  if (
    isWeekendHoldActive(
      lastSeen,
      when,
      config.storeTimezone,
      config.weekendHoldMondayHour,
    )
  ) {
    return false;
  }
  return meetsOfflineThreshold(lastSeen, when, config.offlineThresholdHours);
}
