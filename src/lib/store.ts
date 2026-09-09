import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type {
  CreateTicketInput,
  Ticket,
  TicketNote,
  TicketPriority,
  TicketStatus,
  TicketStore,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "tickets.json");

function nowIso() {
  return new Date().toISOString();
}

function seedStore(): TicketStore {
  const createdAt = nowIso();
  return {
    nextNumber: 4,
    tickets: [
      {
        id: randomUUID(),
        number: 1,
        title: "Notebook sa nezapína",
        description:
          "Po stlačení power tlačidla nič nereaguje. LED kontrolka bliká raz a zhasne.",
        deviceType: "Notebook",
        deviceSerial: "NB-88421",
        customerName: "Ján Kováč",
        customerPhone: "+421 905 111 222",
        assignedTo: "Peter",
        status: "v_rieseni",
        priority: "vysoka",
        notes: [
          {
            id: randomUUID(),
            text: "Skontrolovaný napájací adaptér – OK. Ďalej diagnostika základnej dosky.",
            author: "Peter",
            createdAt,
          },
        ],
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: randomUUID(),
        number: 2,
        title: "Tlačiareň hlási chybu papiera",
        description:
          "Aj keď je zásobník plný, stále hlási paper jam. Občas vytlačí jednu stranu.",
        deviceType: "Tlačiareň",
        deviceSerial: "HP-5520-A",
        customerName: "Firma Nova s.r.o.",
        customerPhone: "+421 2 5555 100",
        assignedTo: "Lucia",
        status: "otvorene",
        priority: "normalna",
        notes: [],
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: randomUUID(),
        number: 3,
        title: "Telefón – prasknutý displej",
        description: "Displej je prasknutý po páde. Dotyk funguje, ale obraz je rozbitý.",
        deviceType: "Telefón",
        deviceSerial: "IMEI 356938035643809",
        customerName: "Mária Horváthová",
        customerPhone: "+421 918 333 444",
        assignedTo: "Peter",
        status: "caka_diely",
        priority: "urgentna",
        notes: [
          {
            id: randomUUID(),
            text: "Objednaný originálny display. Dodanie o 2–3 dni.",
            author: "Peter",
            createdAt,
          },
        ],
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(seedStore(), null, 2), "utf8");
  }
}

async function readStore(): Promise<TicketStore> {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  return JSON.parse(raw) as TicketStore;
}

async function writeStore(store: TicketStore) {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

export async function listTickets(filters?: {
  status?: TicketStatus | "vsetky";
  q?: string;
}): Promise<Ticket[]> {
  const store = await readStore();
  let tickets = [...store.tickets];

  if (filters?.status && filters.status !== "vsetky") {
    tickets = tickets.filter((t) => t.status === filters.status);
  }

  if (filters?.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    tickets = tickets.filter((t) => {
      const hay = [
        t.title,
        t.description,
        t.deviceType,
        t.deviceSerial,
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
  const store = await readStore();
  return store.tickets.find((t) => t.id === id) ?? null;
}

export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const store = await readStore();
  const timestamp = nowIso();
  const ticket: Ticket = {
    id: randomUUID(),
    number: store.nextNumber,
    title: input.title.trim(),
    description: input.description.trim(),
    deviceType: input.deviceType.trim(),
    deviceSerial: input.deviceSerial.trim(),
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
  await writeStore(store);
  return ticket;
}

export async function updateTicketStatus(
  id: string,
  status: TicketStatus,
): Promise<Ticket | null> {
  const store = await readStore();
  const ticket = store.tickets.find((t) => t.id === id);
  if (!ticket) return null;
  ticket.status = status;
  ticket.updatedAt = nowIso();
  await writeStore(store);
  return ticket;
}

export async function updateTicketPriority(
  id: string,
  priority: TicketPriority,
): Promise<Ticket | null> {
  const store = await readStore();
  const ticket = store.tickets.find((t) => t.id === id);
  if (!ticket) return null;
  ticket.priority = priority;
  ticket.updatedAt = nowIso();
  await writeStore(store);
  return ticket;
}

export async function addTicketNote(
  id: string,
  text: string,
  author: string,
): Promise<Ticket | null> {
  const store = await readStore();
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
  await writeStore(store);
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
