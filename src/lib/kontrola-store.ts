import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { ensureSchema, getSql, isDatabaseConfigured } from "./db";
import {
  parseAuditAutor,
  type AppError,
  type AuditAutor,
  type AuditEntry,
  type AuditTyp,
  type BotNavrh,
  type BotRequest,
  type NavrhKind,
  type SyncRun,
} from "./kontrola";

type FileBlob = {
  audit: AuditEntry[];
  syncRuns: SyncRun[];
  errors: AppError[];
  requests: BotRequest[];
  navrhy: BotNavrh[];
};

function dataFile() {
  const dir =
    process.env.SERVISLIST_DATA_DIR?.trim() ||
    path.join(process.cwd(), "data");
  return path.join(dir, "kontrola.json");
}

function nowIso() {
  return new Date().toISOString();
}

function emptyBlob(): FileBlob {
  return { audit: [], syncRuns: [], errors: [], requests: [], navrhy: [] };
}

let fileCache: FileBlob | null = null;
let fileCachePath = "";

async function readBlob(): Promise<FileBlob> {
  const file = dataFile();
  if (fileCache && fileCachePath === file) return fileCache;
  fileCachePath = file;
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8")) as FileBlob;
    fileCache = {
      audit: Array.isArray(parsed.audit) ? parsed.audit : [],
      syncRuns: Array.isArray(parsed.syncRuns) ? parsed.syncRuns : [],
      errors: Array.isArray(parsed.errors) ? parsed.errors : [],
      requests: Array.isArray(parsed.requests) ? parsed.requests : [],
      navrhy: Array.isArray(parsed.navrhy) ? parsed.navrhy : [],
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

async function ensure() {
  if (isDatabaseConfigured()) await ensureSchema();
}

function hydrateAudit(raw: Record<string, unknown>): AuditEntry {
  let diff: Record<string, unknown> | null = null;
  const diffRaw = raw.diff;
  if (diffRaw && typeof diffRaw === "object" && !Array.isArray(diffRaw)) {
    diff = diffRaw as Record<string, unknown>;
  } else if (typeof diffRaw === "string" && diffRaw.trim()) {
    try {
      diff = JSON.parse(diffRaw) as Record<string, unknown>;
    } catch {
      diff = null;
    }
  }
  return {
    id: String(raw.id ?? ""),
    at:
      raw.at instanceof Date
        ? raw.at.toISOString()
        : String(raw.at ?? nowIso()),
    autor: parseAuditAutor(String(raw.autor ?? "martin")),
    typ: (String(raw.typ ?? "nastavenia") as AuditTyp) || "nastavenia",
    akcia: String(raw.akcia ?? ""),
    entityId: String(raw.entity_id ?? raw.entityId ?? ""),
    popis: String(raw.popis ?? ""),
    diff,
    requestId: String(raw.request_id ?? raw.requestId ?? ""),
  };
}

function hydrateSync(raw: Record<string, unknown>): SyncRun {
  return {
    id: String(raw.id ?? ""),
    startedAt:
      raw.started_at instanceof Date
        ? raw.started_at.toISOString()
        : String(raw.started_at ?? raw.startedAt ?? nowIso()),
    finishedAt:
      raw.finished_at instanceof Date
        ? raw.finished_at.toISOString()
        : String(raw.finished_at ?? raw.finishedAt ?? nowIso()),
    ok: Boolean(raw.ok),
    devicesOnline: Number(raw.devices_online ?? raw.devicesOnline ?? 0) || 0,
    devicesOffline: Number(raw.devices_offline ?? raw.devicesOffline ?? 0) || 0,
    devicesLongOffline:
      Number(raw.devices_long_offline ?? raw.devicesLongOffline ?? 0) || 0,
    devicesTest: Number(raw.devices_test ?? raw.devicesTest ?? 0) || 0,
    ticketsOpened: Number(raw.tickets_opened ?? raw.ticketsOpened ?? 0) || 0,
    ticketsClosed: Number(raw.tickets_closed ?? raw.ticketsClosed ?? 0) || 0,
    error: String(raw.error ?? ""),
  };
}

function hydrateError(raw: Record<string, unknown>): AppError {
  const zdrojRaw = String(raw.zdroj ?? "api");
  const zdroj: AppError["zdroj"] =
    zdrojRaw === "sync" || zdrojRaw === "ui" ? zdrojRaw : "api";
  return {
    id: String(raw.id ?? ""),
    at:
      raw.at instanceof Date
        ? raw.at.toISOString()
        : String(raw.at ?? nowIso()),
    zdroj,
    route: String(raw.route ?? ""),
    status: Number(raw.status ?? 0) || 0,
    bot: String(raw.bot ?? ""),
    message: String(raw.message ?? ""),
    stack: String(raw.stack ?? ""),
  };
}

function hydrateRequest(raw: Record<string, unknown>): BotRequest {
  return {
    id: String(raw.id ?? ""),
    at:
      raw.at instanceof Date
        ? raw.at.toISOString()
        : String(raw.at ?? nowIso()),
    bot: String(raw.bot ?? ""),
    method: String(raw.method ?? ""),
    path: String(raw.path ?? ""),
    status: Number(raw.status ?? 0) || 0,
    ms: Number(raw.ms ?? 0) || 0,
  };
}

function hydrateNavrh(raw: Record<string, unknown>): BotNavrh {
  let payload: Record<string, unknown> = {};
  const payloadRaw = raw.payload;
  if (payloadRaw && typeof payloadRaw === "object" && !Array.isArray(payloadRaw)) {
    payload = payloadRaw as Record<string, unknown>;
  } else if (typeof payloadRaw === "string") {
    try {
      payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    } catch {
      payload = {};
    }
  }
  const stavRaw = String(raw.stav ?? "cakajuci");
  return {
    id: String(raw.id ?? ""),
    kind: String(raw.kind ?? "ticket") === "vyjazd" ? "vyjazd" : "ticket",
    payload,
    summary: String(raw.summary ?? ""),
    actorId: String(raw.actor_id ?? raw.actorId ?? ""),
    actorName: String(raw.actor_name ?? raw.actorName ?? ""),
    stav:
      stavRaw === "schvaleny" || stavRaw === "zamietnuty"
        ? stavRaw
        : "cakajuci",
    createdAt:
      raw.created_at instanceof Date
        ? raw.created_at.toISOString()
        : String(raw.created_at ?? raw.createdAt ?? nowIso()),
    resolvedAt: String(raw.resolved_at ?? raw.resolvedAt ?? ""),
    resolvedBy: String(raw.resolved_by ?? raw.resolvedBy ?? ""),
  };
}

export async function writeAudit(input: {
  autor?: string;
  typ: AuditTyp;
  akcia: string;
  entityId?: string;
  popis: string;
  diff?: Record<string, unknown> | null;
  requestId?: string;
}) {
  try {
    await ensure();
    const row: AuditEntry = {
      id: randomUUID(),
      at: nowIso(),
      autor: parseAuditAutor(input.autor),
      typ: input.typ,
      akcia: input.akcia,
      entityId: input.entityId ?? "",
      popis: input.popis,
      diff: input.diff ?? null,
      requestId: input.requestId ?? "",
    };
    if (isDatabaseConfigured()) {
      const sql = getSql();
      await sql`
        INSERT INTO audit_log (
          id, at, autor, typ, akcia, entity_id, popis, diff, request_id
        ) VALUES (
          ${row.id}, ${row.at}::timestamptz, ${row.autor}, ${row.typ},
          ${row.akcia}, ${row.entityId}, ${row.popis},
          ${JSON.stringify(row.diff)}::jsonb, ${row.requestId}
        )
      `;
    } else {
      const blob = await readBlob();
      blob.audit.unshift(row);
      blob.audit = blob.audit.slice(0, 4000);
      await writeBlob(blob);
    }
    return row;
  } catch {
    return null;
  }
}

export async function listAudit(opts?: {
  q?: string;
  autor?: AuditAutor | "";
  typ?: AuditTyp | "";
  akcia?: string;
  from?: string;
  limit?: number;
}): Promise<AuditEntry[]> {
  await ensure();
  let items: AuditEntry[];
  if (isDatabaseConfigured()) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM audit_log ORDER BY at DESC LIMIT 2000`;
    items = rows.map((r) => hydrateAudit(r as Record<string, unknown>));
  } else {
    items = [...(await readBlob()).audit];
  }
  if (opts?.autor) items = items.filter((r) => r.autor === opts.autor);
  if (opts?.typ) items = items.filter((r) => r.typ === opts.typ);
  if (opts?.akcia) items = items.filter((r) => r.akcia === opts.akcia);
  if (opts?.from) {
    const from = new Date(opts.from).getTime();
    items = items.filter((r) => new Date(r.at).getTime() >= from);
  }
  if (opts?.q?.trim()) {
    const q = opts.q.trim().toLowerCase();
    items = items.filter((r) =>
      `${r.popis} ${r.entityId} ${r.akcia} ${r.typ}`.toLowerCase().includes(q),
    );
  }
  return items.slice(0, opts?.limit ?? 200);
}

export async function recordSyncRun(input: Omit<SyncRun, "id">) {
  try {
    await ensure();
    const row: SyncRun = { ...input, id: randomUUID() };
    if (isDatabaseConfigured()) {
      const sql = getSql();
      await sql`
        INSERT INTO sync_runs (
          id, started_at, finished_at, ok, devices_online, devices_offline,
          devices_long_offline, devices_test, tickets_opened, tickets_closed, error
        ) VALUES (
          ${row.id}, ${row.startedAt}::timestamptz, ${row.finishedAt}::timestamptz,
          ${row.ok}, ${row.devicesOnline}, ${row.devicesOffline},
          ${row.devicesLongOffline}, ${row.devicesTest}, ${row.ticketsOpened},
          ${row.ticketsClosed}, ${row.error}
        )
      `;
    } else {
      const blob = await readBlob();
      blob.syncRuns.unshift(row);
      blob.syncRuns = blob.syncRuns.slice(0, 400);
      await writeBlob(blob);
    }
    await writeAudit({
      autor: "automatika",
      typ: "nastavenia",
      akcia: row.ok ? "sync" : "sync_error",
      popis: row.ok
        ? `Balena sync · online ${row.devicesOnline} · offline ${row.devicesOffline}`
        : `Balena sync zlyhal: ${row.error}`,
    });
    return row;
  } catch {
    return null;
  }
}

export async function lastSyncRun(): Promise<SyncRun | null> {
  await ensure();
  if (isDatabaseConfigured()) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM sync_runs ORDER BY finished_at DESC LIMIT 1`;
    return rows[0] ? hydrateSync(rows[0] as Record<string, unknown>) : null;
  }
  return (await readBlob()).syncRuns[0] ?? null;
}

export async function captureAppError(input: {
  zdroj: AppError["zdroj"];
  route?: string;
  status?: number;
  bot?: string;
  message: string;
  stack?: string;
}) {
  try {
    await ensure();
    const row: AppError = {
      id: randomUUID(),
      at: nowIso(),
      zdroj: input.zdroj,
      route: input.route ?? "",
      status: input.status ?? 0,
      bot: input.bot ?? "",
      message: input.message.slice(0, 500),
      stack: (input.stack ?? "").slice(0, 2000),
    };
    if (isDatabaseConfigured()) {
      const sql = getSql();
      await sql`
        INSERT INTO app_errors (id, at, zdroj, route, status, bot, message, stack)
        VALUES (
          ${row.id}, ${row.at}::timestamptz, ${row.zdroj}, ${row.route},
          ${row.status}, ${row.bot}, ${row.message}, ${row.stack}
        )
      `;
    } else {
      const blob = await readBlob();
      blob.errors.unshift(row);
      blob.errors = blob.errors.slice(0, 1000);
      await writeBlob(blob);
    }
    return row;
  } catch {
    return null;
  }
}

export async function listAppErrors(sinceIso?: string): Promise<AppError[]> {
  await ensure();
  const since = sinceIso ? new Date(sinceIso).getTime() : 0;
  let items: AppError[];
  if (isDatabaseConfigured()) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM app_errors ORDER BY at DESC LIMIT 500`;
    items = rows.map((r) => hydrateError(r as Record<string, unknown>));
  } else {
    items = (await readBlob()).errors;
  }
  return since ? items.filter((e) => new Date(e.at).getTime() >= since) : items;
}

export async function logBotRequest(input: Omit<BotRequest, "id" | "at">) {
  try {
    await ensure();
    const row: BotRequest = { ...input, id: randomUUID(), at: nowIso() };
    if (isDatabaseConfigured()) {
      const sql = getSql();
      await sql`
        INSERT INTO bot_requests (id, at, bot, method, path, status, ms)
        VALUES (
          ${row.id}, ${row.at}::timestamptz, ${row.bot}, ${row.method},
          ${row.path}, ${row.status}, ${row.ms}
        )
      `;
    } else {
      const blob = await readBlob();
      blob.requests.unshift(row);
      blob.requests = blob.requests.slice(0, 4000);
      await writeBlob(blob);
    }
    return row;
  } catch {
    return null;
  }
}

export async function listBotRequests(sinceIso?: string): Promise<BotRequest[]> {
  await ensure();
  const since = sinceIso ? new Date(sinceIso).getTime() : 0;
  let items: BotRequest[];
  if (isDatabaseConfigured()) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM bot_requests ORDER BY at DESC LIMIT 2000`;
    items = rows.map((r) => hydrateRequest(r as Record<string, unknown>));
  } else {
    items = (await readBlob()).requests;
  }
  return since ? items.filter((e) => new Date(e.at).getTime() >= since) : items;
}

export async function createNavrh(input: {
  kind: NavrhKind;
  payload: Record<string, unknown>;
  summary: string;
  actorId: string;
  actorName: string;
}): Promise<BotNavrh> {
  await ensure();
  const row: BotNavrh = {
    id: randomUUID(),
    kind: input.kind,
    payload: input.payload,
    summary: input.summary,
    actorId: input.actorId,
    actorName: input.actorName,
    stav: "cakajuci",
    createdAt: nowIso(),
    resolvedAt: "",
    resolvedBy: "",
  };
  if (isDatabaseConfigured()) {
    const sql = getSql();
    await sql`
      INSERT INTO bot_navrhy (
        id, kind, payload, summary, actor_id, actor_name, stav, created_at
      ) VALUES (
        ${row.id}, ${row.kind}, ${JSON.stringify(row.payload)}::jsonb,
        ${row.summary}, ${row.actorId}, ${row.actorName}, ${row.stav},
        ${row.createdAt}::timestamptz
      )
    `;
  } else {
    const blob = await readBlob();
    blob.navrhy.unshift(row);
    await writeBlob(blob);
  }
  await writeAudit({
    autor: input.actorName,
    typ: input.kind === "vyjazd" ? "vyjazd" : "ticket",
    akcia: "navrh",
    entityId: row.id,
    popis: row.summary,
  });
  return row;
}

export async function listNavrhy(opts?: { stav?: BotNavrh["stav"] }) {
  await ensure();
  let items: BotNavrh[];
  if (isDatabaseConfigured()) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM bot_navrhy ORDER BY created_at DESC`;
    items = rows.map((r) => hydrateNavrh(r as Record<string, unknown>));
  } else {
    items = [...(await readBlob()).navrhy];
  }
  if (opts?.stav) items = items.filter((n) => n.stav === opts.stav);
  return items;
}

export async function getNavrh(id: string) {
  return (await listNavrhy()).find((n) => n.id === id) ?? null;
}

export async function resolveNavrh(
  id: string,
  action: "accepted" | "rejected",
  author: string,
) {
  const current = await getNavrh(id);
  if (!current || current.stav !== "cakajuci") return current;
  const next: BotNavrh = {
    ...current,
    stav: action === "accepted" ? "schvaleny" : "zamietnuty",
    resolvedAt: nowIso(),
    resolvedBy: author,
  };
  if (isDatabaseConfigured()) {
    const sql = getSql();
    await sql`
      UPDATE bot_navrhy SET
        stav = ${next.stav},
        resolved_at = ${next.resolvedAt}::timestamptz,
        resolved_by = ${next.resolvedBy}
      WHERE id = ${id}
    `;
  } else {
    const blob = await readBlob();
    blob.navrhy = blob.navrhy.map((n) => (n.id === id ? next : n));
    await writeBlob(blob);
  }
  await writeAudit({
    autor: author,
    typ: current.kind === "vyjazd" ? "vyjazd" : "ticket",
    akcia: action === "accepted" ? "schvalil" : "zamietol",
    entityId: id,
    popis: `${action === "accepted" ? "Schválený" : "Zamietnutý"} návrh: ${current.summary}`,
  });
  return next;
}

export async function pingDatabase() {
  const started = Date.now();
  if (!isDatabaseConfigured()) {
    return { ok: true, ms: 0, label: "súbor" };
  }
  try {
    await ensure();
    const sql = getSql();
    await sql`SELECT 1`;
    return { ok: true, ms: Date.now() - started, label: "Neon" };
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - started,
      label: "Neon",
      error: error instanceof Error ? error.message : "DB chyba",
    };
  }
}

export async function countPendingApprovals() {
  const { listPendingPrevadzky, listAllPendingSuggestions } = await import(
    "./prevadzka-store"
  );
  const { listDodacieListy } = await import("./sklad-store");
  const [stores, suggestions, prijmy, navrhy] = await Promise.all([
    listPendingPrevadzky(),
    listAllPendingSuggestions(),
    listDodacieListy({ stav: "cakajuci" }),
    listNavrhy({ stav: "cakajuci" }),
  ]);
  return stores.length + suggestions.length + prijmy.length + navrhy.length;
}
