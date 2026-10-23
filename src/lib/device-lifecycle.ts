import type { ServiceDevice } from "./types";

/** Ak by naraz „zmizlo“ viac ako 10 % flotily, nič neoznačuj. */
export const GHOST_MASS_LIMIT = 0.1;

const NOVA_TOKEN_RE = /^(n[oóòô]v[aáàäeéè]\d*)[\s\-]+/iu;
const PRERABKA_RE =
  /^prer[aáàä]bka\s+predajne\s+do\s+konca\s+\S+\s+/iu;

export function stripDeviceNamePrefix(name: string): {
  name: string;
  stripped: string[];
} {
  let current = name.trim();
  const stripped: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const prerabka = current.match(PRERABKA_RE);
    if (prerabka) {
      stripped.push(prerabka[0].trim());
      current = current.slice(prerabka[0].length).trim();
      continue;
    }
    const nova = current.match(NOVA_TOKEN_RE);
    if (nova) {
      stripped.push(nova[0].replace(/[\s\-]+$/g, "").trim());
      current = current.slice(nova[0].length).trim();
      continue;
    }
    break;
  }
  return { name: current || name.trim(), stripped };
}

export function hadReplacementPrefix(name: string) {
  return stripDeviceNamePrefix(name).stripped.length > 0;
}

export function noteWithOriginalName(
  originalName: string,
  stripped: string[],
  existingNote = "",
) {
  if (!stripped.length) return existingNote;
  const line = `Pôvodný názov: ${originalName.trim()}`;
  if (existingNote.includes(line) || existingNote.includes(originalName.trim())) {
    return existingNote;
  }
  return [existingNote.trim(), line].filter(Boolean).join("\n");
}

export function deviceIsOnline(input: {
  isOnline?: boolean;
  is_online?: boolean;
  apiHeartbeat?: string;
  api_heartbeat_state?: string | null;
  overallStatus?: string;
  overall_status?: string | null;
}) {
  const heartbeat = String(
    input.apiHeartbeat ?? input.api_heartbeat_state ?? "",
  ).toLowerCase();
  const overall = String(
    input.overallStatus ?? input.overall_status ?? "",
  ).toLowerCase();
  return (
    Boolean(input.isOnline ?? input.is_online) ||
    heartbeat === "online" ||
    overall === "operational" ||
    overall === "reduced-functionality"
  );
}

export function showBezVpn(device: {
  isConnectedToVpn?: boolean;
  overallStatus?: string;
}) {
  const overall = String(device.overallStatus ?? "").toLowerCase();
  return overall === "reduced-functionality" || !device.isConnectedToVpn;
}

export function isRemovedFromBalena(device: { removedFromBalenaAt?: string }) {
  return Boolean(device.removedFromBalenaAt);
}

export function isReplacedDevice(device: { replacedByUuid?: string }) {
  return Boolean(device.replacedByUuid);
}

export function isActiveFleetDevice(device: {
  removedFromBalenaAt?: string;
}) {
  return !isRemovedFromBalena(device);
}

export function countsForAlerts(device: {
  removedFromBalenaAt?: string;
  replacedByUuid?: string;
}) {
  return isActiveFleetDevice(device) && !isReplacedDevice(device);
}

export function storeIdentityKey(device: {
  code?: string;
  partner?: string;
  city?: string;
}) {
  const code = String(device.code ?? "").trim();
  if (!code || !/^\d+$/.test(code)) return "";
  const partner = String(device.partner ?? "").trim().toLowerCase();
  const city = String(device.city ?? "").trim().toLowerCase();
  if (partner) return `${code}|${partner}`;
  if (city) return `${code}|${city}`;
  return code;
}

function connectivityTs(device: ServiceDevice) {
  const raw = device.lastConnectivityEvent || device.importedAt || "";
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Sufix z názvu (051, P003, K30) nie je adresa predajne. */
export function isWeakAddress(address: string) {
  const value = address.trim();
  if (!value) return true;
  if (/\s/.test(value)) return false;
  return /^[A-Za-z]{0,6}\d+[A-Za-z0-9]*$/.test(value) && value.length <= 12;
}

export function inheritStoreFields(devices: ServiceDevice[]): ServiceDevice[] {
  const next = devices.map((d) => ({ ...d }));
  const groups = new Map<string, ServiceDevice[]>();
  for (const device of next) {
    const key = storeIdentityKey(device);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(device);
    else groups.set(key, [device]);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const donor =
      list.find((d) => d.city && d.address && !isWeakAddress(d.address)) ||
      list.find((d) => d.city && d.address) ||
      list.find((d) => d.city);
    if (!donor) continue;
    for (const device of list) {
      if (!device.city) device.city = donor.city;
      if (!device.address || isWeakAddress(device.address)) {
        if (donor.address && !isWeakAddress(donor.address)) {
          device.address = donor.address;
        } else if (!device.address) {
          device.address = donor.address;
        }
      }
      if (!device.phone) device.phone = donor.phone;
    }
  }
  return next;
}

export function pairReplacementDevices(devices: ServiceDevice[]): ServiceDevice[] {
  const next = devices.map((d) => ({
    ...d,
    replacedByUuid: d.removedFromBalenaAt ? d.replacedByUuid : undefined,
  }));
  const groups = new Map<string, ServiceDevice[]>();
  for (const device of next) {
    if (device.removedFromBalenaAt) continue;
    const key = storeIdentityKey(device);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(device);
    else groups.set(key, [device]);
  }

  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const prefixed = list.filter((d) => hadReplacementPrefix(d.name));
    if (!prefixed.length) continue;
    const primary =
      prefixed.find((d) => d.isOnline) ||
      [...prefixed].sort((a, b) => connectivityTs(b) - connectivityTs(a))[0];
    for (const device of list) {
      device.replacedByUuid =
        device.uuid === primary.uuid ? undefined : primary.uuid;
    }
  }
  return next;
}

export function planRemovedFromBalena(input: {
  remoteUuids: string[];
  devices: ServiceDevice[];
  now: string;
}): {
  devices: ServiceDevice[];
  marked: number;
  unmarked: number;
  skipped: "empty_remote" | "mass_disappear" | null;
  wouldMark: string[];
} {
  if (input.remoteUuids.length === 0) {
    return {
      devices: input.devices,
      marked: 0,
      unmarked: 0,
      skipped: "empty_remote",
      wouldMark: [],
    };
  }
  const remote = new Set(input.remoteUuids);
  const active = input.devices.filter((d) => !d.removedFromBalenaAt);
  const wouldMark = active.filter((d) => !remote.has(d.uuid)).map((d) => d.uuid);
  if (wouldMark.length > active.length * GHOST_MASS_LIMIT) {
    return {
      devices: input.devices,
      marked: 0,
      unmarked: 0,
      skipped: "mass_disappear",
      wouldMark,
    };
  }

  let marked = 0;
  let unmarked = 0;
  const devices = input.devices.map((device) => {
    const inRemote = remote.has(device.uuid);
    if (inRemote && device.removedFromBalenaAt) {
      unmarked += 1;
      return { ...device, removedFromBalenaAt: undefined };
    }
    if (!inRemote && !device.removedFromBalenaAt) {
      marked += 1;
      return { ...device, removedFromBalenaAt: input.now };
    }
    return device;
  });
  return { devices, marked, unmarked, skipped: null, wouldMark };
}

export function primaryStoreDevice(devices: ServiceDevice[]) {
  const active = devices.filter((d) => !d.removedFromBalenaAt);
  if (!active.length) return undefined;
  const live = active.filter((d) => !d.replacedByUuid);
  const online = active.find((d) => d.isOnline) || live.find((d) => d.isOnline);
  if (online) return online;
  const pool = live.length ? live : active;
  return [...pool].sort((a, b) => connectivityTs(b) - connectivityTs(a))[0];
}

export function sortStoreDevices(devices: ServiceDevice[]) {
  const primary = primaryStoreDevice(devices);
  return [...devices].sort((a, b) => {
    if (primary) {
      if (a.uuid === primary.uuid) return -1;
      if (b.uuid === primary.uuid) return 1;
    }
    if (Boolean(a.replacedByUuid) !== Boolean(b.replacedByUuid)) {
      return a.replacedByUuid ? 1 : -1;
    }
    return connectivityTs(b) - connectivityTs(a);
  });
}

export function planStoreMerges(
  stores: Array<{
    id: string;
    storeKey: string;
    code: string;
    createdAt: string;
    status?: string;
  }>,
  links: Map<string, string[]>,
  devices: ServiceDevice[],
): Array<{ keeperId: string; absorbIds: string[] }> {
  const byUuid = new Map(devices.map((d) => [d.uuid, d]));
  const groups = new Map<string, ServiceDevice[]>();
  for (const device of devices) {
    if (device.removedFromBalenaAt) continue;
    if (!hadReplacementPrefix(device.name) && !device.replacedByUuid) continue;
    const key = storeIdentityKey(device);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(device);
    else groups.set(key, [device]);
  }

  const merges: Array<{ keeperId: string; absorbIds: string[] }> = [];

  for (const list of groups.values()) {
    const groupUuids = new Set(list.map((d) => d.uuid));
    // Include siblings that share identity even without prefix (the original Pi).
    const identity = storeIdentityKey(list[0]);
    for (const device of devices) {
      if (device.removedFromBalenaAt) continue;
      if (storeIdentityKey(device) === identity) groupUuids.add(device.uuid);
    }
    if (groupUuids.size < 2 && list.length < 1) continue;

    const involved = stores.filter((store) => {
      if (store.status === "rejected") return false;
      const uuids = links.get(store.id) ?? [];
      return uuids.some((uuid) => groupUuids.has(uuid));
    });
    if (involved.length < 2) continue;

    const original = [...groupUuids]
      .map((uuid) => byUuid.get(uuid))
      .find((d) => d && !hadReplacementPrefix(d.name));
    const keeper =
      involved.find((s) =>
        (links.get(s.id) ?? []).some((uuid) => uuid === original?.uuid),
      ) ||
      [...involved].sort(
        (a, b) =>
          new Date(a.createdAt || 0).getTime() -
          new Date(b.createdAt || 0).getTime(),
      )[0];
    const absorbIds = involved
      .filter((s) => s.id !== keeper.id)
      .filter((s) => {
        const uuids = links.get(s.id) ?? [];
        return uuids.length > 0 && uuids.every((uuid) => groupUuids.has(uuid));
      })
      .map((s) => s.id);
    if (absorbIds.length) merges.push({ keeperId: keeper.id, absorbIds });
  }

  return merges;
}
