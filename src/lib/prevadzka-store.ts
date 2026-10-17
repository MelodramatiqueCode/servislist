import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { ensureSchema, getSql, isDatabaseConfigured } from "./db";
import { setPrevadzkaHoursCache } from "./prevadzka-hours";
import {
  applyStorePatch,
  describeStorePatch,
  emptyOpeningHours,
  emptyProfile,
  hydrateOpeningHours,
  hydrateProfile,
  summarizeSuggestionPatch,
  type PrevadzkaRecord,
  type ProfileHistoryEntry,
  type ProfileSuggestion,
  type StoreOpeningHours,
  type StoreProfile,
} from "./prevadzka-profile";
import { buildPrevadzky } from "./prevadzky";
import type { ServiceDevice, Ticket, Vyjazd } from "./types";
import {
  autoVykazFromTicket,
  autoVykazFromVyjazd,
  filterVykaz,
  mergeVykazEntries,
  parseVykazType,
  ticketQualifiesForVykaz,
  type VykazEntry,
  type VykazType,
} from "./vykaz-prace";
import { prevadzkaKey } from "./vyjazd-stops";

type FileBlob = {
  stores: PrevadzkaRecord[];
  devices: Array<{ prevadzkaId: string; deviceUuid: string }>;
  suggestions: ProfileSuggestion[];
  vykaz: VykazEntry[];
  history: ProfileHistoryEntry[];
};

function dataFile() {
  const dir =
    process.env.SERVISLIST_DATA_DIR?.trim() ||
    path.join(process.cwd(), "data");
  return path.join(dir, "prevadzky-profiles.json");
}

function nowIso() {
  return new Date().toISOString();
}

function emptyBlob(): FileBlob {
  return { stores: [], devices: [], suggestions: [], vykaz: [], history: [] };
}

let fileCache: FileBlob | null = null;
let fileCachePath = "";

async function readBlob(): Promise<FileBlob> {
  const file = dataFile();
  if (fileCache && fileCachePath === file) return fileCache;
  fileCachePath = file;
  try {
    const raw = await fs.readFile(dataFile(), "utf8");
    const parsed = JSON.parse(raw) as FileBlob;
    fileCache = {
      stores: Array.isArray(parsed.stores) ? parsed.stores : [],
      devices: Array.isArray(parsed.devices) ? parsed.devices : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      vykaz: Array.isArray(parsed.vykaz) ? parsed.vykaz : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    fileCache = emptyBlob();
  }
  return fileCache;
}

async function writeBlob(blob: FileBlob) {
  fileCache = blob;
  fileCachePath = dataFile();
  await fs.mkdir(path.dirname(dataFile()), { recursive: true });
  await fs.writeFile(dataFile(), JSON.stringify(blob, null, 2), "utf8");
}

function rowToStore(row: Record<string, unknown>): PrevadzkaRecord {
  return {
    id: String(row.id),
    storeKey: String(row.store_key ?? row.storeKey ?? ""),
    code: String(row.code ?? ""),
    chain: String(row.chain ?? ""),
    storeType: String(row.store_type ?? row.storeType ?? ""),
    name: String(row.name ?? ""),
    city: String(row.city ?? ""),
    address: String(row.address ?? ""),
    gpsLat: String(row.gps_lat ?? row.gpsLat ?? ""),
    gpsLng: String(row.gps_lng ?? row.gpsLng ?? ""),
    phone: String(row.phone ?? ""),
    openingHours: hydrateOpeningHours(row.opening_hours ?? row.openingHours),
    profile: hydrateProfile(row.profile),
    status:
      row.status === "pending" || row.status === "rejected"
        ? row.status
        : "active",
    jobType:
      row.job_type === "montaz_ozvucenia" ||
      row.jobType === "montaz_ozvucenia" ||
      row.job_type === "spustenie_zariadenia" ||
      row.jobType === "spustenie_zariadenia"
        ? ((row.job_type ?? row.jobType) as PrevadzkaRecord["jobType"])
        : "",
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? row.createdAt ?? nowIso()),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at ?? row.updatedAt ?? nowIso()),
  };
}

export async function refreshPrevadzkaHoursCache(stores: PrevadzkaRecord[]) {
  setPrevadzkaHoursCache(
    stores
      .filter((s) => s.status === "active")
      .map((s) => ({
        keys: [
          s.storeKey,
          s.code,
          s.code ? `#${s.code}` : "",
          s.chain,
          s.city,
          s.name,
          s.chain && s.city ? `${s.chain}|${s.city}` : "",
        ],
        hours: s.openingHours,
      })),
  );
}

async function listStoresDb(): Promise<PrevadzkaRecord[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT * FROM prevadzky ORDER BY name, city, code`;
  return rows.map((r) => rowToStore(r as Record<string, unknown>));
}

function hydrateStored(store: PrevadzkaRecord): PrevadzkaRecord {
  return {
    ...store,
    status:
      store.status === "pending" || store.status === "rejected"
        ? store.status
        : "active",
    jobType:
      store.jobType === "montaz_ozvucenia" ||
      store.jobType === "spustenie_zariadenia"
        ? store.jobType
        : "",
    openingHours: hydrateOpeningHours(store.openingHours),
    profile: hydrateProfile(store.profile),
  };
}

async function listStoresFile(): Promise<PrevadzkaRecord[]> {
  return (await readBlob()).stores.map(hydrateStored);
}

export async function listStoredPrevadzky(): Promise<PrevadzkaRecord[]> {
  const stores = isDatabaseConfigured()
    ? await listStoresDb()
    : await listStoresFile();
  await refreshPrevadzkaHoursCache(stores);
  return stores;
}

export async function getStoredPrevadzka(
  ref: string,
): Promise<PrevadzkaRecord | null> {
  const id = ref.trim();
  if (!id) return null;
  const stores = await listStoredPrevadzky();
  const lower = id.toLowerCase();
  return (
    stores.find(
      (s) =>
        s.id === id ||
        s.storeKey === id ||
        s.storeKey.toLowerCase() === lower ||
        s.code === id ||
        `#${s.code}` === id,
    ) ?? null
  );
}

async function upsertStoreDb(store: PrevadzkaRecord) {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO prevadzky (
      id, store_key, code, chain, store_type, name, city, address,
      gps_lat, gps_lng, phone, opening_hours, profile, status, job_type,
      created_at, updated_at
    ) VALUES (
      ${store.id},
      ${store.storeKey},
      ${store.code},
      ${store.chain},
      ${store.storeType},
      ${store.name},
      ${store.city},
      ${store.address},
      ${store.gpsLat},
      ${store.gpsLng},
      ${store.phone},
      ${JSON.stringify(store.openingHours)}::jsonb,
      ${JSON.stringify(store.profile)}::jsonb,
      ${store.status},
      ${store.jobType},
      ${store.createdAt}::timestamptz,
      ${store.updatedAt}::timestamptz
    )
    ON CONFLICT (id) DO UPDATE SET
      store_key = EXCLUDED.store_key,
      code = EXCLUDED.code,
      chain = EXCLUDED.chain,
      store_type = EXCLUDED.store_type,
      name = EXCLUDED.name,
      city = EXCLUDED.city,
      address = EXCLUDED.address,
      gps_lat = EXCLUDED.gps_lat,
      gps_lng = EXCLUDED.gps_lng,
      phone = EXCLUDED.phone,
      opening_hours = EXCLUDED.opening_hours,
      profile = EXCLUDED.profile,
      status = EXCLUDED.status,
      job_type = EXCLUDED.job_type,
      updated_at = EXCLUDED.updated_at
  `;
}

async function insertStoreIfMissingDb(store: PrevadzkaRecord): Promise<boolean> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO prevadzky (
      id, store_key, code, chain, store_type, name, city, address,
      gps_lat, gps_lng, phone, opening_hours, profile, status, job_type,
      created_at, updated_at
    ) VALUES (
      ${store.id},
      ${store.storeKey},
      ${store.code},
      ${store.chain},
      ${store.storeType},
      ${store.name},
      ${store.city},
      ${store.address},
      ${store.gpsLat},
      ${store.gpsLng},
      ${store.phone},
      ${JSON.stringify(store.openingHours)}::jsonb,
      ${JSON.stringify(store.profile)}::jsonb,
      ${store.status},
      ${store.jobType},
      ${store.createdAt}::timestamptz,
      ${store.updatedAt}::timestamptz
    )
    ON CONFLICT (store_key) DO NOTHING
    RETURNING id
  `;
  return rows.length > 0;
}

async function linkDeviceDb(prevadzkaId: string, deviceUuid: string) {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO prevadzka_devices (prevadzka_id, device_uuid)
    VALUES (${prevadzkaId}, ${deviceUuid})
    ON CONFLICT (prevadzka_id, device_uuid) DO NOTHING
  `;
}

export async function listPrevadzkaDeviceUuids(
  prevadzkaId: string,
): Promise<string[]> {
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT device_uuid FROM prevadzka_devices WHERE prevadzka_id = ${prevadzkaId}
    `;
    return rows.map((r) => String((r as { device_uuid: string }).device_uuid));
  }
  const blob = await readBlob();
  return blob.devices
    .filter((d) => d.prevadzkaId === prevadzkaId)
    .map((d) => d.deviceUuid);
}

export async function backfillPrevadzkyFromDevices(devices: ServiceDevice[]) {
  const derived = buildPrevadzky(devices);
  const existing = await listStoredPrevadzky();
  const byKey = new Map(existing.map((s) => [s.storeKey, s]));
  let created = 0;
  const stamp = nowIso();

  for (const group of derived) {
    let store = byKey.get(group.key);
    if (!store) {
      store = {
        id: randomUUID(),
        storeKey: group.key,
        code: group.devices[0]?.code || "",
        chain: group.partner,
        storeType: "",
        name: group.city || group.label,
        city: group.city,
        address: group.address,
        gpsLat: "",
        gpsLng: "",
        phone: group.phone,
        openingHours: emptyOpeningHours(),
        profile: emptyProfile(),
        status: "active",
        jobType: "",
        createdAt: stamp,
        updatedAt: stamp,
      };
      if (isDatabaseConfigured()) {
        const inserted = await insertStoreIfMissingDb(store);
        if (inserted) created += 1;
        else {
          const again = await getStoredPrevadzka(group.key);
          if (again) store = again;
        }
      } else {
        const blob = await readBlob();
        if (!blob.stores.some((s) => s.storeKey === store!.storeKey)) {
          blob.stores.push(store);
          created += 1;
          await writeBlob(blob);
        }
      }
      byKey.set(group.key, store);
    }
    for (const device of group.devices) {
      if (isDatabaseConfigured()) {
        await linkDeviceDb(store.id, device.uuid);
      } else {
        const blob = await readBlob();
        if (
          !blob.devices.some(
            (d) => d.prevadzkaId === store!.id && d.deviceUuid === device.uuid,
          )
        ) {
          blob.devices.push({ prevadzkaId: store.id, deviceUuid: device.uuid });
          await writeBlob(blob);
        }
      }
    }
  }

  const stores = await listStoredPrevadzky();
  if (isDatabaseConfigured() && created > 0) {
    await ensureSchema();
    const sql = getSql();
    await sql`
      INSERT INTO app_meta (key, value)
      VALUES ('prevadzky_profile_backfill', ${JSON.stringify({ stores: stores.length, created, at: stamp })})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  }
  return { stores: stores.length, created };
}

export async function updatePrevadzkaProfile(
  id: string,
  patch: Partial<PrevadzkaRecord> & { profile?: Partial<StoreProfile> },
  author: string,
) {
  const current = await getStoredPrevadzka(id);
  if (!current) return null;
  const next = applyStorePatch(current, patch);
  next.updatedAt = nowIso();
  const changes = describeStorePatch(current, next);
  if (isDatabaseConfigured()) {
    await upsertStoreDb(next);
  } else {
    const blob = await readBlob();
    blob.stores = blob.stores.map((s) => (s.id === next.id ? next : s));
    await writeBlob(blob);
  }
  if (changes.length) {
    await appendPrevadzkaHistory(
      next.id,
      author,
      `Profil: ${changes.join("; ")}`,
    );
  }
  await refreshPrevadzkaHoursCache(await listStoredPrevadzky());
  return next;
}

export async function addPrevadzkaDevice(prevadzkaId: string, deviceUuid: string) {
  const store = await getStoredPrevadzka(prevadzkaId);
  if (!store || !deviceUuid.trim()) return store;
  if (isDatabaseConfigured()) {
    await linkDeviceDb(store.id, deviceUuid.trim());
  } else {
    const blob = await readBlob();
    if (
      !blob.devices.some(
        (d) => d.prevadzkaId === store.id && d.deviceUuid === deviceUuid.trim(),
      )
    ) {
      blob.devices.push({ prevadzkaId: store.id, deviceUuid: deviceUuid.trim() });
      await writeBlob(blob);
    }
  }
  return store;
}

export async function listAllPendingSuggestions() {
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT * FROM profile_suggestions
      WHERE status = 'pending'
      ORDER BY created_at DESC
    `;
    return rows.map((r) => suggestionFromRow(r as Record<string, unknown>));
  }
  const blob = await readBlob();
  return blob.suggestions.filter((s) => s.status === "pending");
}

export async function listPendingPrevadzky() {
  return (await listStoredPrevadzky()).filter((s) => s.status === "pending");
}

export async function listProfileSuggestions(
  prevadzkaId: string,
  status: ProfileSuggestion["status"] | "all" = "pending",
) {
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const sql = getSql();
    const rows =
      status === "all"
        ? await sql`
            SELECT * FROM profile_suggestions
            WHERE prevadzka_id = ${prevadzkaId}
            ORDER BY created_at DESC
          `
        : await sql`
            SELECT * FROM profile_suggestions
            WHERE prevadzka_id = ${prevadzkaId} AND status = ${status}
            ORDER BY created_at DESC
          `;
    return rows.map((r) => suggestionFromRow(r as Record<string, unknown>));
  }
  const blob = await readBlob();
  return blob.suggestions.filter(
    (s) => s.prevadzkaId === prevadzkaId && (status === "all" || s.status === status),
  );
}

function suggestionFromRow(row: Record<string, unknown>): ProfileSuggestion {
  return {
    id: String(row.id),
    prevadzkaId: String(row.prevadzka_id ?? row.prevadzkaId ?? ""),
    actorId: String(row.actor_id ?? row.actorId ?? ""),
    actorName: String(row.actor_name ?? row.actorName ?? ""),
    patch: (row.patch && typeof row.patch === "object" ? row.patch : {}) as ProfileSuggestion["patch"],
    summary: String(row.summary ?? ""),
    status: (row.status as ProfileSuggestion["status"]) || "pending",
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? row.createdAt ?? nowIso()),
    resolvedAt: row.resolved_at
      ? row.resolved_at instanceof Date
        ? row.resolved_at.toISOString()
        : String(row.resolved_at)
      : "",
    resolvedBy: String(row.resolved_by ?? row.resolvedBy ?? ""),
  };
}

export async function createProfileSuggestion(input: {
  prevadzkaId: string;
  actorId: string;
  actorName: string;
  patch: ProfileSuggestion["patch"];
}) {
  const store = await getStoredPrevadzka(input.prevadzkaId);
  if (!store) return null;
  const row: ProfileSuggestion = {
    id: randomUUID(),
    prevadzkaId: store.id,
    actorId: input.actorId,
    actorName: input.actorName,
    patch: input.patch,
    summary: summarizeSuggestionPatch(input.patch),
    status: "pending",
    createdAt: nowIso(),
    resolvedAt: "",
    resolvedBy: "",
  };
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const sql = getSql();
    await sql`
      INSERT INTO profile_suggestions (
        id, prevadzka_id, actor_id, actor_name, patch, summary, status, created_at
      ) VALUES (
        ${row.id},
        ${row.prevadzkaId},
        ${row.actorId},
        ${row.actorName},
        ${JSON.stringify(row.patch)}::jsonb,
        ${row.summary},
        ${row.status},
        ${row.createdAt}::timestamptz
      )
    `;
  } else {
    const blob = await readBlob();
    blob.suggestions.unshift(row);
    await writeBlob(blob);
  }
  return row;
}

export async function resolveProfileSuggestion(
  suggestionId: string,
  action: "accepted" | "rejected",
  resolver: string,
) {
  const find = async (): Promise<ProfileSuggestion | null> => {
    if (isDatabaseConfigured()) {
      await ensureSchema();
      const sql = getSql();
      const rows = await sql`
        SELECT * FROM profile_suggestions WHERE id = ${suggestionId} LIMIT 1
      `;
      return rows[0]
        ? suggestionFromRow(rows[0] as Record<string, unknown>)
        : null;
    }
    return (await readBlob()).suggestions.find((s) => s.id === suggestionId) ?? null;
  };
  const suggestion = await find();
  if (!suggestion || suggestion.status !== "pending") return null;
  if (action === "accepted") {
    await updatePrevadzkaProfile(suggestion.prevadzkaId, suggestion.patch, resolver);
  }
  const resolvedAt = nowIso();
  if (isDatabaseConfigured()) {
    const sql = getSql();
    await sql`
      UPDATE profile_suggestions
      SET status = ${action}, resolved_at = ${resolvedAt}::timestamptz, resolved_by = ${resolver}
      WHERE id = ${suggestion.id}
    `;
  } else {
    const blob = await readBlob();
    blob.suggestions = blob.suggestions.map((s) =>
      s.id === suggestion.id
        ? { ...s, status: action, resolvedAt, resolvedBy: resolver }
        : s,
    );
    await writeBlob(blob);
  }
  if (action === "rejected") {
    await appendPrevadzkaHistory(
      suggestion.prevadzkaId,
      resolver,
      `Návrh zamietnutý: ${suggestion.summary}`,
    );
  }
  return { ...suggestion, status: action, resolvedAt, resolvedBy: resolver };
}

export async function appendPrevadzkaHistory(
  prevadzkaId: string,
  author: string,
  text: string,
) {
  const entry: ProfileHistoryEntry = {
    id: randomUUID(),
    prevadzkaId,
    at: nowIso(),
    author,
    text,
  };
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const sql = getSql();
    await sql`
      INSERT INTO prevadzka_history (id, prevadzka_id, at, author, text)
      VALUES (
        ${entry.id},
        ${entry.prevadzkaId},
        ${entry.at}::timestamptz,
        ${entry.author},
        ${entry.text}
      )
    `;
  } else {
    const blob = await readBlob();
    blob.history.unshift(entry);
    await writeBlob(blob);
  }
  return entry;
}

export async function listPrevadzkaHistory(prevadzkaId: string) {
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT * FROM prevadzka_history
      WHERE prevadzka_id = ${prevadzkaId}
      ORDER BY at DESC
      LIMIT 80
    `;
    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        prevadzkaId: String(row.prevadzka_id),
        at:
          row.at instanceof Date ? row.at.toISOString() : String(row.at),
        author: String(row.author ?? ""),
        text: String(row.text ?? ""),
      } satisfies ProfileHistoryEntry;
    });
  }
  return (await readBlob()).history.filter((h) => h.prevadzkaId === prevadzkaId);
}

function vykazFromRow(row: Record<string, unknown>): VykazEntry {
  return {
    id: String(row.id),
    prevadzkaId: String(row.prevadzka_id ?? row.prevadzkaId ?? ""),
    date:
      row.work_date instanceof Date
        ? row.work_date.toISOString()
        : String(row.work_date ?? row.date ?? nowIso()),
    type: (parseVykazType(String(row.work_type ?? row.type ?? "servis")) ||
      "servis") as VykazType,
    author: String(row.author ?? ""),
    description: String(row.description ?? ""),
    durationMin:
      row.duration_min == null && row.durationMin == null
        ? null
        : Number(row.duration_min ?? row.durationMin),
    ticketId: String(row.ticket_id ?? row.ticketId ?? ""),
    vyjazdId: String(row.vyjazd_id ?? row.vyjazdId ?? ""),
    source: "manual",
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? row.createdAt ?? nowIso()),
  };
}

export async function listManualVykaz(prevadzkaId: string): Promise<VykazEntry[]> {
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT * FROM vykaz_prace
      WHERE prevadzka_id = ${prevadzkaId}
      ORDER BY work_date DESC
    `;
    return rows.map((r) => vykazFromRow(r as Record<string, unknown>));
  }
  return (await readBlob()).vykaz.filter((e) => e.prevadzkaId === prevadzkaId);
}

export async function addManualVykaz(input: {
  prevadzkaId: string;
  date: string;
  type: VykazType;
  author: string;
  description: string;
  durationMin?: number | null;
  ticketId?: string;
  vyjazdId?: string;
}) {
  const store = await getStoredPrevadzka(input.prevadzkaId);
  if (!store) return null;
  const entry: VykazEntry = {
    id: randomUUID(),
    prevadzkaId: store.id,
    date: input.date || nowIso(),
    type: input.type,
    author: input.author.trim() || "Servis",
    description: input.description.trim(),
    durationMin: input.durationMin ?? null,
    ticketId: input.ticketId?.trim() || "",
    vyjazdId: input.vyjazdId?.trim() || "",
    source: "manual",
    createdAt: nowIso(),
  };
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const sql = getSql();
    await sql`
      INSERT INTO vykaz_prace (
        id, prevadzka_id, work_date, work_type, author, description,
        duration_min, ticket_id, vyjazd_id, created_at
      ) VALUES (
        ${entry.id},
        ${entry.prevadzkaId},
        ${entry.date}::timestamptz,
        ${entry.type},
        ${entry.author},
        ${entry.description},
        ${entry.durationMin},
        ${entry.ticketId},
        ${entry.vyjazdId},
        ${entry.createdAt}::timestamptz
      )
    `;
  } else {
    const blob = await readBlob();
    blob.vykaz.unshift(entry);
    await writeBlob(blob);
  }
  await appendPrevadzkaHistory(
    store.id,
    entry.author,
    `Výkaz: ${entry.type} — ${entry.description.slice(0, 80)}`,
  );
  return entry;
}

export function autoVykazForStore(
  store: PrevadzkaRecord,
  tickets: Ticket[],
  vyjazdy: Vyjazd[],
  deviceUuids: string[],
) {
  const uuidSet = new Set(deviceUuids);
  const storeTickets = tickets.filter((t) => {
    if (!ticketQualifiesForVykaz(t, vyjazdy)) return false;
    if (t.deviceUuid && uuidSet.has(t.deviceUuid)) return true;
    return ticketLooksLikeStore(t, store);
  });
  const storeVyjazdy = vyjazdy.filter((v) => {
    if (v.status !== "hotovy") return false;
    if (v.deviceUuid && uuidSet.has(v.deviceUuid)) return true;
    if ((v.stops ?? []).some((s) => s.deviceUuid && uuidSet.has(s.deviceUuid))) {
      return true;
    }
    return vyjazdLooksLikeStore(v, store);
  });
  return [
    ...storeTickets.map((t) => autoVykazFromTicket(t, store.id)),
    ...storeVyjazdy.map((v) => autoVykazFromVyjazd(v, store.id)),
  ];
}

function ticketLooksLikeStore(ticket: Ticket, store: PrevadzkaRecord) {
  const hay = ticket.customerName.toLowerCase();
  return Boolean(
    (store.code && hay.includes(store.code.toLowerCase())) ||
      (store.city && hay.includes(store.city.toLowerCase()) && store.chain && hay.includes(store.chain.toLowerCase())) ||
      (store.address && hay.includes(store.address.toLowerCase())),
  );
}

function vyjazdLooksLikeStore(vyjazd: Vyjazd, store: PrevadzkaRecord) {
  const hay = `${vyjazd.store} ${vyjazd.address} ${vyjazd.title}`.toLowerCase();
  return Boolean(
    (store.city && hay.includes(store.city.toLowerCase())) ||
      (store.address && store.address && hay.includes(store.address.toLowerCase())) ||
      (store.code && hay.includes(store.code.toLowerCase())),
  );
}

export async function listMergedVykaz(
  store: PrevadzkaRecord,
  tickets: Ticket[],
  vyjazdy: Vyjazd[],
  deviceUuids: string[],
  type?: string,
) {
  const manual = await listManualVykaz(store.id);
  const auto = autoVykazForStore(store, tickets, vyjazdy, deviceUuids);
  return filterVykaz(mergeVykazEntries(manual, auto), type);
}

export function countAutoVykaz(
  stores: PrevadzkaRecord[],
  tickets: Ticket[],
  vyjazdy: Vyjazd[],
  devicesByStore: Map<string, string[]>,
) {
  let count = 0;
  for (const store of stores) {
    count += autoVykazForStore(
      store,
      tickets,
      vyjazdy,
      devicesByStore.get(store.id) ?? [],
    ).length;
  }
  return count;
}

export function hoursCacheKeysForStore(store: PrevadzkaRecord, devices: ServiceDevice[]) {
  return [
    store.storeKey,
    store.code,
    store.city,
    ...devices.map((d) => prevadzkaKey(d)),
  ];
}

export function storeLabel(store: PrevadzkaRecord) {
  return (
    [store.code && `#${store.code}`, store.chain, store.city || store.name]
      .filter(Boolean)
      .join(" · ") || store.name || store.address || store.id
  );
}

export async function createManualPrevadzka(input: {
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
  status?: PrevadzkaRecord["status"];
  jobType?: PrevadzkaRecord["jobType"];
  author?: string;
}): Promise<PrevadzkaRecord> {
  const stamp = nowIso();
  const id = randomUUID();
  const chain = (input.chain ?? "").trim();
  const city = (input.city ?? "").trim();
  const address = (input.address ?? "").trim();
  const code = (input.code ?? "").trim();
  let storeKey = prevadzkaKey({ partner: chain, city, address });
  if (!storeKey) storeKey = code ? `code:${code.toLowerCase()}` : `manual:${id}`;
  const existing = await getStoredPrevadzka(storeKey);
  if (existing && existing.status !== "rejected") {
    storeKey = `manual:${id}`;
  }
  const store: PrevadzkaRecord = {
    id,
    storeKey,
    code,
    chain,
    storeType: (input.storeType ?? "").trim(),
    name: (input.name ?? "").trim() || city || chain || `Prevádzka ${code}`,
    city,
    address,
    gpsLat: (input.gpsLat ?? "").trim(),
    gpsLng: (input.gpsLng ?? "").trim(),
    phone: (input.phone ?? "").trim(),
    openingHours: input.openingHours
      ? hydrateOpeningHours(input.openingHours)
      : emptyOpeningHours(),
    profile: hydrateProfile({ ...emptyProfile(), ...input.profile }),
    status: input.status ?? "active",
    jobType: input.jobType ?? "",
    createdAt: stamp,
    updatedAt: stamp,
  };
  if (isDatabaseConfigured()) {
    await upsertStoreDb(store);
  } else {
    const blob = await readBlob();
    blob.stores.push(store);
    await writeBlob(blob);
  }
  await appendPrevadzkaHistory(
    store.id,
    input.author || "Servis",
    store.status === "pending"
      ? `Návrh novej prevádzky${store.jobType ? ` (${store.jobType})` : ""}`
      : `Nová prevádzka${store.jobType ? ` — ${store.jobType}` : ""}`,
  );
  await refreshPrevadzkaHoursCache(await listStoredPrevadzky());
  return store;
}

export async function setPrevadzkaStatus(
  id: string,
  status: PrevadzkaRecord["status"],
  author: string,
) {
  const current = await getStoredPrevadzka(id);
  if (!current) return null;
  const next = { ...current, status, updatedAt: nowIso() };
  if (isDatabaseConfigured()) {
    await upsertStoreDb(next);
  } else {
    const blob = await readBlob();
    blob.stores = blob.stores.map((s) => (s.id === next.id ? next : s));
    await writeBlob(blob);
  }
  await appendPrevadzkaHistory(
    next.id,
    author,
    status === "active"
      ? "Návrh prevádzky schválený"
      : status === "rejected"
        ? "Návrh prevádzky zamietnutý"
        : `Stav prevádzky: ${status}`,
  );
  await refreshPrevadzkaHoursCache(await listStoredPrevadzky());
  return next;
}

export async function maybeWriteCloseVykaz(ticket: Ticket) {
  if (ticket.status !== "hotove") return null;
  if (ticket.kind !== "montaz" && ticket.kind !== "spustenie") return null;
  const storeId = ticket.prevadzkaId?.trim();
  if (!storeId) return null;
  const existing = await listManualVykaz(storeId);
  if (existing.some((e) => e.ticketId === ticket.id)) return null;
  const { listMaterial } = await import("./material-store");
  const { formatMaterialSummary } = await import("./material");
  const items = await listMaterial({ ticketId: ticket.id });
  const materialLine = formatMaterialSummary(items);
  const notes = [...(ticket.notes ?? [])].reverse();
  const last = notes.find(
    (n) => n.text.trim() && !n.text.startsWith("Stav zmenený"),
  );
  const description = [
    last?.text.trim() || ticket.description || ticket.title,
    materialLine ? `Materiál: ${materialLine}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return addManualVykaz({
    prevadzkaId: storeId,
    date: ticket.updatedAt || ticket.createdAt,
    type: ticket.kind === "spustenie" ? "spustenie" : "montaz",
    author: ticket.assignedTo || "Servis",
    description,
    ticketId: ticket.id,
  });
}
