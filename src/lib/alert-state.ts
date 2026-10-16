import { promises as fs } from "fs";
import path from "path";
import {
  dbListDeviceEvents,
  dbReadAlertPending,
  dbReadMassIncident,
  dbReplaceAlertPending,
  dbUpsertDeviceEvents,
  dbWriteMassIncident,
  isDatabaseConfigured,
} from "./db";
import type {
  AlertPending,
  DeviceEvent,
  MassIncidentState,
  TicketAlertType,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const EVENTS_FILE = path.join(DATA_DIR, "device-events.json");
const PENDING_FILE = path.join(DATA_DIR, "alert-pending.json");
const KEEP_DAYS = 90;

type EventsFile = { events: DeviceEvent[] };
type PendingFile = {
  pending: AlertPending[];
  mass: MassIncidentState | null;
};

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function pruneEvents(events: DeviceEvent[], now = Date.now()) {
  const cutoff = now - KEEP_DAYS * 24 * 60 * 60 * 1000;
  return events.filter((event) => {
    if (!event.endedAt) return true;
    const t = new Date(event.endedAt).getTime();
    return Number.isNaN(t) || t >= cutoff;
  });
}

async function readEventsFile(): Promise<DeviceEvent[]> {
  try {
    const raw = await fs.readFile(EVENTS_FILE, "utf8");
    const parsed = JSON.parse(raw) as EventsFile;
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

async function writeEventsFile(events: DeviceEvent[]) {
  await ensureDataDir();
  await fs.writeFile(
    EVENTS_FILE,
    JSON.stringify({ events: pruneEvents(events) }, null, 2),
    "utf8",
  );
}

async function readPendingFile(): Promise<PendingFile> {
  try {
    const raw = await fs.readFile(PENDING_FILE, "utf8");
    const parsed = JSON.parse(raw) as PendingFile;
    return {
      pending: Array.isArray(parsed.pending) ? parsed.pending : [],
      mass: parsed.mass ?? null,
    };
  } catch {
    return { pending: [], mass: null };
  }
}

async function writePendingFile(file: PendingFile) {
  await ensureDataDir();
  await fs.writeFile(PENDING_FILE, JSON.stringify(file, null, 2), "utf8");
}

export async function listDeviceEvents(opts?: {
  deviceUuid?: string;
  sinceIso?: string;
}): Promise<DeviceEvent[]> {
  if (isDatabaseConfigured()) {
    return dbListDeviceEvents(opts);
  }
  let events = await readEventsFile();
  if (opts?.deviceUuid) {
    events = events.filter((e) => e.deviceUuid === opts.deviceUuid);
  }
  if (opts?.sinceIso) {
    const since = new Date(opts.sinceIso).getTime();
    events = events.filter((e) => new Date(e.startedAt).getTime() >= since);
  }
  return events.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

export async function upsertDeviceEvents(events: DeviceEvent[]) {
  if (events.length === 0) return;
  if (isDatabaseConfigured()) {
    await dbUpsertDeviceEvents(events);
    return;
  }
  const existing = await readEventsFile();
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const event of events) byId.set(event.id, event);
  await writeEventsFile([...byId.values()]);
}

export async function readAlertPending(): Promise<AlertPending[]> {
  if (isDatabaseConfigured()) return dbReadAlertPending();
  return (await readPendingFile()).pending;
}

export async function writeAlertPending(pending: AlertPending[]) {
  if (isDatabaseConfigured()) {
    await dbReplaceAlertPending(pending);
    return;
  }
  const file = await readPendingFile();
  file.pending = pending;
  await writePendingFile(file);
}

export async function readMassIncident(): Promise<MassIncidentState | null> {
  if (isDatabaseConfigured()) return dbReadMassIncident();
  return (await readPendingFile()).mass;
}

export async function writeMassIncident(state: MassIncidentState | null) {
  if (isDatabaseConfigured()) {
    await dbWriteMassIncident(state);
    return;
  }
  const file = await readPendingFile();
  file.mass = state;
  await writePendingFile(file);
}

export function pendingKey(deviceUuid: string, type: TicketAlertType) {
  return `${deviceUuid}:${type}`;
}

export function deviceEventCounts(
  events: DeviceEvent[],
  windowDays: number,
  now = new Date(),
) {
  const from = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const counts: Partial<Record<TicketAlertType, number>> = {};
  for (const event of events) {
    const t = new Date(event.startedAt).getTime();
    if (Number.isNaN(t) || t < from) continue;
    counts[event.alertType] = (counts[event.alertType] ?? 0) + 1;
  }
  return counts;
}
