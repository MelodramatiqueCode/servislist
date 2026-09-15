import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import {
  dbReadDeviceStore,
  dbReadTicketStore,
  dbReadVyjazdStore,
  dbWriteDeviceStore,
  dbWriteTicketStore,
  dbWriteVyjazdStore,
  isDatabaseConfigured,
} from "./db";
import {
  ALERT_LABELS,
  activationNote,
  alertPriority,
  buildAlertTicket,
  detectActiveAlerts,
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
  CreateVyjazdInput,
  DeviceStore,
  ServiceDevice,
  Ticket,
  TicketNote,
  TicketPriority,
  TicketSource,
  TicketStatus,
  TicketStore,
  UpdateVyjazdInput,
  Vyjazd,
  VyjazdStatus,
  VyjazdStore,
} from "./types";
import type { DeviceHealthFilter } from "./parse-device";
import {
  buildMergedVyjazdPair,
  canMergeVyjazdStatus,
  hydrateVyjazd,
  markStopsDone,
  statusAfterStopProgress,
  stopsFromInput,
  syncLegacyVyjazdFields,
  vyjazdCoversDevice,
} from "./vyjazd-stops";
import { estimateDrivingRoute, routeFingerprint } from "./route-estimate";

const DATA_DIR = path.join(process.cwd(), "data");
const TICKETS_FILE = path.join(DATA_DIR, "tickets.json");
const DEVICES_FILE = path.join(DATA_DIR, "devices.json");
const VYJAZDY_FILE = path.join(DATA_DIR, "vyjazdy.json");
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

const ALERT_PRIORITY_RANK: Record<TicketPriority, number> = {
  nizka: 0,
  normalna: 1,
  vysoka: 2,
  urgentna: 3,
};

function findOpenAutoTicket(store: TicketStore, deviceUuid: string) {
  return store.tickets.find(
    (t) =>
      t.source === "auto" &&
      t.deviceUuid === deviceUuid &&
      OPEN_STATUSES.includes(t.status),
  );
}

function highestAlert(types: AlertType[]): AlertType {
  return types.reduce((best, type) =>
    ALERT_PRIORITY_RANK[alertPriority(type)] >
    ALERT_PRIORITY_RANK[alertPriority(best)]
      ? type
      : best,
  );
}

function autoNote(text: string, createdAt: string): TicketNote {
  return { id: randomUUID(), text, author: "Automat", createdAt };
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
  let dirty = false;
  const timestamp = nowIso();

  for (const device of current) {
    const prev = prevMap.get(device.uuid);

    const activeNow = detectActiveAlerts(device);
    const activePrev = prev ? detectActiveAlerts(prev) : [];
    const prevSet = new Set(activePrev);
    const nowSet = new Set(activeNow);
    const newlyActive = activeNow.filter((type) => !prevSet.has(type));
    const newlyCleared = activePrev.filter((type) => !nowSet.has(type));

    if (newlyActive.length === 0 && newlyCleared.length === 0) {
      continue;
    }

    let open = findOpenAutoTicket(store, device.uuid);

    // A newly active alert on a device without an open auto-ticket opens ONE
    // grouped ticket; otherwise we append notes to the existing ticket.
    if (newlyActive.length > 0) {
      if (!open) {
        const primary = highestAlert(newlyActive);
        const input = buildAlertTicket(device, primary);
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
          alertType: primary,
        };

        const others = activeNow.filter((type) => type !== primary);
        if (others.length > 0) {
          ticket.notes.push(
            autoNote(
              `Pri vytvorení ticketu boli aktívne aj: ${others
                .map((type) => ALERT_LABELS[type])
                .join(", ")}.`,
              timestamp,
            ),
          );
        }

        store.nextNumber += 1;
        store.tickets.unshift(ticket);
        created += 1;
        dirty = true;
        open = ticket;
      } else {
        for (const type of newlyActive) {
          open.notes.push(autoNote(activationNote(type, device), timestamp));
          if (
            ALERT_PRIORITY_RANK[alertPriority(type)] >
            ALERT_PRIORITY_RANK[open.priority]
          ) {
            open.priority = alertPriority(type);
            open.alertType = type;
          }
        }
        open.updatedAt = timestamp;
        dirty = true;
      }
    }

    // Cleared alerts add a recovery note; the ticket only auto-closes once
    // NO alert types remain active on the device.
    if (newlyCleared.length > 0 && open) {
      for (const type of newlyCleared) {
        open.notes.push(autoNote(recoveryNote(type, device), timestamp));
        resolved += 1;
      }
      open.updatedAt = timestamp;
      if (activeNow.length === 0 && autoClose) {
        open.status = "hotove";
      }
      dirty = true;
    }
  }

  if (dirty) {
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

function seedVyjazdy(): VyjazdStore {
  return {
    nextNumber: 1,
    vyjazdy: [],
  };
}


async function ensureVyjazdyFile() {
  await ensureDir();
  try {
    await fs.access(VYJAZDY_FILE);
  } catch {
    await fs.writeFile(
      VYJAZDY_FILE,
      JSON.stringify(seedVyjazdy(), null, 2),
      "utf8",
    );
  }
}

async function readVyjazdStore(): Promise<VyjazdStore> {
  if (isDatabaseConfigured()) {
    const store = await dbReadVyjazdStore();
    store.vyjazdy = (store.vyjazdy ?? []).map((v) => hydrateVyjazd(v));
    return store;
  }
  await ensureVyjazdyFile();
  const raw = await fs.readFile(VYJAZDY_FILE, "utf8");
  const store = JSON.parse(raw) as VyjazdStore;
  store.vyjazdy = (store.vyjazdy ?? []).map((v) => hydrateVyjazd(v));
  return store;
}

async function writeVyjazdStore(store: VyjazdStore) {
  if (isDatabaseConfigured()) {
    await dbWriteVyjazdStore(store);
    return;
  }
  await ensureDir();
  await fs.writeFile(VYJAZDY_FILE, JSON.stringify(store, null, 2), "utf8");
}

const VYJAZD_ACTIVE: VyjazdStatus[] = ["naplanovany", "prebieha"];

function sortVyjazdy(vyjazdy: Vyjazd[]) {
  const rank: Record<VyjazdStatus, number> = {
    prebieha: 0,
    naplanovany: 1,
    hotovy: 2,
    zruseny: 3,
  };
  return [...vyjazdy].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    const at = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Infinity;
    const bt = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Infinity;
    if (at !== bt) return at - bt;
    return b.number - a.number;
  });
}

export async function listVyjazdy(filters?: {
  status?: VyjazdStatus | "vsetky";
  q?: string;
  deviceUuid?: string;
}): Promise<Vyjazd[]> {
  const store = await readVyjazdStore();
  let vyjazdy = [...store.vyjazdy];

  if (filters?.status && filters.status !== "vsetky") {
    vyjazdy = vyjazdy.filter((v) => v.status === filters.status);
  }

  if (filters?.deviceUuid) {
    vyjazdy = vyjazdy.filter((v) => vyjazdCoversDevice(v, filters.deviceUuid!));
  }

  if (filters?.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    vyjazdy = vyjazdy.filter((v) => {
      const hay = [
        v.title,
        v.store,
        v.address,
        v.technician,
        v.contactPhone,
        v.description,
        v.result,
        v.deviceUuid,
        String(v.number),
        ...(v.stops ?? []).flatMap((s) => [
          s.store,
          s.address,
          s.contactPhone,
          s.deviceUuid,
          s.note,
        ]),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  return sortVyjazdy(vyjazdy);
}

export async function getVyjazd(id: string): Promise<Vyjazd | null> {
  const store = await readVyjazdStore();
  return store.vyjazdy.find((v) => v.id === id) ?? null;
}

export async function createVyjazd(input: CreateVyjazdInput): Promise<Vyjazd> {
  const store = await readVyjazdStore();
  const timestamp = nowIso();
  const stops = stopsFromInput(input);
  const vyjazd: Vyjazd = syncLegacyVyjazdFields({
    id: randomUUID(),
    number: store.nextNumber,
    title: input.title.trim(),
    store: (input.store ?? "").trim(),
    address: (input.address ?? "").trim(),
    contactPhone: (input.contactPhone ?? "").trim(),
    technician: (input.technician ?? "").trim() || "Nepriradené",
    scheduledAt: (input.scheduledAt ?? "").trim(),
    status: input.status ?? "naplanovany",
    priority: input.priority ?? "normalna",
    deviceUuid: (input.deviceUuid ?? "").trim(),
    ticketId: (input.ticketId ?? "").trim(),
    description: (input.description ?? "").trim(),
    result: (input.result ?? "").trim(),
    stops,
    route: null,
    originLabel: (input.originLabel ?? "").trim(),
    originAddress: (input.originAddress ?? "").trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  vyjazd.route = await estimateDrivingRoute(vyjazd.stops, vyjazd);

  store.nextNumber += 1;
  store.vyjazdy.unshift(vyjazd);
  await writeVyjazdStore(store);
  return vyjazd;
}

export async function updateVyjazd(
  id: string,
  patch: UpdateVyjazdInput,
  opts?: { syncStatusFromStops?: boolean; forceRoute?: boolean },
): Promise<Vyjazd | null> {
  const store = await readVyjazdStore();
  const vyjazd = store.vyjazdy.find((v) => v.id === id);
  if (!vyjazd) return null;
  const previousFingerprint = vyjazd.route?.fingerprint ?? "";

  const fields: (keyof UpdateVyjazdInput)[] = [
    "title",
    "store",
    "address",
    "contactPhone",
    "technician",
    "scheduledAt",
    "status",
    "priority",
    "deviceUuid",
    "ticketId",
    "description",
    "result",
    "originLabel",
    "originAddress",
  ];

  for (const key of fields) {
    const value = patch[key];
    if (value === undefined) continue;
    if (typeof value === "string") {
      (vyjazd[key] as string) = value.trim();
    } else {
      (vyjazd[key] as typeof value) = value;
    }
  }

  if (patch.stops) {
    vyjazd.stops = stopsFromInput({ stops: patch.stops });
  } else if (!vyjazd.stops) {
    vyjazd.stops = [];
  }

  if (patch.status === "hotovy") {
    vyjazd.stops = markStopsDone(vyjazd.stops, true);
  }

  if (opts?.syncStatusFromStops) {
    vyjazd.status = statusAfterStopProgress(vyjazd.status, vyjazd.stops);
  }

  syncLegacyVyjazdFields(vyjazd);
  const nextFingerprint = routeFingerprint(vyjazd.stops, vyjazd);
  if (opts?.forceRoute || nextFingerprint !== previousFingerprint) {
    vyjazd.route = await estimateDrivingRoute(vyjazd.stops, vyjazd);
  }
  vyjazd.updatedAt = nowIso();
  await writeVyjazdStore(store);
  return vyjazd;
}

export async function updateVyjazdStatus(
  id: string,
  status: VyjazdStatus,
): Promise<Vyjazd | null> {
  return updateVyjazd(id, { status });
}

export async function setVyjazdStopDone(
  id: string,
  stopId: string,
  done: boolean,
): Promise<Vyjazd | null> {
  const store = await readVyjazdStore();
  const vyjazd = store.vyjazdy.find((v) => v.id === id);
  if (!vyjazd) return null;

  const stop = vyjazd.stops.find((s) => s.id === stopId);
  if (!stop) return null;

  stop.done = done;
  vyjazd.status = statusAfterStopProgress(vyjazd.status, vyjazd.stops);
  syncLegacyVyjazdFields(vyjazd);
  vyjazd.updatedAt = nowIso();
  await writeVyjazdStore(store);
  return vyjazd;
}

/**
 * Spojí secondary do primary. Pravidlá sú v `buildMergedVyjazdPair`
 * (zastávky, metadáta, mäkké zrušenie secondary na zruseny).
 */
export async function mergeVyjazdy(
  primaryId: string,
  secondaryId: string,
): Promise<Vyjazd> {
  if (primaryId === secondaryId) {
    throw new Error("Nie je možné spojiť výjazd so sebou samým.");
  }
  const store = await readVyjazdStore();
  const primary = store.vyjazdy.find((v) => v.id === primaryId);
  const secondary = store.vyjazdy.find((v) => v.id === secondaryId);
  if (!primary || !secondary) {
    throw new Error("Výjazd sa nenašiel.");
  }

  const pair = buildMergedVyjazdPair(primary, secondary, nowIso());
  pair.primary.route = await estimateDrivingRoute(
    pair.primary.stops,
    pair.primary,
  );
  store.vyjazdy = store.vyjazdy.map((v) => {
    if (v.id === primaryId) return pair.primary;
    if (v.id === secondaryId) return pair.secondary;
    return v;
  });
  await writeVyjazdStore(store);
  return pair.primary;
}

export async function refreshVyjazdRoute(id: string): Promise<Vyjazd | null> {
  return updateVyjazd(id, {}, { forceRoute: true });
}

export async function listMergeableVyjazdy(excludeId: string): Promise<Vyjazd[]> {
  const vyjazdy = await listVyjazdy();
  return vyjazdy.filter(
    (v) => v.id !== excludeId && canMergeVyjazdStatus(v.status),
  );
}

export async function deleteVyjazd(id: string): Promise<boolean> {
  const store = await readVyjazdStore();
  const before = store.vyjazdy.length;
  store.vyjazdy = store.vyjazdy.filter((v) => v.id !== id);
  if (store.vyjazdy.length === before) return false;
  await writeVyjazdStore(store);
  return true;
}

export async function getVyjazdStats() {
  const vyjazdy = await listVyjazdy();
  const now = Date.now();
  return {
    total: vyjazdy.length,
    naplanovany: vyjazdy.filter((v) => v.status === "naplanovany").length,
    prebieha: vyjazdy.filter((v) => v.status === "prebieha").length,
    hotovy: vyjazdy.filter((v) => v.status === "hotovy").length,
    zruseny: vyjazdy.filter((v) => v.status === "zruseny").length,
    overdue: vyjazdy.filter(
      (v) =>
        VYJAZD_ACTIVE.includes(v.status) &&
        v.scheduledAt !== "" &&
        new Date(v.scheduledAt).getTime() < now,
    ).length,
  };
}
