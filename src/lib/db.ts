import { randomUUID } from "crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export const SCHEMA_VERSION = "perf-1";
import type {
  AlertPending,
  DeviceEvent,
  DeviceStore,
  MassIncidentState,
  ServiceDevice,
  Ticket,
  TicketStore,
  Vyjazd,
  VyjazdStore,
} from "./types";
import {
  ARCHIVE_NOTE_TEXT,
  LEGACY_AUTO_ARCHIVE_CUTOFF,
  LEGACY_AUTO_ARCHIVE_META_KEY,
  REDEPLOY_OFFLINE_ARCHIVE_IDS,
  REDEPLOY_OFFLINE_ARCHIVE_META_KEY,
  REDEPLOY_OFFLINE_ARCHIVE_NOTE_TEXT,
} from "./ticket-archive";
import { hydrateVyjazd } from "./vyjazd-stops";
import {
  KEEP_VYJAZD_NUMBER,
  PURGE_OPEN_VYJAZDY_BACKUP_KEY,
  PURGE_OPEN_VYJAZDY_IDS,
  PURGE_OPEN_VYJAZDY_META_KEY,
  purgeOpenVyjazdyAuditPopis,
  shouldPurgeOpenVyjazd,
} from "./vyjazd-purge";

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
      const versionRows = await sql`
        SELECT value FROM app_meta WHERE key = 'schema_version' LIMIT 1
      `;
      if (String(versionRows[0]?.value ?? "") === SCHEMA_VERSION) {
        await deleteStaleOpenVyjazdyOnce(sql);
        return;
      }
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
        ALTER TABLE tickets
        ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS tickets_archived_at_idx ON tickets (archived_at)
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
      await sql`
        ALTER TABLE tickets
        ADD COLUMN IF NOT EXISTS client_ref TEXT
      `;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS tickets_client_ref_uidx
        ON tickets (client_ref)
        WHERE client_ref IS NOT NULL AND client_ref <> ''
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS device_events (
          id TEXT PRIMARY KEY,
          device_uuid TEXT NOT NULL,
          alert_type TEXT NOT NULL,
          started_at TIMESTAMPTZ NOT NULL,
          ended_at TIMESTAMPTZ,
          duration_seconds INTEGER,
          outcome TEXT NOT NULL DEFAULT 'open',
          ticket_id TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT ''
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS device_events_device_started_idx
        ON device_events (device_uuid, started_at DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS device_events_type_started_idx
        ON device_events (alert_type, started_at DESC)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS alert_pending (
          device_uuid TEXT NOT NULL,
          alert_type TEXT NOT NULL,
          first_seen_at TIMESTAMPTZ NOT NULL,
          last_seen_at TIMESTAMPTZ NOT NULL,
          in_hours_since TIMESTAMPTZ,
          event_id TEXT NOT NULL DEFAULT '',
          PRIMARY KEY (device_uuid, alert_type)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS api_tokens (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          revoked_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_used_at TIMESTAMPTZ
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS prevadzky (
          id TEXT PRIMARY KEY,
          store_key TEXT NOT NULL UNIQUE,
          code TEXT NOT NULL DEFAULT '',
          chain TEXT NOT NULL DEFAULT '',
          store_type TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL DEFAULT '',
          city TEXT NOT NULL DEFAULT '',
          address TEXT NOT NULL DEFAULT '',
          gps_lat TEXT NOT NULL DEFAULT '',
          gps_lng TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          opening_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
          profile JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS prevadzka_devices (
          prevadzka_id TEXT NOT NULL,
          device_uuid TEXT NOT NULL,
          PRIMARY KEY (prevadzka_id, device_uuid)
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS prevadzka_devices_uuid_idx
        ON prevadzka_devices (device_uuid)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS profile_suggestions (
          id TEXT PRIMARY KEY,
          prevadzka_id TEXT NOT NULL,
          actor_id TEXT NOT NULL DEFAULT '',
          actor_name TEXT NOT NULL DEFAULT '',
          patch JSONB NOT NULL DEFAULT '{}'::jsonb,
          summary TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          resolved_at TIMESTAMPTZ,
          resolved_by TEXT NOT NULL DEFAULT ''
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS vykaz_prace (
          id TEXT PRIMARY KEY,
          prevadzka_id TEXT NOT NULL,
          work_date TIMESTAMPTZ NOT NULL,
          work_type TEXT NOT NULL,
          author TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          duration_min INTEGER,
          ticket_id TEXT NOT NULL DEFAULT '',
          vyjazd_id TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS vykaz_prace_store_date_idx
        ON vykaz_prace (prevadzka_id, work_date DESC)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS prevadzka_history (
          id TEXT PRIMARY KEY,
          prevadzka_id TEXT NOT NULL,
          at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          author TEXT NOT NULL DEFAULT '',
          text TEXT NOT NULL DEFAULT ''
        )
      `;
      await sql`
        ALTER TABLE prevadzky
        ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
      `;
      await sql`
        ALTER TABLE prevadzky
        ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT ''
      `;
      await sql`
        ALTER TABLE tickets
        ADD COLUMN IF NOT EXISTS prevadzka_id TEXT NOT NULL DEFAULT ''
      `;
      await sql`
        ALTER TABLE tickets
        ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT ''
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS material (
          id TEXT PRIMARY KEY,
          ticket_id TEXT NOT NULL DEFAULT '',
          prevadzka_id TEXT NOT NULL DEFAULT '',
          item TEXT NOT NULL,
          quantity NUMERIC NOT NULL DEFAULT 1,
          unit TEXT NOT NULL DEFAULT 'ks',
          unit_price NUMERIC,
          note TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'planovane',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS material_ticket_idx ON material (ticket_id)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS material_store_idx ON material (prevadzka_id)
      `;
      await sql`
        ALTER TABLE material
        ADD COLUMN IF NOT EXISTS polozka_id TEXT NOT NULL DEFAULT ''
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sklad_polozky (
          id TEXT PRIMARY KEY,
          kod TEXT NOT NULL UNIQUE,
          nazov TEXT NOT NULL,
          kategoria TEXT NOT NULL,
          jednotka TEXT NOT NULL DEFAULT 'ks',
          min_stav NUMERIC NOT NULL DEFAULT 0,
          poznamka TEXT NOT NULL DEFAULT '',
          archived_at TIMESTAMPTZ
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS dodacie_listy (
          id TEXT PRIMARY KEY,
          dodavatel TEXT NOT NULL DEFAULT '',
          cislo_dl TEXT NOT NULL DEFAULT '',
          datum TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          subor_url TEXT NOT NULL DEFAULT '',
          subor_name TEXT NOT NULL DEFAULT '',
          subor_mime TEXT NOT NULL DEFAULT '',
          subor_bytes BYTEA,
          stav TEXT NOT NULL DEFAULT 'cakajuci',
          zdroj TEXT NOT NULL DEFAULT 'web',
          vytvoril TEXT NOT NULL DEFAULT '',
          schvalil TEXT NOT NULL DEFAULT '',
          schvalene_at TIMESTAMPTZ,
          riadky JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sklad_pohyby (
          id TEXT PRIMARY KEY,
          polozka_id TEXT NOT NULL,
          typ TEXT NOT NULL,
          mnozstvo NUMERIC NOT NULL,
          dodaci_list_id TEXT,
          ticket_id TEXT,
          prevadzka_id TEXT,
          ticket_material_id TEXT UNIQUE,
          datum TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          kto TEXT NOT NULL DEFAULT ''
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS sklad_pohyby_polozka_idx
        ON sklad_pohyby (polozka_id, datum DESC)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          autor TEXT NOT NULL,
          typ TEXT NOT NULL,
          akcia TEXT NOT NULL DEFAULT '',
          entity_id TEXT NOT NULL DEFAULT '',
          popis TEXT NOT NULL DEFAULT '',
          diff JSONB,
          request_id TEXT NOT NULL DEFAULT ''
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at DESC)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sync_runs (
          id TEXT PRIMARY KEY,
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ok BOOLEAN NOT NULL DEFAULT FALSE,
          devices_online INTEGER NOT NULL DEFAULT 0,
          devices_offline INTEGER NOT NULL DEFAULT 0,
          devices_long_offline INTEGER NOT NULL DEFAULT 0,
          devices_test INTEGER NOT NULL DEFAULT 0,
          tickets_opened INTEGER NOT NULL DEFAULT 0,
          tickets_closed INTEGER NOT NULL DEFAULT 0,
          error TEXT NOT NULL DEFAULT ''
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS app_errors (
          id TEXT PRIMARY KEY,
          at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          zdroj TEXT NOT NULL,
          route TEXT NOT NULL DEFAULT '',
          status INTEGER NOT NULL DEFAULT 0,
          bot TEXT NOT NULL DEFAULT '',
          message TEXT NOT NULL DEFAULT '',
          stack TEXT NOT NULL DEFAULT ''
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS app_errors_at_idx ON app_errors (at DESC)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS bot_requests (
          id TEXT PRIMARY KEY,
          at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          bot TEXT NOT NULL DEFAULT '',
          method TEXT NOT NULL DEFAULT '',
          path TEXT NOT NULL DEFAULT '',
          status INTEGER NOT NULL DEFAULT 0,
          ms INTEGER NOT NULL DEFAULT 0
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS bot_requests_at_idx ON bot_requests (at DESC)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS bot_navrhy (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          summary TEXT NOT NULL DEFAULT '',
          actor_id TEXT NOT NULL DEFAULT '',
          actor_name TEXT NOT NULL DEFAULT '',
          stav TEXT NOT NULL DEFAULT 'cakajuci',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          resolved_at TIMESTAMPTZ,
          resolved_by TEXT NOT NULL DEFAULT ''
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS tickets_list_idx
        ON tickets (archived_at, status, updated_at DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS tickets_prevadzka_idx ON tickets (prevadzka_id)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS dodacie_listy_stav_idx
        ON dodacie_listy (stav, created_at DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS profile_suggestions_status_idx
        ON profile_suggestions (status, created_at DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS bot_navrhy_stav_idx
        ON bot_navrhy (stav, created_at DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS prevadzky_status_idx ON prevadzky (status)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS sklad_polozky_kat_idx
        ON sklad_polozky (kategoria, nazov)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS material_status_idx ON material (status, ticket_id)
      `;
      await archiveLegacyAutoTicketsOnce(sql);
      await archiveRedeployOfflineTicketsOnce(sql);
      await sql`
        INSERT INTO app_meta (key, value)
        VALUES ('schema_version', ${SCHEMA_VERSION})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
      await deleteStaleOpenVyjazdyOnce(sql);
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

const ARCHIVE_NOTE_ID_SUFFIX = "-archive-2026-10-16";

/**
 * Jednorazová, race-safe archivácia starých Balena auto-ticketov.
 * Jeden UPDATE ... WHERE archived_at IS NULL; ručné sa nedotkne; nič nemaže.
 */
async function archiveLegacyAutoTicketsOnce(sql: Sql) {
  const existing = await getMeta(LEGACY_AUTO_ARCHIVE_META_KEY);
  if (existing !== "") return;

  const noteIdSuffix = ARCHIVE_NOTE_ID_SUFFIX;
  const noteText: string = ARCHIVE_NOTE_TEXT;
  const cutoff: string = LEGACY_AUTO_ARCHIVE_CUTOFF;
  const rows = await sql`
    UPDATE tickets
    SET
      archived_at = NOW(),
      updated_at = NOW(),
      notes = COALESCE(notes, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'id', id || (${noteIdSuffix}::text),
          'text', ${noteText}::text,
          'author', 'Automat',
          'createdAt', to_char(timezone('utc', NOW()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )
      )
    WHERE source = 'auto'
      AND created_at < ${cutoff}::timestamptz
      AND archived_at IS NULL
    RETURNING id
  `;
  const archived = rows.length;

  await sql`
    INSERT INTO app_meta (key, value)
    VALUES (${LEGACY_AUTO_ARCHIVE_META_KEY}, ${String(archived)})
    ON CONFLICT (key) DO UPDATE
    SET value = CASE
      WHEN EXCLUDED.value ~ '^[0-9]+$' AND app_meta.value ~ '^[0-9]+$'
        THEN GREATEST(EXCLUDED.value::int, app_meta.value::int)::text
      WHEN EXCLUDED.value ~ '^[0-9]+$' THEN EXCLUDED.value
      ELSE app_meta.value
    END
  `;
}

/**
 * Jednorazovo archivuje 14 duplicitných Offline auto ticketov z redeployu
 * 2026-10-17T05:15:24Z. Len uvedené id, len source = 'auto'; nič nemaže.
 */
async function archiveRedeployOfflineTicketsOnce(sql: Sql) {
  const existing = await getMeta(REDEPLOY_OFFLINE_ARCHIVE_META_KEY);
  if (existing !== "") return;

  const idsCsv: string = REDEPLOY_OFFLINE_ARCHIVE_IDS.join(",");
  const noteText: string = REDEPLOY_OFFLINE_ARCHIVE_NOTE_TEXT;
  const noteIdSuffix = "-archive-2026-10-17";
  const rows = await sql`
    UPDATE tickets
    SET
      archived_at = NOW(),
      updated_at = NOW(),
      notes = COALESCE(notes, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'id', id || (${noteIdSuffix}::text),
          'text', ${noteText}::text,
          'author', 'Automat',
          'createdAt', to_char(timezone('utc', NOW()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )
      )
    WHERE source = 'auto'
      AND id = ANY(string_to_array(${idsCsv}::text, ','))
      AND archived_at IS NULL
    RETURNING id
  `;

  await sql`
    INSERT INTO app_meta (key, value)
    VALUES (${REDEPLOY_OFFLINE_ARCHIVE_META_KEY}, ${String(rows.length)})
    ON CONFLICT (key) DO NOTHING
  `;
}

function jsonSafeRow(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

/**
 * Jednorazové, race-safe zmazanie 10 starých naplánovaných výjazdov.
 * Tickety nesahe; V-0015 (hotovy) ostáva; záloha ide do app_meta.
 */
async function deleteStaleOpenVyjazdyOnce(sql: Sql) {
  const existing = await getMeta(PURGE_OPEN_VYJAZDY_META_KEY);
  if (existing !== "") return;

  const idsCsv: string = PURGE_OPEN_VYJAZDY_IDS.join(",");
  const keepNumber: number = KEEP_VYJAZD_NUMBER;
  const rawRows = await sql`
    SELECT *
    FROM vyjazdy
    WHERE id = ANY(string_to_array(${idsCsv}::text, ','))
      AND status = 'naplanovany'
      AND number <> ${keepNumber}
  `;
  const rows = rawRows
    .map((row) => jsonSafeRow(row as Record<string, unknown>))
    .filter((row) =>
      shouldPurgeOpenVyjazd({
        id: String(row.id),
        number: Number(row.number),
        status: String(row.status),
      }),
    );
  const deleteIds = rows.map((row) => String(row.id));
  const deleteCsv = deleteIds.join(",");

  const vykazRows =
    deleteIds.length === 0
      ? []
      : (
          await sql`
            SELECT *
            FROM vykaz_prace
            WHERE vyjazd_id = ANY(string_to_array(${deleteCsv}::text, ','))
          `
        ).map((row) => jsonSafeRow(row as Record<string, unknown>));

  const backup = JSON.stringify({
    at: new Date().toISOString(),
    codes: rows.map((row) => `V-${String(row.number).padStart(4, "0")}`),
    keep: "V-0015",
    vyjazdy: rows,
    vykaz: vykazRows,
  });

  await sql`
    INSERT INTO app_meta (key, value)
    VALUES (${PURGE_OPEN_VYJAZDY_BACKUP_KEY}, ${backup})
    ON CONFLICT (key) DO NOTHING
  `;

  const deleted =
    deleteIds.length === 0
      ? []
      : await sql`
          DELETE FROM vyjazdy
          WHERE id = ANY(string_to_array(${deleteCsv}::text, ','))
            AND status = 'naplanovany'
            AND number <> ${keepNumber}
          RETURNING id, number
        `;

  if (vykazRows.length > 0) {
    await sql`
      DELETE FROM vykaz_prace
      WHERE vyjazd_id = ANY(string_to_array(${deleteCsv}::text, ','))
    `;
  }

  if (deleted.length > 0) {
    const codes = deleted.map(
      (row) => `V-${String((row as { number: number }).number).padStart(4, "0")}`,
    );
    const popis = purgeOpenVyjazdyAuditPopis(codes);
    await sql`
      INSERT INTO audit_log (
        id, at, autor, typ, akcia, entity_id, popis, diff, request_id
      ) VALUES (
        ${randomUUID()},
        NOW(),
        'martin',
        'vyjazd',
        'delete',
        ${codes.join(",")},
        ${popis},
        ${JSON.stringify({ ids: deleted.map((row) => String((row as { id: string }).id)) })}::jsonb,
        'purge_open_vyjazdy_2026-10-17'
      )
    `;
  }

  await sql`
    INSERT INTO app_meta (key, value)
    VALUES (${PURGE_OPEN_VYJAZDY_META_KEY}, ${String(deleted.length)})
    ON CONFLICT (key) DO NOTHING
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
    archivedAt: row.archived_at
      ? row.archived_at instanceof Date
        ? row.archived_at.toISOString()
        : String(row.archived_at)
      : undefined,
    clientRef: String(row.client_ref ?? "") || undefined,
    prevadzkaId: String(row.prevadzka_id ?? "") || undefined,
    kind: (String(row.kind ?? "") as Ticket["kind"]) || undefined,
  };
}

export async function dbReadTicketStore(): Promise<TicketStore> {
  await ensureSchema();
  const sql = getSql();
  const [rows, nextRaw] = await Promise.all([
    sql`
      SELECT *
      FROM tickets
      ORDER BY updated_at DESC
    `,
    getMeta("next_ticket_number", "1"),
  ]);
  const nextNumber = Number(nextRaw) || 1;
  return {
    nextNumber,
    tickets: rows.map((row) => rowToTicket(row as Record<string, unknown>)),
  };
}

export function stampIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const raw = String(value ?? "");
  if (!raw) return "";
  const t = Date.parse(raw);
  return Number.isNaN(t) ? raw : new Date(t).toISOString();
}

/** Tickets whose updatedAt changed (or are new). Used so a note/PATCH does not rewrite the whole table. */
export function ticketsNeedingWrite<T extends { id: string; updatedAt: string }>(
  existing: { id: string; updatedAt: unknown }[],
  next: T[],
): T[] {
  const prev = new Map(
    existing.map((row) => [row.id, stampIso(row.updatedAt)]),
  );
  return next.filter((ticket) => prev.get(ticket.id) !== stampIso(ticket.updatedAt));
}

async function upsertTicketRow(sql: Sql, ticket: Ticket) {
  await sql`
    INSERT INTO tickets (
      id, number, title, description,
      device_type, device_serial, device_uuid,
      customer_name, customer_phone, assigned_to,
      status, priority, notes, source, alert_type, archived_at, client_ref,
      prevadzka_id, kind, created_at, updated_at
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
      ${ticket.archivedAt ?? null}::timestamptz,
      ${ticket.clientRef || null},
      ${ticket.prevadzkaId || ""},
      ${ticket.kind || ""},
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
      archived_at = COALESCE(EXCLUDED.archived_at, tickets.archived_at),
      client_ref = EXCLUDED.client_ref,
      prevadzka_id = EXCLUDED.prevadzka_id,
      kind = EXCLUDED.kind,
      updated_at = EXCLUDED.updated_at
  `;
}

export async function dbUpsertTicket(ticket: Ticket, nextNumber?: number) {
  await ensureSchema();
  const sql = getSql();
  if (nextNumber != null) {
    await setMeta("next_ticket_number", String(nextNumber));
  }
  await upsertTicketRow(sql, ticket);
}

export async function dbWriteTicketStore(store: TicketStore) {
  await ensureSchema();
  const sql = getSql();

  await setMeta("next_ticket_number", String(store.nextNumber));

  const rows = await sql`SELECT id, updated_at FROM tickets`;
  const existing = rows.map((row) => {
    const r = row as Record<string, unknown>;
    return { id: String(r.id), updatedAt: r.updated_at };
  });
  for (const ticket of ticketsNeedingWrite(existing, store.tickets)) {
    await upsertTicketRow(sql, ticket);
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
  const [rows, nextRaw] = await Promise.all([
    sql`
      SELECT *
      FROM vyjazdy
      ORDER BY updated_at DESC
    `,
    getMeta("next_vyjazd_number", "1"),
  ]);
  const nextNumber = Number(nextRaw) || 1;
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
  const [raw, importedAt, syncedAt, lastSyncError] = await Promise.all([
    getMeta("devices_snapshot", "[]"),
    getMeta("devices_imported_at", ""),
    getMeta("devices_synced_at", ""),
    getMeta("devices_last_sync_error", ""),
  ]);
  let devices: ServiceDevice[] = [];
  try {
    const parsed = JSON.parse(raw) as ServiceDevice[];
    devices = Array.isArray(parsed) ? parsed : [];
  } catch {
    devices = [];
  }

  return {
    importedAt,
    syncedAt: syncedAt || undefined,
    lastSyncError: lastSyncError || undefined,
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

function rowToDeviceEvent(row: Record<string, unknown>): DeviceEvent {
  return {
    id: String(row.id),
    deviceUuid: String(row.device_uuid ?? ""),
    alertType: row.alert_type as DeviceEvent["alertType"],
    startedAt:
      row.started_at instanceof Date
        ? row.started_at.toISOString()
        : String(row.started_at),
    endedAt: row.ended_at
      ? row.ended_at instanceof Date
        ? row.ended_at.toISOString()
        : String(row.ended_at)
      : null,
    durationSeconds:
      row.duration_seconds == null ? null : Number(row.duration_seconds),
    outcome: (row.outcome as DeviceEvent["outcome"]) || "open",
    ticketId: String(row.ticket_id ?? ""),
    note: String(row.note ?? ""),
  };
}

export async function dbListDeviceEvents(opts?: {
  deviceUuid?: string;
  sinceIso?: string;
}): Promise<DeviceEvent[]> {
  await ensureSchema();
  const sql = getSql();
  const since = opts?.sinceIso ?? "";
  const uuid = opts?.deviceUuid ?? "";
  const rows = uuid
    ? since
      ? await sql`
          SELECT * FROM device_events
          WHERE device_uuid = ${uuid} AND started_at >= ${since}::timestamptz
          ORDER BY started_at DESC
        `
      : await sql`
          SELECT * FROM device_events
          WHERE device_uuid = ${uuid}
          ORDER BY started_at DESC
        `
    : since
      ? await sql`
          SELECT * FROM device_events
          WHERE started_at >= ${since}::timestamptz
          ORDER BY started_at DESC
        `
      : await sql`
          SELECT * FROM device_events
          ORDER BY started_at DESC
          LIMIT 5000
        `;
  return rows.map((row) => rowToDeviceEvent(row as Record<string, unknown>));
}

export async function dbUpsertDeviceEvents(events: DeviceEvent[]) {
  if (events.length === 0) return;
  await ensureSchema();
  const sql = getSql();
  for (const event of events) {
    await sql`
      INSERT INTO device_events (
        id, device_uuid, alert_type, started_at, ended_at,
        duration_seconds, outcome, ticket_id, note
      ) VALUES (
        ${event.id},
        ${event.deviceUuid},
        ${event.alertType},
        ${event.startedAt}::timestamptz,
        ${event.endedAt}::timestamptz,
        ${event.durationSeconds},
        ${event.outcome},
        ${event.ticketId || ""},
        ${event.note || ""}
      )
      ON CONFLICT (id) DO UPDATE SET
        ended_at = EXCLUDED.ended_at,
        duration_seconds = EXCLUDED.duration_seconds,
        outcome = EXCLUDED.outcome,
        ticket_id = EXCLUDED.ticket_id,
        note = EXCLUDED.note
    `;
  }
}

export async function dbReadAlertPending(): Promise<AlertPending[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT * FROM alert_pending`;
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      deviceUuid: String(r.device_uuid),
      alertType: r.alert_type as AlertPending["alertType"],
      firstSeenAt:
        r.first_seen_at instanceof Date
          ? r.first_seen_at.toISOString()
          : String(r.first_seen_at),
      lastSeenAt:
        r.last_seen_at instanceof Date
          ? r.last_seen_at.toISOString()
          : String(r.last_seen_at),
      inHoursSince: r.in_hours_since
        ? r.in_hours_since instanceof Date
          ? r.in_hours_since.toISOString()
          : String(r.in_hours_since)
        : null,
      eventId: String(r.event_id ?? ""),
    };
  });
}

export async function dbReplaceAlertPending(pending: AlertPending[]) {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM alert_pending`;
  for (const row of pending) {
    await sql`
      INSERT INTO alert_pending (
        device_uuid, alert_type, first_seen_at, last_seen_at,
        in_hours_since, event_id
      ) VALUES (
        ${row.deviceUuid},
        ${row.alertType},
        ${row.firstSeenAt}::timestamptz,
        ${row.lastSeenAt}::timestamptz,
        ${row.inHoursSince}::timestamptz,
        ${row.eventId}
      )
    `;
  }
}

export async function dbReadMassIncident(): Promise<MassIncidentState | null> {
  await ensureSchema();
  const raw = await getMeta("mass_incident", "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MassIncidentState;
    if (!parsed?.ticketId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function dbWriteMassIncident(state: MassIncidentState | null) {
  await ensureSchema();
  await setMeta("mass_incident", state ? JSON.stringify(state) : "");
}

export type ApiTokenRow = {
  id: string;
  name: string;
  tokenHash: string;
  revokedAt: string | null;
};

export async function isApiTokenHashRevoked(tokenHash: string) {
  if (!isDatabaseConfigured()) return false;
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT revoked_at
    FROM api_tokens
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `;
  const revokedAt = (rows[0] as { revoked_at?: unknown } | undefined)?.revoked_at;
  return Boolean(revokedAt);
}

export async function findApiTokenByHash(
  tokenHash: string,
): Promise<ApiTokenRow | null> {
  if (!isDatabaseConfigured()) return null;
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, name, token_hash, revoked_at
    FROM api_tokens
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    tokenHash: String(row.token_hash),
    revokedAt:
      row.revoked_at instanceof Date
        ? row.revoked_at.toISOString()
        : row.revoked_at
          ? String(row.revoked_at)
          : null,
  };
}

export async function touchApiTokenLastUsed(id: string) {
  if (!isDatabaseConfigured()) return;
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE api_tokens
    SET last_used_at = NOW()
    WHERE id = ${id}
  `;
}
