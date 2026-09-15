import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type {
  DeviceStore,
  ServiceDevice,
  Ticket,
  TicketStore,
  Vyjazd,
  VyjazdStore,
} from "./types";
import { hydrateVyjazd } from "./vyjazd-stops";

type Sql = NeonQueryFunction<false, false>;

let cachedSql: Sql | null = null;
let schemaReady: Promise<void> | null = null;

export function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    ""
  );
}

export function isDatabaseConfigured() {
  return Boolean(getDatabaseUrl());
}

export function getSql(): Sql {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error(
      "DATABASE_URL nie je nastavené. Pridaj Neon Postgres connection string.",
    );
  }
  if (!cachedSql) {
    cachedSql = neon(url);
  }
  return cachedSql;
}

export async function ensureSchema() {
  if (!isDatabaseConfigured()) return;
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS tickets (
          id TEXT PRIMARY KEY,
          number INTEGER NOT NULL UNIQUE,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          device_type TEXT NOT NULL DEFAULT '',
          device_serial TEXT NOT NULL DEFAULT '',
          device_uuid TEXT NOT NULL DEFAULT '',
          customer_name TEXT NOT NULL DEFAULT '',
          customer_phone TEXT NOT NULL DEFAULT '',
          assigned_to TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL,
          priority TEXT NOT NULL,
          notes JSONB NOT NULL DEFAULT '[]'::jsonb,
          source TEXT NOT NULL DEFAULT 'manual',
          alert_type TEXT,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets (status)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS tickets_device_uuid_idx ON tickets (device_uuid)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS tickets_alert_open_idx
        ON tickets (source, alert_type, device_uuid, status)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS vyjazdy (
          id TEXT PRIMARY KEY,
          number INTEGER NOT NULL UNIQUE,
          title TEXT NOT NULL,
          store TEXT NOT NULL DEFAULT '',
          address TEXT NOT NULL DEFAULT '',
          contact_phone TEXT NOT NULL DEFAULT '',
          technician TEXT NOT NULL DEFAULT '',
          scheduled_at TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL,
          priority TEXT NOT NULL,
          device_uuid TEXT NOT NULL DEFAULT '',
          ticket_id TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          result TEXT NOT NULL DEFAULT '',
          stops JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        )
      `;
      await sql`
        ALTER TABLE vyjazdy
        ADD COLUMN IF NOT EXISTS stops JSONB NOT NULL DEFAULT '[]'::jsonb
      `;
      await sql`
        ALTER TABLE vyjazdy
        ADD COLUMN IF NOT EXISTS route JSONB
      `;
      await sql`
        ALTER TABLE vyjazdy
        ADD COLUMN IF NOT EXISTS origin_label TEXT NOT NULL DEFAULT ''
      `;
      await sql`
        ALTER TABLE vyjazdy
        ADD COLUMN IF NOT EXISTS origin_address TEXT NOT NULL DEFAULT ''
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS vyjazdy_status_idx ON vyjazdy (status)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS vyjazdy_device_uuid_idx ON vyjazdy (device_uuid)
      `;
      await sql`
        INSERT INTO app_meta (key, value)
        VALUES ('next_ticket_number', '1')
        ON CONFLICT (key) DO NOTHING
      `;
      await sql`
        INSERT INTO app_meta (key, value)
        VALUES ('next_vyjazd_number', '1')
        ON CONFLICT (key) DO NOTHING
      `;
      await sql`
        INSERT INTO app_meta (key, value)
        VALUES ('devices_snapshot', '[]')
        ON CONFLICT (key) DO NOTHING
      `;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

async function getMeta(key: string, fallback = "") {
  const sql = getSql();
  const rows = await sql`SELECT value FROM app_meta WHERE key = ${key} LIMIT 1`;
  return (rows[0]?.value as string | undefined) ?? fallback;
}

async function setMeta(key: string, value: string) {
  const sql = getSql();
  await sql`
    INSERT INTO app_meta (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

function rowToTicket(row: Record<string, unknown>): Ticket {
  const notesRaw = row.notes;
  const notes =
    typeof notesRaw === "string"
      ? JSON.parse(notesRaw)
      : Array.isArray(notesRaw)
        ? notesRaw
        : [];

  return {
    id: String(row.id),
    number: Number(row.number),
    title: String(row.title),
    description: String(row.description),
    deviceType: String(row.device_type ?? ""),
    deviceSerial: String(row.device_serial ?? ""),
    deviceUuid: String(row.device_uuid ?? ""),
    customerName: String(row.customer_name ?? ""),
    customerPhone: String(row.customer_phone ?? ""),
    assignedTo: String(row.assigned_to ?? ""),
    status: row.status as Ticket["status"],
    priority: row.priority as Ticket["priority"],
    notes,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
    source: (row.source as Ticket["source"]) || "manual",
    alertType: (row.alert_type as Ticket["alertType"]) || undefined,
  };
}

export async function dbReadTicketStore(): Promise<TicketStore> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT *
    FROM tickets
    ORDER BY updated_at DESC
  `;
  const nextNumber = Number(await getMeta("next_ticket_number", "1")) || 1;
  return {
    nextNumber,
    tickets: rows.map((row) => rowToTicket(row as Record<string, unknown>)),
  };
}

export async function dbWriteTicketStore(store: TicketStore) {
  await ensureSchema();
  const sql = getSql();

  await setMeta("next_ticket_number", String(store.nextNumber));

  // Upsert all tickets currently in memory.
  for (const ticket of store.tickets) {
    await sql`
      INSERT INTO tickets (
        id, number, title, description,
        device_type, device_serial, device_uuid,
        customer_name, customer_phone, assigned_to,
        status, priority, notes, source, alert_type,
        created_at, updated_at
      ) VALUES (
        ${ticket.id},
        ${ticket.number},
        ${ticket.title},
        ${ticket.description},
        ${ticket.deviceType},
        ${ticket.deviceSerial},
        ${ticket.deviceUuid || ""},
        ${ticket.customerName},
        ${ticket.customerPhone},
        ${ticket.assignedTo},
        ${ticket.status},
        ${ticket.priority},
        ${JSON.stringify(ticket.notes)}::jsonb,
        ${ticket.source || "manual"},
        ${ticket.alertType ?? null},
        ${ticket.createdAt}::timestamptz,
        ${ticket.updatedAt}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        number = EXCLUDED.number,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        device_type = EXCLUDED.device_type,
        device_serial = EXCLUDED.device_serial,
        device_uuid = EXCLUDED.device_uuid,
        customer_name = EXCLUDED.customer_name,
        customer_phone = EXCLUDED.customer_phone,
        assigned_to = EXCLUDED.assigned_to,
        status = EXCLUDED.status,
        priority = EXCLUDED.priority,
        notes = EXCLUDED.notes,
        source = EXCLUDED.source,
        alert_type = EXCLUDED.alert_type,
        updated_at = EXCLUDED.updated_at
    `;
  }
}

function rowToVyjazd(row: Record<string, unknown>): Vyjazd {
  return hydrateVyjazd({
    id: String(row.id),
    number: Number(row.number),
    title: String(row.title),
    store: String(row.store ?? ""),
    address: String(row.address ?? ""),
    contactPhone: String(row.contact_phone ?? ""),
    technician: String(row.technician ?? ""),
    scheduledAt: String(row.scheduled_at ?? ""),
    status: row.status as Vyjazd["status"],
    priority: row.priority as Vyjazd["priority"],
    deviceUuid: String(row.device_uuid ?? ""),
    ticketId: String(row.ticket_id ?? ""),
    description: String(row.description ?? ""),
    result: String(row.result ?? ""),
    stops: row.stops as Vyjazd["stops"],
    route: row.route as Vyjazd["route"],
    originLabel: String(row.origin_label ?? ""),
    originAddress: String(row.origin_address ?? ""),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  });
}

export async function dbReadVyjazdStore(): Promise<VyjazdStore> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT *
    FROM vyjazdy
    ORDER BY updated_at DESC
  `;
  const nextNumber = Number(await getMeta("next_vyjazd_number", "1")) || 1;
  return {
    nextNumber,
    vyjazdy: rows.map((row) => rowToVyjazd(row as Record<string, unknown>)),
  };
}

export async function dbWriteVyjazdStore(store: VyjazdStore) {
  await ensureSchema();
  const sql = getSql();

  await setMeta("next_vyjazd_number", String(store.nextNumber));

  const keepIds = new Set(store.vyjazdy.map((v) => v.id));
  const existing = await sql`SELECT id FROM vyjazdy`;
  for (const row of existing) {
    const id = String((row as Record<string, unknown>).id);
    if (!keepIds.has(id)) {
      await sql`DELETE FROM vyjazdy WHERE id = ${id}`;
    }
  }

  for (const v of store.vyjazdy) {
    await sql`
      INSERT INTO vyjazdy (
        id, number, title, store, address, contact_phone, technician,
        scheduled_at, status, priority, device_uuid, ticket_id,
        description, result, stops, route, origin_label, origin_address,
        created_at, updated_at
      ) VALUES (
        ${v.id},
        ${v.number},
        ${v.title},
        ${v.store},
        ${v.address},
        ${v.contactPhone},
        ${v.technician},
        ${v.scheduledAt},
        ${v.status},
        ${v.priority},
        ${v.deviceUuid || ""},
        ${v.ticketId || ""},
        ${v.description},
        ${v.result},
        ${JSON.stringify(v.stops ?? [])}::jsonb,
        ${JSON.stringify(v.route ?? null)}::jsonb,
        ${v.originLabel || ""},
        ${v.originAddress || ""},
        ${v.createdAt}::timestamptz,
        ${v.updatedAt}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        number = EXCLUDED.number,
        title = EXCLUDED.title,
        store = EXCLUDED.store,
        address = EXCLUDED.address,
        contact_phone = EXCLUDED.contact_phone,
        technician = EXCLUDED.technician,
        scheduled_at = EXCLUDED.scheduled_at,
        status = EXCLUDED.status,
        priority = EXCLUDED.priority,
        device_uuid = EXCLUDED.device_uuid,
        ticket_id = EXCLUDED.ticket_id,
        description = EXCLUDED.description,
        result = EXCLUDED.result,
        stops = EXCLUDED.stops,
        route = EXCLUDED.route,
        origin_label = EXCLUDED.origin_label,
        origin_address = EXCLUDED.origin_address,
        updated_at = EXCLUDED.updated_at
    `;
  }
}

export async function dbReadDeviceStore(): Promise<DeviceStore> {
  await ensureSchema();
  const raw = await getMeta("devices_snapshot", "[]");
  let devices: ServiceDevice[] = [];
  try {
    const parsed = JSON.parse(raw) as ServiceDevice[];
    devices = Array.isArray(parsed) ? parsed : [];
  } catch {
    devices = [];
  }

  return {
    importedAt: await getMeta("devices_imported_at", ""),
    syncedAt: (await getMeta("devices_synced_at", "")) || undefined,
    lastSyncError: (await getMeta("devices_last_sync_error", "")) || undefined,
    devices,
  };
}

export async function dbWriteDeviceStore(store: DeviceStore) {
  await ensureSchema();
  await setMeta("devices_imported_at", store.importedAt || "");
  await setMeta("devices_synced_at", store.syncedAt || "");
  await setMeta("devices_last_sync_error", store.lastSyncError || "");
  await setMeta("devices_snapshot", JSON.stringify(store.devices));
}
