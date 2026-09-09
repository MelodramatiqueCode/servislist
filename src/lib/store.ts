import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import {
  dbReadDeviceStore,
  dbReadTicketStore,
  dbWriteDeviceStore,
  dbWriteTicketStore,
  isDatabaseConfigured,
} from "./db";
import {
  ALERT_TYPES,
  buildAlertTicket,
  isAlertActive,
  isAlertAutoCloseEnabled,
  isAlertsEnabled,
  recoveryNote,
  type AlertType,
} from "./alerts";
import {
  fetchBalenaFleetDevices,
  getBalenaConfig,
  isBalenaConfigured,
} from "./balena";
import { normalizeBalenaDevice, matchesHealthFilter, isDiskFull, isHot } from "./parse-device";
import type {
  BalenaDeviceRaw,
  CreateTicketInput,
  DeviceStore,
  ServiceDevice,
  Ticket,
  TicketNote,
  TicketPriority,
  TicketSource,
  TicketStatus,
  TicketStore,
} from "./types";
import type { DeviceHealthFilter } from "./parse-device";

const DATA_DIR = path.join(process.cwd(), "data");
const TICKETS_FILE = path.join(DATA_DIR, "tickets.json");
const DEVICES_FILE = path.join(DATA_DIR, "devices.json");
const STALE_MS = 2 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function seedTickets(): TicketStore {
  return {
    nextNumber: 1,
    tickets: [],
  };
}

function sortDevices(devices: ServiceDevice[]) {
  return [...devices].sort((a, b) => {
    const ac = Number(a.code) || Number.MAX_SAFE_INTEGER;
    const bc = Number(b.code) || Number.MAX_SAFE_INTEGER;
    if (ac !== bc) return ac - bc;
    return a.name.localeCompare(b.name, "sk");
  });
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function ensureTicketsFile() {
  await ensureDir();
  try {
    await fs.access(TICKETS_FILE);
  } catch {
    await fs.writeFile(TICKETS_FILE, JSON.stringify(seedTickets(), null, 2), "utf8");
  }
}

async function readTicketStore(): Promise<TicketStore> {
  if (isDatabaseConfigured()) {
    return dbReadTicketStore();
  }
  await ensureTicketsFile();
  const raw = await fs.readFile(TICKETS_FILE, "utf8");
  const store = JSON.parse(raw) as TicketStore;
  store.tickets = store.tickets.map((t) => ({
    ...t,
    deviceUuid: t.deviceUuid ?? "",
    source: t.source ?? "manual",
  }));
  return store;
}

async function writeTicketStore(store: TicketStore) {
  if (isDatabaseConfigured()) {
    await dbWriteTicketStore(store);
    return;
  }
  await ensureDir();
  await fs.writeFile(TICKETS_FILE, JSON.stringify(store, null, 2), "utf8");
}

async function readDeviceStore(): Promise<DeviceStore> {
  if (isDatabaseConfigured()) {
    return dbReadDeviceStore();
  }
  await ensureDir();
  try {
    const raw = await fs.readFile(DEVICES_FILE, "utf8");
    const store = JSON.parse(raw) as DeviceStore;
    store.devices = store.devices.map(hydrateDevice);
    return store;
  } catch {
    try {
      const exportRaw = await fs.readFile(
        path.join(DATA_DIR, "balena-export.json"),
        "utf8",
      );
      const list = JSON.parse(exportRaw) as BalenaDeviceRaw[];
      if (Array.isArray(list) && list.length > 0) {
        await importBalenaDevices(list);
        const raw = await fs.readFile(DEVICES_FILE, "utf8");
        const store = JSON.parse(raw) as DeviceStore;
        store.devices = store.devices.map(hydrateDevice);
        return store;
      }
    } catch {
      // no export yet
    }
    return { importedAt: "", devices: [] };
  }
}

function hydrateDevice(device: Partial<ServiceDevice> & Pick<ServiceDevice, "uuid" | "name">): ServiceDevice {
  return {
    uuid: device.uuid,
    balenaId: device.balenaId ?? 0,
    name: device.name,
    code: device.code ?? "",
    partner: device.partner ?? "",
    city: device.city ?? "",
    address: device.address ?? "",
    phone: device.phone ?? "",
    status: device.status ?? "",
    overallStatus: device.overallStatus ?? "",
    isOnline: Boolean(device.isOnline),
    isConnectedToVpn: Boolean(device.isConnectedToVpn),
    apiHeartbeat: device.apiHeartbeat ?? "",
    supervisorVersion: device.supervisorVersion ?? "",
    osVersion: device.osVersion ?? "",
    dashboardUrl: device.dashboardUrl ?? "",
    fleet: device.fleet ?? "",
    deviceType: device.deviceType ?? "",
    importedAt: device.importedAt ?? "",
    lastSyncedAt: device.lastSyncedAt,
    lastConnectivityEvent: device.lastConnectivityEvent ?? "",
    lastVpnEvent: device.lastVpnEvent ?? "",
    ipAddress: device.ipAddress ?? "",
    publicAddress: device.publicAddress ?? "",
    macAddress: device.macAddress ?? "",
    cpuUsage: device.cpuUsage ?? null,
    cpuTemp: device.cpuTemp ?? null,
    memoryUsage: device.memoryUsage ?? null,
    memoryTotal: device.memoryTotal ?? null,
    storageUsage: device.storageUsage ?? null,
    storageTotal: device.storageTotal ?? null,
    isUndervolted: Boolean(device.isUndervolted),
    note: device.note ?? "",
  };
}

async function writeDeviceStore(store: DeviceStore) {
  if (isDatabaseConfigured()) {
    await dbWriteDeviceStore(store);
    return;
  }
  await ensureDir();
  await fs.writeFile(DEVICES_FILE, JSON.stringify(store, null, 2), "utf8");
}

export async function importBalenaDevices(
  rawDevices: BalenaDeviceRaw[],
): Promise<{ count: number }> {
  const importedAt = nowIso();
  const byUuid = new Map<string, ServiceDevice>();

  for (const raw of rawDevices) {
    if (!raw?.uuid || !raw?.device_name) continue;
    byUuid.set(raw.uuid, normalizeBalenaDevice(raw, importedAt));
  }

  const store: DeviceStore = {
    importedAt,
    syncedAt: importedAt,
    lastSyncError: "",
    devices: sortDevices([...byUuid.values()]),
  };

  await writeDeviceStore(store);
  return { count: store.devices.length };
}

export type SyncResult = {
  ok: boolean;
  count: number;
  online: number;
  offline: number;
  added: number;
  updated: number;
  alertsCreated: number;
  alertsResolved: number;
  syncedAt: string;
  error?: string;
  configured: boolean;
};

const OPEN_STATUSES: TicketStatus[] = ["otvorene", "v_rieseni", "caka_diely"];

function findOpenAlertTicket(
  store: TicketStore,
  deviceUuid: string,
  alertType: AlertType,
) {
  return store.tickets.find(
    (t) =>
      t.source === "auto" &&
      t.alertType === alertType &&
      t.deviceUuid === deviceUuid &&
      OPEN_STATUSES.includes(t.status),
  );
}

export async function reconcileDeviceAlerts(
  previous: ServiceDevice[],
  current: ServiceDevice[],
): Promise<{ created: number; resolved: number }> {
  if (!isAlertsEnabled()) {
    return { created: 0, resolved: 0 };
  }

  const prevMap = new Map(previous.map((d) => [d.uuid, d]));
  const store = await readTicketStore();
  const autoClose = isAlertAutoCloseEnabled();
  let created = 0;
  let resolved = 0;
  const timestamp = nowIso();

  for (const device of current) {
    const prev = prevMap.get(device.uuid);

    for (const type of ALERT_TYPES) {
      const nowActive = isAlertActive(device, type);
      const wasActive = prev ? isAlertActive(prev, type) : false;
      const open = findOpenAlertTicket(store, device.uuid, type);

      if (nowActive && !wasActive && !open) {
        const input = buildAlertTicket(device, type);
        const ticket: Ticket = {
          id: randomUUID(),
          number: store.nextNumber,
          title: input.title,
          description: input.description,
          deviceType: input.deviceType,
          deviceSerial: input.deviceSerial,
          deviceUuid: input.deviceUuid,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          assignedTo: input.assignedTo,
          status: "otvorene",
          priority: input.priority,
          notes: [],
          createdAt: timestamp,
          updatedAt: timestamp,
          source: "auto",
          alertType: type,
        };
        store.nextNumber += 1;
        store.tickets.unshift(ticket);
        created += 1;
        continue;
      }

      if (!nowActive && open) {
        const note: TicketNote = {
          id: randomUUID(),
          text: recoveryNote(type, device),
          author: "Automat",
          createdAt: timestamp,
        };
        open.notes.push(note);
        open.updatedAt = timestamp;
        if (autoClose) {
          open.status = "hotove";
        }
        resolved += 1;
      }
    }
  }

  if (created > 0 || resolved > 0) {
    await writeTicketStore(store);
  }

  return { created, resolved };
}

export async function syncFromBalenaCloud(options?: {
  force?: boolean;
}): Promise<SyncResult> {
  const config = getBalenaConfig();
  if (!config) {
    return {
      ok: false,
      configured: false,
      count: 0,
      online: 0,
      offline: 0,
      added: 0,
      updated: 0,
      alertsCreated: 0,
      alertsResolved: 0,
      syncedAt: "",
      error:
        "Balena nie je nastavená. Pridaj BALENA_API_TOKEN do .env.local.",
    };
  }

  const existing = await readDeviceStore();
  if (!options?.force && existing.syncedAt) {
    const age = Date.now() - new Date(existing.syncedAt).getTime();
    if (age >= 0 && age < STALE_MS) {
      const online = existing.devices.filter((d) => d.isOnline).length;
      return {
        ok: true,
        configured: true,
        count: existing.devices.length,
        online,
        offline: existing.devices.length - online,
        added: 0,
        updated: 0,
        alertsCreated: 0,
        alertsResolved: 0,
        syncedAt: existing.syncedAt,
      };
    }
  }

  try {
    const remote = await fetchBalenaFleetDevices(config);
    const syncedAt = nowIso();
    const byUuid = new Map(existing.devices.map((d) => [d.uuid, d]));
    let added = 0;
    let updated = 0;

    for (const raw of remote) {
      const normalized = normalizeBalenaDevice(raw, syncedAt);
      const prev = byUuid.get(raw.uuid);
      if (!prev) {
        byUuid.set(raw.uuid, { ...normalized, lastSyncedAt: syncedAt });
        added += 1;
        continue;
      }

      const next: ServiceDevice = {
        ...normalized,
        code: normalized.code || prev.code,
        partner: normalized.partner || prev.partner,
        city: normalized.city || prev.city,
        address: normalized.address || prev.address,
        phone: normalized.phone || prev.phone,
        importedAt: prev.importedAt || syncedAt,
        lastSyncedAt: syncedAt,
      };

      if (
        prev.isOnline !== next.isOnline ||
        prev.status !== next.status ||
        prev.name !== next.name ||
        prev.osVersion !== next.osVersion ||
        prev.isUndervolted !== next.isUndervolted ||
        prev.cpuTemp !== next.cpuTemp ||
        prev.lastConnectivityEvent !== next.lastConnectivityEvent
      ) {
        updated += 1;
      }

      byUuid.set(raw.uuid, next);
    }

    const devices = sortDevices([...byUuid.values()]);
    const alerts = await reconcileDeviceAlerts(existing.devices, devices);

    const store: DeviceStore = {
      importedAt: existing.importedAt || syncedAt,
      syncedAt,
      lastSyncError: "",
      devices,
    };
    await writeDeviceStore(store);

    const online = devices.filter((d) => d.isOnline).length;
    return {
      ok: true,
      configured: true,
      count: devices.length,
      online,
      offline: devices.length - online,
      added,
      updated,
      alertsCreated: alerts.created,
      alertsResolved: alerts.resolved,
      syncedAt,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Sync z Baleny zlyhal.";
    const store = await readDeviceStore();
    store.lastSyncError = message;
    await writeDeviceStore(store);
    return {
      ok: false,
      configured: true,
      count: store.devices.length,
      online: store.devices.filter((d) => d.isOnline).length,
      offline: store.devices.filter((d) => !d.isOnline).length,
      added: 0,
      updated: 0,
      alertsCreated: 0,
      alertsResolved: 0,
      syncedAt: store.syncedAt || "",
      error: message,
    };
  }
}

export async function ensureFreshBalenaSync() {
  if (!isBalenaConfigured()) return null;
  return syncFromBalenaCloud({ force: false });
}

export async function getSyncMeta() {
  const store = await readDeviceStore();
  return {
    configured: isBalenaConfigured(),
    fleetSlug: getBalenaConfig()?.fleetSlug || "ceo2/massiva",
    syncedAt: store.syncedAt || "",
    lastSyncError: store.lastSyncError || "",
    count: store.devices.length,
  };
}

export async function listDevices(filters?: {
  q?: string;
  online?: "all" | "online" | "offline";
  health?: DeviceHealthFilter;
  partner?: string;
}): Promise<ServiceDevice[]> {
  const store = await readDeviceStore();
  let devices = [...store.devices];

  const health = filters?.health || filters?.online || "all";
  if (health && health !== "all") {
    devices = devices.filter((d) =>
      matchesHealthFilter(d, health as DeviceHealthFilter),
    );
  }

  if (filters?.partner && filters.partner !== "all") {
    devices = devices.filter(
      (d) => d.partner.toLowerCase() === filters.partner!.toLowerCase(),
    );
  }

  if (filters?.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    devices = devices.filter((d) => {
      const hay = [
        d.name,
        d.code,
        d.partner,
        d.city,
        d.address,
        d.phone,
        d.uuid,
        d.fleet,
        d.deviceType,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  return devices;
}

export async function getDevice(uuid: string): Promise<ServiceDevice | null> {
  const store = await readDeviceStore();
  return store.devices.find((d) => d.uuid === uuid) ?? null;
}

export async function getDeviceStats() {
  const devices = await listDevices();
  const partners = new Set(devices.map((d) => d.partner).filter(Boolean));
  const store = await readDeviceStore();
  const all = store.devices;
  return {
    total: all.length,
    online: all.filter((d) => d.isOnline).length,
    offline: all.filter((d) => !d.isOnline).length,
    undervolt: all.filter((d) => d.isUndervolted).length,
    hot: all.filter((d) => isHot(d)).length,
    disk: all.filter((d) => isDiskFull(d)).length,
    alerts: all.filter((d) =>
      matchesHealthFilter(d, "alerts"),
    ).length,
    vpnDown: all.filter((d) => matchesHealthFilter(d, "vpn_down")).length,
    partners: [...partners].sort((a, b) => a.localeCompare(b, "sk")),
    importedAt: store.importedAt,
    syncedAt: store.syncedAt || "",
    lastSyncError: store.lastSyncError || "",
    configured: isBalenaConfigured(),
  };
}

export async function listTickets(filters?: {
  status?: TicketStatus | "vsetky";
  source?: TicketSource | "vsetky";
  q?: string;
  deviceUuid?: string;
}): Promise<Ticket[]> {
  const store = await readTicketStore();
  let tickets = [...store.tickets];

  if (filters?.status && filters.status !== "vsetky") {
    tickets = tickets.filter((t) => t.status === filters.status);
  }

  if (filters?.source && filters.source !== "vsetky") {
    tickets = tickets.filter((t) => (t.source ?? "manual") === filters.source);
  }

  if (filters?.deviceUuid) {
    tickets = tickets.filter((t) => t.deviceUuid === filters.deviceUuid);
  }

  if (filters?.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    tickets = tickets.filter((t) => {
      const hay = [
        t.title,
        t.description,
        t.deviceType,
        t.deviceSerial,
        t.deviceUuid,
        t.customerName,
        t.customerPhone,
        t.assignedTo,
        String(t.number),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  return tickets.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function getTicket(id: string): Promise<Ticket | null> {
  const store = await readTicketStore();
  return store.tickets.find((t) => t.id === id) ?? null;
}

export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const store = await readTicketStore();
  const timestamp = nowIso();
  const ticket: Ticket = {
    id: randomUUID(),
    number: store.nextNumber,
    title: input.title.trim(),
    description: input.description.trim(),
    deviceType: input.deviceType.trim(),
    deviceSerial: input.deviceSerial.trim(),
    deviceUuid: input.deviceUuid?.trim() || "",
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    assignedTo: input.assignedTo.trim() || "Nepriradené",
    status: "otvorene",
    priority: input.priority,
    notes: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    source: input.source ?? "manual",
    alertType: input.alertType,
  };

  store.nextNumber += 1;
  store.tickets.unshift(ticket);
  await writeTicketStore(store);
  return ticket;
}

export async function updateTicketStatus(
  id: string,
  status: TicketStatus,
): Promise<Ticket | null> {
  const store = await readTicketStore();
  const ticket = store.tickets.find((t) => t.id === id);
  if (!ticket) return null;
  ticket.status = status;
  ticket.updatedAt = nowIso();
  await writeTicketStore(store);
  return ticket;
}

export async function updateTicketPriority(
  id: string,
  priority: TicketPriority,
): Promise<Ticket | null> {
  const store = await readTicketStore();
  const ticket = store.tickets.find((t) => t.id === id);
  if (!ticket) return null;
  ticket.priority = priority;
  ticket.updatedAt = nowIso();
  await writeTicketStore(store);
  return ticket;
}

export async function addTicketNote(
  id: string,
  text: string,
  author: string,
): Promise<Ticket | null> {
  const store = await readTicketStore();
  const ticket = store.tickets.find((t) => t.id === id);
  if (!ticket) return null;

  const note: TicketNote = {
    id: randomUUID(),
    text: text.trim(),
    author: author.trim() || "Servisák",
    createdAt: nowIso(),
  };

  ticket.notes.push(note);
  ticket.updatedAt = note.createdAt;
  await writeTicketStore(store);
  return ticket;
}

export async function getStats() {
  const tickets = await listTickets();
  return {
    total: tickets.length,
    otvorene: tickets.filter((t) => t.status === "otvorene").length,
    v_rieseni: tickets.filter((t) => t.status === "v_rieseni").length,
    caka_diely: tickets.filter((t) => t.status === "caka_diely").length,
    hotove: tickets.filter((t) => t.status === "hotove").length,
  };
}
