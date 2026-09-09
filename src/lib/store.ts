import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { normalizeBalenaDevice } from "./parse-device";
import type {
  BalenaDeviceRaw,
  CreateTicketInput,
  DeviceStore,
  ServiceDevice,
  Ticket,
  TicketNote,
  TicketPriority,
  TicketStatus,
  TicketStore,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const TICKETS_FILE = path.join(DATA_DIR, "tickets.json");
const DEVICES_FILE = path.join(DATA_DIR, "devices.json");

function nowIso() {
  return new Date().toISOString();
}

function seedTickets(): TicketStore {
  const createdAt = nowIso();
  return {
    nextNumber: 1,
    tickets: [],
  };
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
  await ensureTicketsFile();
  const raw = await fs.readFile(TICKETS_FILE, "utf8");
  const store = JSON.parse(raw) as TicketStore;
  store.tickets = store.tickets.map((t) => ({
    ...t,
    deviceUuid: t.deviceUuid ?? "",
  }));
  return store;
}

async function writeTicketStore(store: TicketStore) {
  await ensureDir();
  await fs.writeFile(TICKETS_FILE, JSON.stringify(store, null, 2), "utf8");
}

async function readDeviceStore(): Promise<DeviceStore> {
  await ensureDir();
  try {
    const raw = await fs.readFile(DEVICES_FILE, "utf8");
    return JSON.parse(raw) as DeviceStore;
  } catch {
    // Bootstrap from Balena export if present
    try {
      const exportRaw = await fs.readFile(
        path.join(DATA_DIR, "balena-export.json"),
        "utf8",
      );
      const list = JSON.parse(exportRaw) as BalenaDeviceRaw[];
      if (Array.isArray(list) && list.length > 0) {
        await importBalenaDevices(list);
        const raw = await fs.readFile(DEVICES_FILE, "utf8");
        return JSON.parse(raw) as DeviceStore;
      }
    } catch {
      // no export yet
    }
    return { importedAt: "", devices: [] };
  }
}

async function writeDeviceStore(store: DeviceStore) {
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
    devices: [...byUuid.values()].sort((a, b) => {
      const ac = Number(a.code) || Number.MAX_SAFE_INTEGER;
      const bc = Number(b.code) || Number.MAX_SAFE_INTEGER;
      if (ac !== bc) return ac - bc;
      return a.name.localeCompare(b.name, "sk");
    }),
  };

  await writeDeviceStore(store);
  return { count: store.devices.length };
}

export async function listDevices(filters?: {
  q?: string;
  online?: "all" | "online" | "offline";
  partner?: string;
}): Promise<ServiceDevice[]> {
  const store = await readDeviceStore();
  let devices = [...store.devices];

  if (filters?.online === "online") {
    devices = devices.filter((d) => d.isOnline);
  } else if (filters?.online === "offline") {
    devices = devices.filter((d) => !d.isOnline);
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
  return {
    total: devices.length,
    online: devices.filter((d) => d.isOnline).length,
    offline: devices.filter((d) => !d.isOnline).length,
    partners: [...partners].sort((a, b) => a.localeCompare(b, "sk")),
    importedAt: (await readDeviceStore()).importedAt,
  };
}

export async function listTickets(filters?: {
  status?: TicketStatus | "vsetky";
  q?: string;
  deviceUuid?: string;
}): Promise<Ticket[]> {
  const store = await readTicketStore();
  let tickets = [...store.tickets];

  if (filters?.status && filters.status !== "vsetky") {
    tickets = tickets.filter((t) => t.status === filters.status);
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
