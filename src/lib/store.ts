import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import {
  dbReadDeviceStore,
  dbReadTicketStore,
  dbReadVyjazdStore,
  dbUpsertTicket,
  dbWriteDeviceStore,
  dbWriteTicketStore,
  dbWriteVyjazdStore,
  isDatabaseConfigured,
} from "./db";
import { afterResponse } from "./after-response";
import { getAlertConfig, isAlertsEnabled } from "./alert-config";
import { reconcileAlerts } from "./alert-reconcile";
import {
  listDeviceEvents,
  readAlertPending,
  readMassIncident,
  upsertDeviceEvents,
  writeAlertPending,
  writeMassIncident,
} from "./alert-state";
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
  TicketKind,
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
import { STATUS_LABELS, TICKET_KIND_LABELS } from "./types";
import type { DeviceHealthFilter } from "./parse-device";
import {
  buildMergedVyjazdPair,
  canMergeVyjazdStatus,
  deviceStoreLabel,
  hydrateVyjazd,
  markStopsDone,
  statusAfterStopProgress,
  stopsFromInput,
  syncLegacyVyjazdFields,
  vyjazdCoversDevice,
  vyjazdTicketIds,
} from "./vyjazd-stops";
import { estimateDrivingRoute, routeFingerprint } from "./route-estimate";
import {
  archiveLegacyAutoTickets as applyArchiveLegacyAutoTickets,
  archiveTicket,
  isTicketArchived,
  matchesArchivedFilter,
  type ArchivedFilter,
} from "./ticket-archive";
import { assignedToChangeNote, normalizeAssignedTo } from "./ticket-input";
import { inDateRange, parseTicketRef, parseVyjazdRef } from "./refs";
import {
  buildPrevadzky,
  ticketMatchesPrevadzka,
  vyjazdMatchesPrevadzka,
} from "./prevadzky";
import { vyjazdCode } from "./format";
import {
  addPrevadzkaDevice,
  appendPrevadzkaHistory,
  backfillPrevadzkyFromDevices,
  createManualPrevadzka,
  getStoredPrevadzka,
  listAllPrevadzkaDeviceUuids,
  listPrevadzkaDeviceUuids,
  listStoredPrevadzky,
  maybeWriteCloseVykaz,
  setPrevadzkaStatus,
  storeLabel,
} from "./prevadzka-store";
import {
  JOB_TYPE_LABELS,
  parseJobType,
  type JobType,
  type PrevadzkaRecord,
  type StoreOpeningHours,
  type StoreProfile,
} from "./prevadzka-profile";
import { materialTemplate, type MaterialInput } from "./material";
import { replaceMaterial } from "./material-store";
import { BALENA_FULL_REFRESH_MS } from "./balena-sync-policy";
import { acquireSyncLease, releaseSyncLease } from "./sync-lease";

function dataDir() {
  return (
    process.env.SERVISLIST_DATA_DIR?.trim() ||
    path.join(process.cwd(), "data")
  );
}

function ticketsFile() {
  return path.join(dataDir(), "tickets.json");
}

function devicesFile() {
  return path.join(dataDir(), "devices.json");
}

function vyjazdyFile() {
  return path.join(dataDir(), "vyjazdy.json");
}

const STALE_MS = BALENA_FULL_REFRESH_MS;

const OPEN_STATUSES: TicketStatus[] = ["otvorene", "v_rieseni", "caka_diely"];

function nowIso() {
  return new Date().toISOString();
}

async function writeAuditSafe(input: {
  autor?: string;
  typ: "ticket" | "vyjazd" | "prevadzka" | "sklad" | "nastavenia";
  akcia: string;
  entityId?: string;
  popis: string;
}) {
  const scheduled = afterResponse(async () => {
    const { writeAudit } = await import("./kontrola-store");
    await writeAudit(input);
  });
  if (scheduled) await scheduled;
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
  await fs.mkdir(dataDir(), { recursive: true });
}

async function ensureTicketsFile() {
  await ensureDir();
  try {
    await fs.access(ticketsFile());
  } catch {
    await fs.writeFile(
      ticketsFile(),
      JSON.stringify(seedTickets(), null, 2),
      "utf8",
    );
  }
}

type StoreCache<T> = { at: number; value: Promise<T> } | null;
const STORE_CACHE_MS = 2500;
let ticketStoreCache: StoreCache<TicketStore> = null;
let deviceStoreCache: StoreCache<DeviceStore> = null;
let vyjazdStoreCache: StoreCache<VyjazdStore> = null;

function cachedStore<T>(
  slot: StoreCache<T>,
  load: () => Promise<T>,
  set: (next: StoreCache<T>) => void,
): Promise<T> {
  if (slot && Date.now() - slot.at < STORE_CACHE_MS) return slot.value;
  const value = load().catch((error) => {
    set(null);
    throw error;
  });
  set({ at: Date.now(), value });
  return value;
}

async function readTicketStore(): Promise<TicketStore> {
  return cachedStore(ticketStoreCache, readTicketStoreUncached, (next) => {
    ticketStoreCache = next;
  });
}

async function readTicketStoreUncached(): Promise<TicketStore> {
  if (isDatabaseConfigured()) {
    return dbReadTicketStore();
  }
  await ensureTicketsFile();
  const raw = await fs.readFile(ticketsFile(), "utf8");
  const store = JSON.parse(raw) as TicketStore;
  store.tickets = store.tickets.map((t) => ({
    ...t,
    deviceUuid: t.deviceUuid ?? "",
    source: t.source ?? "manual",
    archivedAt: t.archivedAt || undefined,
    clientRef: t.clientRef || undefined,
    prevadzkaId: t.prevadzkaId || undefined,
    kind: t.kind || undefined,
  }));
  return store;
}

async function writeTicketStore(store: TicketStore) {
  ticketStoreCache = null;
  if (isDatabaseConfigured()) {
    await dbWriteTicketStore(store);
    return;
  }
  await ensureDir();
  await fs.writeFile(ticketsFile(), JSON.stringify(store, null, 2), "utf8");
}

/** Persist one changed ticket. Avoids rewriting ~3k Neon rows on every bot note/PATCH. */
async function persistTicketChange(store: TicketStore, ticket: Ticket) {
  ticketStoreCache = null;
  if (isDatabaseConfigured()) {
    await dbUpsertTicket(ticket, store.nextNumber);
    return;
  }
  await writeTicketStore(store);
}

async function readDeviceStore(): Promise<DeviceStore> {
  return cachedStore(deviceStoreCache, readDeviceStoreUncached, (next) => {
    deviceStoreCache = next;
  });
}

async function readDeviceStoreUncached(): Promise<DeviceStore> {
  if (isDatabaseConfigured()) {
    return dbReadDeviceStore();
  }
  await ensureDir();
  try {
    const raw = await fs.readFile(devicesFile(), "utf8");
    const store = JSON.parse(raw) as DeviceStore;
    store.devices = store.devices.map(hydrateDevice);
    return store;
  } catch {
    try {
      const exportRaw = await fs.readFile(
        path.join(dataDir(), "balena-export.json"),
        "utf8",
      );
      const list = JSON.parse(exportRaw) as BalenaDeviceRaw[];
      if (Array.isArray(list) && list.length > 0) {
        await importBalenaDevices(list);
        const raw = await fs.readFile(devicesFile(), "utf8");
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
  deviceStoreCache = null;
  if (isDatabaseConfigured()) {
    await dbWriteDeviceStore(store);
    return;
  }
  await ensureDir();
  await fs.writeFile(devicesFile(), JSON.stringify(store, null, 2), "utf8");
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
  cached?: boolean;
  skipped?: "in_progress";
};

export async function reconcileDeviceAlerts(
  previous: ServiceDevice[],
  current: ServiceDevice[],
): Promise<{ created: number; resolved: number }> {
  if (!isAlertsEnabled()) {
    return { created: 0, resolved: 0 };
  }

  const config = getAlertConfig();
  const now = new Date();
  const since = new Date(
    now.getTime() - Math.max(config.flapWindowDays, 14) * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [store, pending, events, mass] = await Promise.all([
    readTicketStore(),
    readAlertPending(),
    listDeviceEvents({ sinceIso: since }),
    readMassIncident(),
  ]);

  const result = reconcileAlerts({
    previous,
    current,
    tickets: store,
    pending,
    events,
    mass,
    config,
    now,
  });

  await Promise.all([
    writeTicketStore(result.tickets),
    writeAlertPending(result.pending),
    upsertDeviceEvents(result.events),
    writeMassIncident(result.mass),
  ]);

  return { created: result.created, resolved: result.resolved };
}

export async function listDeviceAlertEvents(deviceUuid: string, days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return listDeviceEvents({ deviceUuid, sinceIso: since });
}

export async function syncFromBalenaCloud(options?: {
  force?: boolean;
}): Promise<SyncResult> {
  const startedAt = nowIso();
  try {
    const result = await runBalenaSync(options);
    await recordSyncRunSafe(startedAt, result);
    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Sync z Baleny zlyhal.";
    try {
      const { captureAppError, recordSyncRun } = await import("./kontrola-store");
      await captureAppError({
        zdroj: "sync",
        route: "/api/sync-balena",
        message,
        stack: error instanceof Error ? error.stack : "",
      });
      await recordSyncRun({
        startedAt,
        finishedAt: nowIso(),
        ok: false,
        devicesOnline: 0,
        devicesOffline: 0,
        devicesLongOffline: 0,
        devicesTest: 0,
        ticketsOpened: 0,
        ticketsClosed: 0,
        error: message,
      });
    } catch {
      /* ignore */
    }
    throw error;
  }
}

async function recordSyncRunSafe(startedAt: string, result: SyncResult) {
  try {
    const { recordSyncRun, captureAppError } = await import("./kontrola-store");
    const stats = await getDeviceStats();
    await recordSyncRun({
      startedAt,
      finishedAt: nowIso(),
      ok: result.ok,
      devicesOnline: result.online || stats.online,
      devicesOffline: result.offline || stats.offline,
      devicesLongOffline: stats.longOffline,
      devicesTest: stats.test,
      ticketsOpened: result.alertsCreated,
      ticketsClosed: result.alertsResolved,
      error: result.error || "",
      silent: Boolean(result.cached || result.skipped),
    });
    if (!result.ok && result.error) {
      await captureAppError({
        zdroj: "sync",
        route: "/api/sync-balena",
        message: result.error,
      });
    }
  } catch {
    /* kontrola must not break sync */
  }
}

async function runBalenaSync(options?: {
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
        cached: true,
      };
    }
  }

  const holder = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const leased = await acquireSyncLease(holder);
  if (!leased) {
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
      syncedAt: existing.syncedAt || "",
      skipped: "in_progress",
    };
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
    await backfillPrevadzkyFromDevices(devices);

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
  } finally {
    await releaseSyncLease(holder);
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

  if (health === "long_offline") {
    const t = (d: ServiceDevice) =>
      new Date(d.lastConnectivityEvent || 0).getTime() || 0;
    devices.sort((a, b) => t(a) - t(b));
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
  const store = await readDeviceStore();
  const all = store.devices;
  const partners = new Set(all.map((d) => d.partner).filter(Boolean));
  return {
    total: all.length,
    online: all.filter((d) => d.isOnline).length,
    offline: all.filter((d) => !d.isOnline).length,
    undervolt: all.filter((d) => d.isUndervolted).length,
    hot: all.filter((d) => isHot(d, getAlertConfig().hotOpenC)).length,
    disk: all.filter((d) => isDiskFull(d)).length,
    alerts: all.filter((d) =>
      matchesHealthFilter(d, "alerts"),
    ).length,
    vpnDown: all.filter((d) => matchesHealthFilter(d, "vpn_down")).length,
    longOffline: all.filter((d) => matchesHealthFilter(d, "long_offline")).length,
    test: all.filter((d) => matchesHealthFilter(d, "test")).length,
    partners: [...partners].sort((a, b) => a.localeCompare(b, "sk")),
    importedAt: store.importedAt,
    syncedAt: store.syncedAt || "",
    lastSyncError: store.lastSyncError || "",
    configured: isBalenaConfigured(),
  };
}

export async function listTickets(filters?: {
  status?: TicketStatus | "vsetky" | "aktivne";
  source?: TicketSource | "vsetky";
  priority?: TicketPriority | "vsetky";
  q?: string;
  deviceUuid?: string;
  archived?: ArchivedFilter;
  prevadzka?: string;
  from?: string;
  to?: string;
  dateField?: "createdAt" | "updatedAt";
}): Promise<Ticket[]> {
  const store = await readTicketStore();
  let tickets = [...store.tickets];
  const archived = filters?.archived ?? "hide";
  tickets = tickets.filter((t) => matchesArchivedFilter(t, archived));

  if (filters?.status && filters.status !== "vsetky") {
    if (filters.status === "aktivne") {
      tickets = tickets.filter((t) => OPEN_STATUSES.includes(t.status));
    } else {
      tickets = tickets.filter((t) => t.status === filters.status);
    }
  }

  if (filters?.source && filters.source !== "vsetky") {
    tickets = tickets.filter((t) => (t.source ?? "manual") === filters.source);
  }

  if (filters?.priority && filters.priority !== "vsetky") {
    tickets = tickets.filter((t) => t.priority === filters.priority);
  }

  if (filters?.deviceUuid) {
    tickets = tickets.filter((t) => t.deviceUuid === filters.deviceUuid);
  }

  if (filters?.prevadzka?.trim()) {
    const devices = (await readDeviceStore()).devices;
    const stored = await getStoredPrevadzka(filters.prevadzka);
    tickets = tickets.filter(
      (t) =>
        (stored && t.prevadzkaId === stored.id) ||
        ticketMatchesPrevadzka(t, filters.prevadzka!, devices),
    );
  }

  if (filters?.from || filters?.to) {
    const field = filters.dateField === "createdAt" ? "createdAt" : "updatedAt";
    tickets = tickets.filter((t) => inDateRange(t[field], filters.from, filters.to));
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

export async function getTicketByRef(ref: string): Promise<Ticket | null> {
  const store = await readTicketStore();
  const parsed = parseTicketRef(ref);
  if (parsed.number != null) {
    return store.tickets.find((t) => t.number === parsed.number) ?? null;
  }
  if (parsed.id) {
    return store.tickets.find((t) => t.id === parsed.id) ?? null;
  }
  return null;
}

export async function getTicketByClientRef(
  clientRef: string,
): Promise<Ticket | null> {
  const ref = clientRef.trim();
  if (!ref) return null;
  const store = await readTicketStore();
  return store.tickets.find((t) => t.clientRef === ref) ?? null;
}

export async function createTicket(
  input: CreateTicketInput,
  opts?: { author?: string; note?: string },
): Promise<Ticket> {
  const clientRef = input.clientRef?.trim() || "";
  if (clientRef) {
    const existing = await getTicketByClientRef(clientRef);
    if (existing) return existing;
  }

  const store = await readTicketStore();
  const timestamp = nowIso();
  const notes: TicketNote[] = [];
  if (opts?.author) {
    const text = opts.note?.trim() || "Ticket vytvorený cez API.";
    notes.push({
      id: randomUUID(),
      text,
      author: opts.author.trim(),
      createdAt: timestamp,
    });
  }

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
    assignedTo: normalizeAssignedTo(input.assignedTo),
    status: "otvorene",
    priority: input.priority,
    notes,
    createdAt: timestamp,
    updatedAt: timestamp,
    source: input.source ?? "manual",
    alertType: input.alertType,
    clientRef: clientRef || undefined,
    prevadzkaId: input.prevadzkaId?.trim() || undefined,
    kind: input.kind || undefined,
  };

  store.nextNumber += 1;
  store.tickets.unshift(ticket);
  await persistTicketChange(store, ticket);
  await writeAuditSafe({
    autor: opts?.author || ticket.assignedTo,
    typ: "ticket",
    akcia: "vytvoril",
    entityId: ticket.id,
    popis: `Ticket #${String(ticket.number).padStart(4, "0")} · ${ticket.customerName || ticket.title}`,
  });
  return ticket;
}

export async function updateTicketStatus(
  id: string,
  status: TicketStatus,
  opts?: { author?: string; note?: string },
): Promise<Ticket | null> {
  const store = await readTicketStore();
  const ticket = store.tickets.find((t) => t.id === id);
  if (!ticket) return null;
  if (isTicketArchived(ticket)) return ticket;
  const previous = ticket.status;
  ticket.status = status;
  const timestamp = nowIso();
  ticket.updatedAt = timestamp;
  if (opts?.author && previous !== status) {
    ticket.notes.push({
      id: randomUUID(),
      text:
        opts.note?.trim() ||
        `Stav zmenený: ${STATUS_LABELS[previous]} → ${STATUS_LABELS[status]}.`,
      author: opts.author.trim(),
      createdAt: timestamp,
    });
  }
  await persistTicketChange(store, ticket);
  if (status === "hotove" && previous !== "hotove") {
    await maybeWriteCloseVykaz(ticket);
    const { writeOffUsedMaterial } = await import("./sklad-store");
    await writeOffUsedMaterial(ticket);
  }
  if (previous !== status) {
    await writeAuditSafe({
      autor: opts?.author || ticket.assignedTo,
      typ: "ticket",
      akcia: status === "hotove" ? "uzavrel" : "zmenil",
      entityId: ticket.id,
      popis: `Ticket #${String(ticket.number).padStart(4, "0")} · ${previous} → ${status}`,
    });
  }
  return ticket;
}

export async function updateTicketPriority(
  id: string,
  priority: TicketPriority,
): Promise<Ticket | null> {
  const store = await readTicketStore();
  const ticket = store.tickets.find((t) => t.id === id);
  if (!ticket) return null;
  if (isTicketArchived(ticket)) return ticket;
  ticket.priority = priority;
  ticket.updatedAt = nowIso();
  await persistTicketChange(store, ticket);
  return ticket;
}

export async function updateTicketAssignedTo(
  id: string,
  assignedTo: string,
  opts: { author: string; botId: string },
): Promise<Ticket | null> {
  const store = await readTicketStore();
  const ticket = store.tickets.find((t) => t.id === id);
  if (!ticket) return null;
  if (isTicketArchived(ticket)) return ticket;
  const previous = normalizeAssignedTo(ticket.assignedTo);
  const next = normalizeAssignedTo(assignedTo);
  if (previous === next) return ticket;
  const timestamp = nowIso();
  ticket.assignedTo = next;
  ticket.updatedAt = timestamp;
  const text = assignedToChangeNote(previous, next, opts.botId);
  ticket.notes.push({
    id: randomUUID(),
    text,
    author: opts.author.trim() || "Servisák",
    createdAt: timestamp,
  });
  await persistTicketChange(store, ticket);
  await writeAuditSafe({
    autor: opts.author,
    typ: "ticket",
    akcia: "zmenil",
    entityId: ticket.id,
    popis: `Ticket #${String(ticket.number).padStart(4, "0")} · ${text}`,
  });
  return ticket;
}

export async function addTicketNote(
  id: string,
  text: string,
  author: string,
  opts?: { clientRef?: string },
): Promise<Ticket | null> {
  const store = await readTicketStore();
  const ticket = store.tickets.find((t) => t.id === id);
  if (!ticket) return null;
  if (isTicketArchived(ticket)) return ticket;

  const clientRef = opts?.clientRef?.trim() || "";
  if (clientRef) {
    const existing = ticket.notes.find((n) => n.clientRef === clientRef);
    if (existing) return ticket;
  }

  const note: TicketNote = {
    id: randomUUID(),
    text: text.trim(),
    author: author.trim() || "Servisák",
    createdAt: nowIso(),
    clientRef: clientRef || undefined,
  };

  ticket.notes.push(note);
  ticket.updatedAt = note.createdAt;
  await persistTicketChange(store, ticket);
  await writeAuditSafe({
    autor: note.author,
    typ: "ticket",
    akcia: "poznamka",
    entityId: ticket.id,
    popis: `Ticket #${String(ticket.number).padStart(4, "0")} · ${note.text.slice(0, 80)}`,
  });
  return ticket;
}

export async function getStats() {
  const store = await readTicketStore();
  const live = store.tickets.filter((t) => matchesArchivedFilter(t, "hide"));
  const archived = store.tickets.filter((t) => matchesArchivedFilter(t, "only"));
  return {
    total: live.length,
    otvorene: live.filter((t) => t.status === "otvorene").length,
    v_rieseni: live.filter((t) => t.status === "v_rieseni").length,
    caka_diely: live.filter((t) => t.status === "caka_diely").length,
    hotove: live.filter((t) => t.status === "hotove").length,
    archived: archived.length,
  };
}

export async function archiveLegacyAutoTickets(opts?: {
  before?: Date;
  dryRun?: boolean;
}) {
  const before = opts?.before ?? new Date();
  const store = await readTicketStore();
  const result = applyArchiveLegacyAutoTickets(store.tickets, before);
  if (!opts?.dryRun && result.archived > 0) {
    store.tickets = result.tickets;
    await writeTicketStore(store);
  }
  return {
    archived: result.archived,
    before: before.toISOString(),
    dryRun: Boolean(opts?.dryRun),
    totalAutoBefore: store.tickets.filter((t) =>
      (t.source ?? "manual") === "auto" &&
      new Date(t.createdAt).getTime() < before.getTime(),
    ).length,
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
    await fs.access(vyjazdyFile());
  } catch {
    await fs.writeFile(
      vyjazdyFile(),
      JSON.stringify(seedVyjazdy(), null, 2),
      "utf8",
    );
  }
}

async function readVyjazdStore(): Promise<VyjazdStore> {
  return cachedStore(vyjazdStoreCache, readVyjazdStoreUncached, (next) => {
    vyjazdStoreCache = next;
  });
}

async function readVyjazdStoreUncached(): Promise<VyjazdStore> {
  if (isDatabaseConfigured()) {
    const store = await dbReadVyjazdStore();
    store.vyjazdy = (store.vyjazdy ?? []).map((v) => hydrateVyjazd(v));
    return store;
  }
  await ensureVyjazdyFile();
  const raw = await fs.readFile(vyjazdyFile(), "utf8");
  const store = JSON.parse(raw) as VyjazdStore;
  store.vyjazdy = (store.vyjazdy ?? []).map((v) => hydrateVyjazd(v));
  return store;
}

async function writeVyjazdStore(store: VyjazdStore) {
  vyjazdStoreCache = null;
  if (isDatabaseConfigured()) {
    await dbWriteVyjazdStore(store);
    return;
  }
  await ensureDir();
  await fs.writeFile(vyjazdyFile(), JSON.stringify(store, null, 2), "utf8");
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

export function vyjazdIsOverdue(status: VyjazdStatus, scheduledAt: string) {
  if (status !== "naplanovany" && status !== "prebieha") return false;
  if (!scheduledAt) return false;
  const t = new Date(scheduledAt).getTime();
  return !Number.isNaN(t) && t < Date.now();
}

export async function listVyjazdy(filters?: {
  status?: VyjazdStatus | "vsetky" | "plan";
  overdue?: boolean;
  q?: string;
  deviceUuid?: string;
  ticketId?: string;
  prevadzka?: string;
  from?: string;
  to?: string;
}): Promise<Vyjazd[]> {
  const store = await readVyjazdStore();
  let vyjazdy = [...store.vyjazdy];

  if (filters?.status === "plan") {
    vyjazdy = vyjazdy.filter((v) => VYJAZD_ACTIVE.includes(v.status));
  } else if (filters?.status && filters.status !== "vsetky") {
    vyjazdy = vyjazdy.filter((v) => v.status === filters.status);
  }

  if (filters?.overdue) {
    vyjazdy = vyjazdy.filter((v) => vyjazdIsOverdue(v.status, v.scheduledAt));
  }

  if (filters?.deviceUuid) {
    vyjazdy = vyjazdy.filter((v) => vyjazdCoversDevice(v, filters.deviceUuid!));
  }

  if (filters?.ticketId) {
    vyjazdy = vyjazdy.filter((v) => vyjazdTicketIds(v).has(filters.ticketId!));
  }

  if (filters?.prevadzka?.trim()) {
    vyjazdy = vyjazdy.filter((v) =>
      vyjazdMatchesPrevadzka(v, filters.prevadzka!),
    );
  }

  if (filters?.from || filters?.to) {
    vyjazdy = vyjazdy.filter((v) => {
      const when = v.scheduledAt || v.updatedAt;
      return inDateRange(when, filters.from, filters.to);
    });
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

export async function getVyjazdByRef(ref: string): Promise<Vyjazd | null> {
  const store = await readVyjazdStore();
  const parsed = parseVyjazdRef(ref);
  if (parsed.number != null) {
    return store.vyjazdy.find((v) => v.number === parsed.number) ?? null;
  }
  if (parsed.id) {
    return store.vyjazdy.find((v) => v.id === parsed.id) ?? null;
  }
  return null;
}

export async function listPrevadzky(query?: string) {
  const devices = (await readDeviceStore()).devices;
  const all = buildPrevadzky(devices);
  const q = query?.trim().toLowerCase() ?? "";
  if (!q) return all;
  return all.filter((p) => {
    const hay = [p.label, p.partner, p.city, p.address, p.phone, p.key]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export async function linkTicketToVyjazd(
  ticketId: string,
  vyjazdId: string,
  opts?: { author?: string },
): Promise<{ ticket: Ticket; vyjazd: Vyjazd; linked: boolean } | null> {
  const ticketStore = await readTicketStore();
  const ticket = ticketStore.tickets.find((t) => t.id === ticketId);
  if (!ticket) return null;

  const vyjazdStore = await readVyjazdStore();
  const vyjazd = vyjazdStore.vyjazdy.find((v) => v.id === vyjazdId);
  if (!vyjazd) return null;

  if (vyjazdTicketIds(vyjazd).has(ticket.id)) {
    return { ticket, vyjazd, linked: false };
  }

  if (!vyjazd.ticketId) {
    vyjazd.ticketId = ticket.id;
  }

  const matchingStop = ticket.deviceUuid
    ? vyjazd.stops.find((s) => s.deviceUuid === ticket.deviceUuid)
    : undefined;
  if (matchingStop && !matchingStop.ticketId) {
    matchingStop.ticketId = ticket.id;
  } else if (
    !vyjazd.stops.some((s) => s.ticketId === ticket.id) &&
    (ticket.customerName || ticket.deviceUuid)
  ) {
    const device = ticket.deviceUuid
      ? (await readDeviceStore()).devices.find((d) => d.uuid === ticket.deviceUuid)
      : null;
    vyjazd.stops.push({
      id: randomUUID(),
      store: ticket.customerName || (device ? deviceStoreLabel(device) : ""),
      address: device?.address ?? "",
      contactPhone: ticket.customerPhone || device?.phone || "",
      deviceUuid: ticket.deviceUuid || "",
      ticketId: ticket.id,
      done: false,
      note: "",
    });
    if (!vyjazd.store) {
      vyjazd.store = ticket.customerName;
    }
    if (!vyjazd.deviceUuid && ticket.deviceUuid) {
      vyjazd.deviceUuid = ticket.deviceUuid;
    }
  }

  syncLegacyVyjazdFields(vyjazd);
  vyjazd.updatedAt = nowIso();

  if (opts?.author) {
    const timestamp = vyjazd.updatedAt;
    ticket.notes.push({
      id: randomUUID(),
      text: `Naviazané na výjazd ${vyjazdCode(vyjazd.number)}.`,
      author: opts.author.trim(),
      createdAt: timestamp,
    });
    ticket.updatedAt = timestamp;
    await persistTicketChange(ticketStore, ticket);
  }

  await writeVyjazdStore(vyjazdStore);
  return { ticket, vyjazd, linked: true };
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
  await writeAuditSafe({
    autor: vyjazd.technician,
    typ: "vyjazd",
    akcia: "vytvoril",
    entityId: vyjazd.id,
    popis: `Výjazd V-${String(vyjazd.number).padStart(4, "0")} · ${vyjazd.title || vyjazd.store}`,
  });
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

export async function ensurePrevadzkyCatalog() {
  const devices = (await readDeviceStore()).devices;
  return backfillPrevadzkyFromDevices(devices);
}

export async function listPrevadzkaProfiles(query?: string) {
  await ensurePrevadzkyCatalog();
  const q = query?.trim().toLowerCase() ?? "";
  const stores = (await listStoredPrevadzky()).filter(
    (s) => s.status !== "rejected",
  );
  if (!q) return stores;
  return stores.filter((s) => {
    const hay = [
      s.name,
      s.chain,
      s.city,
      s.address,
      s.code,
      s.phone,
      s.storeKey,
      s.id,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export async function getPrevadzkaProfile(ref: string) {
  await ensurePrevadzkyCatalog();
  return getStoredPrevadzka(ref);
}

export async function createPrevadzkaWithJob(input: {
  name?: string;
  chain?: string;
  code?: string;
  storeType?: string;
  city?: string;
  address?: string;
  gpsLat?: string;
  gpsLng?: string;
  phone?: string;
  openingHours?: StoreOpeningHours;
  profile?: Partial<StoreProfile>;
  jobType: JobType;
  status?: PrevadzkaRecord["status"];
  author?: string;
  description?: string;
  material?: MaterialInput[];
  assignedTo?: string;
  clientRef?: string;
}) {
  const jobType = parseJobType(input.jobType);
  if (!jobType) {
    throw new Error("Vyber typ zákazky: montáž ozvučenia alebo spustenie zariadenia.");
  }
  const kind: TicketKind =
    jobType === "spustenie_zariadenia" ? "spustenie" : "montaz";
  const store = await createManualPrevadzka({
    ...input,
    jobType,
    status: input.status ?? "active",
    author: input.author,
  });
  const title = TICKET_KIND_LABELS[kind];
  const ticket = await createTicket(
    {
      title,
      description:
        input.description?.trim() ||
        `${JOB_TYPE_LABELS[jobType]} — ${storeLabel(store)}`,
      deviceType: "Raspberry Pi (Balena)",
      deviceSerial: "",
      customerName: storeLabel(store),
      customerPhone: store.phone,
      assignedTo: input.assignedTo?.trim() || "Nepriradené",
      priority: "normalna",
      source: "manual",
      prevadzkaId: store.id,
      kind,
      clientRef: input.clientRef,
    },
    input.author
      ? {
          author: input.author,
          note:
            store.status === "pending"
              ? "Návrh novej prevádzky cez API — čaká na schválenie."
              : `Založené s prevádzkou (${JOB_TYPE_LABELS[jobType]}).`,
        }
      : undefined,
  );
  const rows = input.material?.length
    ? input.material
    : materialTemplate(jobType);
  await replaceMaterial(ticket.id, store.id, rows);
  await writeAuditSafe({
    autor: input.author,
    typ: "prevadzka",
    akcia: store.status === "pending" ? "navrh" : "vytvoril",
    entityId: store.id,
    popis: `${store.status === "pending" ? "Návrh prevádzky" : "Nová prevádzka"} ${storeLabel(store)}`,
  });
  return { store, ticket };
}

export async function confirmPrevadzkaProposal(id: string, author: string) {
  return setPrevadzkaStatus(id, "active", author);
}

export async function rejectPrevadzkaProposal(id: string, author: string) {
  const store = await setPrevadzkaStatus(id, "rejected", author);
  if (!store) return null;
  const ticketStore = await readTicketStore();
  const stamp = nowIso();
  let changed = false;
  ticketStore.tickets = ticketStore.tickets.map((t) => {
    if (t.prevadzkaId !== store.id || isTicketArchived(t)) return t;
    changed = true;
    return archiveTicket(t, stamp, author);
  });
  if (changed) await writeTicketStore(ticketStore);
  return store;
}

export async function linkDeviceToPrevadzka(
  prevadzkaId: string,
  deviceUuid: string,
  author = "Servis",
) {
  const store = await addPrevadzkaDevice(prevadzkaId, deviceUuid);
  if (store) {
    await appendPrevadzkaHistory(
      store.id,
      author,
      `Pripojené zariadenie ${deviceUuid.slice(0, 8)}…`,
    );
  }
  return store;
}

export function matchDevicesForPrevadzka(
  store: PrevadzkaRecord,
  all: ServiceDevice[],
  uuids: string[],
) {
  const linked = all.filter((d) => uuids.includes(d.uuid));
  if (linked.length) return linked;
  return all.filter((d) => {
    const key = [d.partner, d.city, d.address]
      .map((s) => (s ?? "").trim().toLowerCase())
      .join("|");
    return key === store.storeKey;
  });
}

export async function devicesForPrevadzka(store: PrevadzkaRecord) {
  const [uuids, all] = await Promise.all([
    listPrevadzkaDeviceUuids(store.id),
    readDeviceStore(),
  ]);
  return matchDevicesForPrevadzka(store, all.devices, uuids);
}

export async function devicesForPrevadzky(stores: PrevadzkaRecord[]) {
  const [all, linkMap] = await Promise.all([
    readDeviceStore(),
    listAllPrevadzkaDeviceUuids(),
  ]);
  return stores.map((store) =>
    matchDevicesForPrevadzka(store, all.devices, linkMap.get(store.id) ?? []),
  );
}
