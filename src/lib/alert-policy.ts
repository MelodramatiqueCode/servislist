import type { AlertConfig } from "./alert-config";
import { isWithinStoreHours } from "./alert-hours";
import { offlineConfirmBlocked } from "./alert-offline";
import type { AlertType } from "./alerts";
import { showBezVpn } from "./device-lifecycle";
import type { AlertPending, DeviceEvent, ServiceDevice } from "./types";

export type PolicyContext = {
  now: Date;
  config: AlertConfig;
  pending: AlertPending | null;
  hasOpenHotTicket: boolean;
};

export type ConfirmKind =
  | "immediate"
  | "grace"
  | "hot"
  | "mass_candidate"
  | "weekend_hold";

export function minutesBetween(fromIso: string, to: Date) {
  const start = new Date(fromIso).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, (to.getTime() - start) / 60_000);
}

export function isHotOpen(temp: number | null | undefined, config: AlertConfig) {
  return temp != null && temp >= config.hotOpenC;
}

export function isHotHold(temp: number | null | undefined, config: AlertConfig) {
  return temp != null && temp > config.hotCloseC;
}

export function isPhysicallyActive(
  device: ServiceDevice,
  type: AlertType,
  ctx: Pick<PolicyContext, "config" | "pending" | "hasOpenHotTicket">,
): boolean {
  switch (type) {
    case "offline":
      return !device.isOnline;
    case "undervolt":
      return device.isUndervolted;
    case "hot": {
      if (ctx.pending?.alertType === "hot" || ctx.hasOpenHotTicket) {
        return isHotHold(device.cpuTemp, ctx.config);
      }
      return isHotOpen(device.cpuTemp, ctx.config);
    }
    case "disk":
      return (
        device.storageUsage != null &&
        device.storageTotal != null &&
        device.storageTotal > 0 &&
        device.storageUsage / device.storageTotal >= 0.9
      );
    case "vpn_down":
      return device.isOnline && showBezVpn(device);
    default:
      return false;
  }
}

export function canConfirmAlert(
  type: AlertType,
  device: ServiceDevice,
  ctx: PolicyContext,
): { confirm: boolean; kind: ConfirmKind | "wait" | "outside_hours" } {
  if (!isPhysicallyActive(device, type, ctx)) {
    return { confirm: false, kind: "wait" };
  }

  if (type === "undervolt" || type === "disk" || type === "vpn_down") {
    return { confirm: true, kind: "immediate" };
  }

  if (type === "hot") {
    if (!isHotOpen(device.cpuTemp, ctx.config)) {
      return { confirm: false, kind: "wait" };
    }
    const since = ctx.pending?.firstSeenAt;
    if (!since) return { confirm: false, kind: "wait" };
    if (minutesBetween(since, ctx.now) >= ctx.config.hotMinMinutes) {
      return { confirm: true, kind: "hot" };
    }
    return { confirm: false, kind: "wait" };
  }

  // offline: 12 h from Balena last_connectivity_event + weekend hold
  const blocked = offlineConfirmBlocked(
    device,
    ctx.now,
    ctx.config,
    ctx.pending?.firstSeenAt,
  );
  if (blocked === "weekend_hold") {
    return { confirm: false, kind: "weekend_hold" };
  }
  if (blocked) return { confirm: false, kind: "wait" };
  const inHours = isWithinStoreHours(ctx.now, device, ctx.config);
  if (!inHours) return { confirm: false, kind: "outside_hours" };
  return { confirm: true, kind: "grace" };
}

export function eventDurationSeconds(startedAt: string, endedAt: string) {
  const a = new Date(startedAt).getTime();
  const b = new Date(endedAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 1000);
}

export function flapEligible(event: Pick<DeviceEvent, "outcome" | "alertType">) {
  return event.alertType === "offline" && event.outcome === "short";
}

export function countFlapEvents(
  events: DeviceEvent[],
  deviceUuid: string,
  now: Date,
  windowDays: number,
) {
  const from = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  return events.filter((event) => {
    if (event.deviceUuid !== deviceUuid) return false;
    if (!flapEligible(event)) return false;
    const start = new Date(event.startedAt).getTime();
    return !Number.isNaN(start) && start >= from;
  }).length;
}

export function clusterOfflineWaves<T extends { createdAt: string }>(
  items: T[],
  windowMinutes: number,
  minDevices: number,
) {
  const sorted = [...items].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const clusters: T[][] = [];
  let current: T[] = [];
  let windowStart = 0;

  for (const item of sorted) {
    const t = new Date(item.createdAt).getTime();
    if (Number.isNaN(t)) continue;
    if (current.length === 0) {
      current = [item];
      windowStart = t;
      continue;
    }
    if (t - windowStart <= windowMinutes * 60_000) {
      current.push(item);
    } else {
      clusters.push(current);
      current = [item];
      windowStart = t;
    }
  }
  if (current.length) clusters.push(current);
  return clusters.filter((c) => c.length >= minDevices);
}

export function shouldJoinMass(
  pendingStartedAt: string,
  now: Date,
  windowMinutes: number,
) {
  return minutesBetween(pendingStartedAt, now) <= windowMinutes;
}
