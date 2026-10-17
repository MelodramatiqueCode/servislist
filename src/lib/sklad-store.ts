import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { ensureSchema, getSql, isDatabaseConfigured } from "./db";
import { listMaterial } from "./material-store";
import { listTickets } from "./store";
import {
  CATALOG_SEED,
  normalizeName,
  parseDlStav,
  parseJednotka,
  parseKategoria,
  parsePohybTyp,
  reservedQty,
  stockFromPohyby,
  type DlStav,
  type DodaciList,
  type DodaciListRiadok,
  type PohybTyp,
  type SkladKategoria,
  type SkladPohyb,
  type SkladPolozka,
} from "./sklad";
import { dlFileViewUrl, inspectDlFile, type DlFileBytes } from "./sklad-upload";

type FileBlob = {
  polozky: SkladPolozka[];
  listy: DodaciList[];
  pohyby: SkladPohyb[];
  files: Record<string, { name: string; mime: string; data: string }>;
};

function dataFile() {
  const dir =
    process.env.SERVISLIST_DATA_DIR?.trim() ||
    path.join(process.cwd(), "data");
  return path.join(dir, "sklad.json");
}

function nowIso() {
  return new Date().toISOString();
}

function emptyBlob(): FileBlob {
  return { polozky: [], listy: [], pohyby: [], files: {} };
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
      polozky: Array.isArray(parsed.polozky) ? parsed.polozky : [],
      listy: Array.isArray(parsed.listy) ? parsed.listy : [],
      pohyby: Array.isArray(parsed.pohyby) ? parsed.pohyby : [],
      files: parsed.files && typeof parsed.files === "object" ? parsed.files : {},
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

function hydratePolozka(raw: Record<string, unknown>): SkladPolozka {
  return {
    id: String(raw.id ?? ""),
    kod: String(raw.kod ?? raw.code ?? ""),
    nazov: String(raw.nazov ?? raw.name ?? ""),
    kategoria: parseKategoria(String(raw.kategoria ?? "")) ?? "Iné",
    jednotka: parseJednotka(String(raw.jednotka ?? "ks")),
    minStav: Number(raw.min_stav ?? raw.minStav ?? 0) || 0,
    poznamka: String(raw.poznamka ?? raw.note ?? ""),
    archivedAt: raw.archived_at
      ? raw.archived_at instanceof Date
        ? raw.archived_at.toISOString()
        : String(raw.archived_at)
      : String(raw.archivedAt ?? ""),
  };
}

function hydrateDl(raw: Record<string, unknown>): DodaciList {
  const riadkyRaw = raw.riadky ?? raw.lines;
  const riadky = Array.isArray(riadkyRaw)
    ? (riadkyRaw as Record<string, unknown>[]).map((row) => ({
        polozkaId: String(row.polozkaId ?? row.polozka_id ?? ""),
        kod: String(row.kod ?? ""),
        nazov: String(row.nazov ?? row.item ?? ""),
        kategoria: parseKategoria(String(row.kategoria ?? "")) ?? "Iné",
        jednotka: parseJednotka(String(row.jednotka ?? "ks")),
        minStav: Number(row.minStav ?? row.min_stav ?? 0) || 0,
        mnozstvo: Number(row.mnozstvo ?? row.quantity ?? 0) || 0,
        poznamka: String(row.poznamka ?? ""),
        nova: Boolean(row.nova ?? row.isNew),
      }))
    : [];
  return {
    id: String(raw.id ?? ""),
    dodavatel: String(raw.dodavatel ?? ""),
    cisloDl: String(raw.cislo_dl ?? raw.cisloDl ?? ""),
    datum: String(raw.datum ?? raw.date ?? ""),
    suborUrl: String(raw.subor_url ?? raw.suborUrl ?? ""),
    suborName: String(raw.subor_name ?? raw.suborName ?? ""),
    suborMime: String(raw.subor_mime ?? raw.suborMime ?? ""),
    stav: parseDlStav(String(raw.stav ?? "cakajuci")) ?? "cakajuci",
    zdroj: String(raw.zdroj ?? "web") === "servis_bot" ? "servis_bot" : "web",
    vytvoril: String(raw.vytvoril ?? ""),
    schvalil: String(raw.schvalil ?? ""),
    schvaleneAt: String(raw.schvalene_at ?? raw.schvaleneAt ?? ""),
    riadky,
    createdAt:
      raw.created_at instanceof Date
        ? raw.created_at.toISOString()
        : String(raw.created_at ?? raw.createdAt ?? nowIso()),
  };
}

function hydratePohyb(raw: Record<string, unknown>): SkladPohyb {
  return {
    id: String(raw.id ?? ""),
    polozkaId: String(raw.polozka_id ?? raw.polozkaId ?? ""),
    typ: parsePohybTyp(String(raw.typ ?? "korekcia")) ?? "korekcia",
    mnozstvo: Number(raw.mnozstvo ?? 0) || 0,
    dodaciListId: String(raw.dodaci_list_id ?? raw.dodaciListId ?? ""),
    ticketId: String(raw.ticket_id ?? raw.ticketId ?? ""),
    prevadzkaId: String(raw.prevadzka_id ?? raw.prevadzkaId ?? ""),
    ticketMaterialId: String(raw.ticket_material_id ?? raw.ticketMaterialId ?? ""),
    datum:
      raw.datum instanceof Date
        ? raw.datum.toISOString()
        : String(raw.datum ?? nowIso()),
    kto: String(raw.kto ?? ""),
  };
}

export async function ensureSkladCatalog() {
  const existing = await listPolozky({ includeArchived: true });
  if (existing.length > 0) return existing;
  const created: SkladPolozka[] = [];
  for (const row of CATALOG_SEED) {
    created.push(await createPolozka(row));
  }
  return created;
}

export async function listPolozky(opts?: {
  q?: string;
  kategoria?: SkladKategoria | "";
  includeArchived?: boolean;
}): Promise<SkladPolozka[]> {
  await ensureSchemaIfNeeded();
  let items: SkladPolozka[];
  if (isDatabaseConfigured()) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM sklad_polozky ORDER BY nazov ASC`;
    items = rows.map((r) => hydratePolozka(r as Record<string, unknown>));
  } else {
    items = (await readBlob()).polozky;
  }
  if (!opts?.includeArchived) items = items.filter((p) => !p.archivedAt);
  if (opts?.kategoria) {
    items = items.filter((p) => p.kategoria === opts.kategoria);
  }
  if (opts?.q?.trim()) {
    const q = normalizeName(opts.q);
    items = items.filter((p) =>
      normalizeName(`${p.nazov} ${p.kod} ${p.poznamka}`).includes(q),
    );
  }
  return items;
}

export async function getPolozka(id: string) {
  return (
    (await listPolozky({ includeArchived: true })).find((p) => p.id === id) ??
    null
  );
}

export async function findPolozkaByNameOrCode(raw: string) {
  const q = normalizeName(raw);
  if (!q) return null;
  const all = await listPolozky();
  return (
    all.find((p) => normalizeName(p.kod) === q) ||
    all.find((p) => normalizeName(p.nazov) === q) ||
    all.find((p) => normalizeName(p.nazov).includes(q) || q.includes(normalizeName(p.nazov))) ||
    null
  );
}

export async function createPolozka(input: {
  kod: string;
  nazov: string;
  kategoria?: string;
  jednotka?: string;
  minStav?: number;
  poznamka?: string;
}): Promise<SkladPolozka> {
  await ensureSchemaIfNeeded();
  const row: SkladPolozka = {
    id: randomUUID(),
    kod: input.kod.trim().toUpperCase(),
    nazov: input.nazov.trim(),
    kategoria: parseKategoria(input.kategoria) ?? "Iné",
    jednotka: parseJednotka(input.jednotka),
    minStav: Number(input.minStav ?? 0) || 0,
    poznamka: input.poznamka?.trim() || "",
    archivedAt: "",
  };
  if (isDatabaseConfigured()) {
    const sql = getSql();
    await sql`
      INSERT INTO sklad_polozky (
        id, kod, nazov, kategoria, jednotka, min_stav, poznamka, archived_at
      ) VALUES (
        ${row.id}, ${row.kod}, ${row.nazov}, ${row.kategoria}, ${row.jednotka},
        ${row.minStav}, ${row.poznamka}, NULL
      )
    `;
  } else {
    const blob = await readBlob();
    blob.polozky.push(row);
    await writeBlob(blob);
  }
  return row;
}

export async function updatePolozka(
  id: string,
  patch: Partial<Pick<SkladPolozka, "kod" | "nazov" | "kategoria" | "jednotka" | "minStav" | "poznamka">>,
) {
  const current = await getPolozka(id);
  if (!current) return null;
  const next: SkladPolozka = {
    ...current,
    kod: patch.kod?.trim().toUpperCase() || current.kod,
    nazov: patch.nazov?.trim() || current.nazov,
    kategoria: patch.kategoria ?? current.kategoria,
    jednotka: patch.jednotka ?? current.jednotka,
    minStav: patch.minStav ?? current.minStav,
    poznamka: patch.poznamka ?? current.poznamka,
  };
  if (isDatabaseConfigured()) {
    const sql = getSql();
    await sql`
      UPDATE sklad_polozky SET
        kod = ${next.kod},
        nazov = ${next.nazov},
        kategoria = ${next.kategoria},
        jednotka = ${next.jednotka},
        min_stav = ${next.minStav},
        poznamka = ${next.poznamka}
      WHERE id = ${id}
    `;
  } else {
    const blob = await readBlob();
    blob.polozky = blob.polozky.map((p) => (p.id === id ? next : p));
    await writeBlob(blob);
  }
  return next;
}

export async function listPohyby(opts?: {
  polozkaId?: string;
  typ?: PohybTyp;
  prevadzkaId?: string;
  from?: string;
  to?: string;
}): Promise<SkladPohyb[]> {
  await ensureSchemaIfNeeded();
  let items: SkladPohyb[];
  if (isDatabaseConfigured()) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM sklad_pohyby ORDER BY datum DESC`;
    items = rows.map((r) => hydratePohyb(r as Record<string, unknown>));
  } else {
    items = [...(await readBlob()).pohyby].sort(
      (a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime(),
    );
  }
  if (opts?.polozkaId) items = items.filter((p) => p.polozkaId === opts.polozkaId);
  if (opts?.typ) items = items.filter((p) => p.typ === opts.typ);
  if (opts?.prevadzkaId) {
    items = items.filter((p) => p.prevadzkaId === opts.prevadzkaId);
  }
  if (opts?.from) {
    const from = new Date(opts.from).getTime();
    items = items.filter((p) => new Date(p.datum).getTime() >= from);
  }
  if (opts?.to) {
    const to = new Date(opts.to).getTime();
    items = items.filter((p) => new Date(p.datum).getTime() <= to);
  }
  return items;
}

export async function addPohyb(input: {
  polozkaId: string;
  typ: PohybTyp;
  mnozstvo: number;
  dodaciListId?: string;
  ticketId?: string;
  prevadzkaId?: string;
  ticketMaterialId?: string;
  datum?: string;
  kto?: string;
}): Promise<SkladPohyb | null> {
  await ensureSchemaIfNeeded();
  if (input.ticketMaterialId) {
    const existing = (await listPohyby()).find(
      (p) => p.ticketMaterialId === input.ticketMaterialId,
    );
    if (existing) return existing;
  }
  const signed =
    input.typ === "vydaj"
      ? -Math.abs(input.mnozstvo)
      : input.typ === "prijem"
        ? Math.abs(input.mnozstvo)
        : input.mnozstvo;
  const row: SkladPohyb = {
    id: randomUUID(),
    polozkaId: input.polozkaId,
    typ: input.typ,
    mnozstvo: signed,
    dodaciListId: input.dodaciListId ?? "",
    ticketId: input.ticketId ?? "",
    prevadzkaId: input.prevadzkaId ?? "",
    ticketMaterialId: input.ticketMaterialId ?? "",
    datum: input.datum || nowIso(),
    kto: input.kto?.trim() || "Servis",
  };
  if (isDatabaseConfigured()) {
    const sql = getSql();
    try {
      await sql`
        INSERT INTO sklad_pohyby (
          id, polozka_id, typ, mnozstvo, dodaci_list_id, ticket_id,
          prevadzka_id, ticket_material_id, datum, kto
        ) VALUES (
          ${row.id}, ${row.polozkaId}, ${row.typ}, ${row.mnozstvo},
          ${row.dodaciListId || null}, ${row.ticketId || null},
          ${row.prevadzkaId || null}, ${row.ticketMaterialId || null},
          ${row.datum}::timestamptz, ${row.kto}
        )
      `;
    } catch (error) {
      if (row.ticketMaterialId && String(error).includes("duplicate")) {
        return (
          (await listPohyby()).find(
            (p) => p.ticketMaterialId === row.ticketMaterialId,
          ) ?? row
        );
      }
      throw error;
    }
  } else {
    const blob = await readBlob();
    blob.pohyby.push(row);
    await writeBlob(blob);
  }
  try {
    const { writeAudit } = await import("./kontrola-store");
    await writeAudit({
      autor: row.kto,
      typ: "sklad",
      akcia: row.typ,
      entityId: row.polozkaId,
      popis: `${row.typ} ${row.mnozstvo > 0 ? `+${row.mnozstvo}` : row.mnozstvo}`,
    });
  } catch {
    /* audit must never break a mutation */
  }
  return row;
}

export async function listDodacieListy(opts?: { stav?: DlStav }) {
  await ensureSchemaIfNeeded();
  let items: DodaciList[];
  if (isDatabaseConfigured()) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM dodacie_listy ORDER BY created_at DESC`;
    items = rows.map((r) => {
      const list = hydrateDl(r as Record<string, unknown>);
      const raw = (r as { riadky?: unknown }).riadky;
      if (typeof raw === "string") {
        try {
          return hydrateDl({ ...(r as Record<string, unknown>), riadky: JSON.parse(raw) });
        } catch {
          return list;
        }
      }
      return list;
    });
  } else {
    items = [...(await readBlob()).listy].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
  if (opts?.stav) items = items.filter((d) => d.stav === opts.stav);
  return items;
}

export async function getDodaciList(id: string) {
  return (await listDodacieListy()).find((d) => d.id === id) ?? null;
}

export async function createDodaciList(input: {
  dodavatel: string;
  cisloDl: string;
  datum: string;
  zdroj?: "web" | "servis_bot";
  vytvoril: string;
  riadky: DodaciListRiadok[];
  file?: DlFileBytes;
}): Promise<DodaciList> {
  await ensureSchemaIfNeeded();
  const id = randomUUID();
  let suborUrl = "";
  let suborName = "";
  let suborMime = "";
  let fileBytes: Buffer | null = null;
  if (input.file) {
    const file = inspectDlFile(input.file);
    suborName = file.name;
    suborMime = file.mime;
    suborUrl = dlFileViewUrl(id);
    fileBytes = file.bytes;
    if (!isDatabaseConfigured()) {
      const blob = await readBlob();
      blob.files[id] = {
        name: suborName,
        mime: suborMime,
        data: fileBytes.toString("base64"),
      };
      await writeBlob(blob);
    }
  }
  const row: DodaciList = {
    id,
    dodavatel: input.dodavatel.trim(),
    cisloDl: input.cisloDl.trim(),
    datum: input.datum || nowIso(),
    suborUrl,
    suborName,
    suborMime,
    stav: "cakajuci",
    zdroj: input.zdroj ?? "web",
    vytvoril: input.vytvoril,
    schvalil: "",
    schvaleneAt: "",
    riadky: input.riadky.filter((r) => r.nazov.trim() && r.mnozstvo > 0),
    createdAt: nowIso(),
  };
  if (isDatabaseConfigured()) {
    const sql = getSql();
    await sql`
      INSERT INTO dodacie_listy (
        id, dodavatel, cislo_dl, datum, subor_url, subor_name, subor_mime,
        subor_bytes, stav, zdroj, vytvoril, schvalil, schvalene_at, riadky, created_at
      ) VALUES (
        ${row.id}, ${row.dodavatel}, ${row.cisloDl}, ${row.datum}::timestamptz,
        ${row.suborUrl}, ${row.suborName}, ${row.suborMime},
        ${fileBytes},
        ${row.stav}, ${row.zdroj}, ${row.vytvoril}, '', NULL,
        ${JSON.stringify(row.riadky)}::jsonb, ${row.createdAt}::timestamptz
      )
    `;
  } else {
    const blob = await readBlob();
    blob.listy.unshift(row);
    await writeBlob(blob);
  }
  try {
    const { writeAudit } = await import("./kontrola-store");
    await writeAudit({
      autor: row.vytvoril,
      typ: "sklad",
      akcia: "navrh",
      entityId: row.id,
      popis: `Príjem ${row.cisloDl || "dodací list"} · ${row.riadky.length} položiek · čaká na schválenie`,
    });
  } catch {
    /* audit must never break a mutation */
  }
  return row;
}

/**
 * Príloha ostáva natrvalo. Nesmie sa mazať pri schválení, zamietnutí
 * ani pri ďalšom uploade — druhý súbor sa neprepíše.
 */
export async function attachDodaciListFile(
  id: string,
  file: DlFileBytes,
): Promise<
  | { ok: true; list: DodaciList }
  | { ok: false; reason: "not_found" | "not_pending" | "exists"; list: DodaciList | null }
> {
  const current = await getDodaciList(id);
  if (!current) return { ok: false, reason: "not_found", list: null };
  if (current.stav !== "cakajuci") {
    return { ok: false, reason: "not_pending", list: current };
  }
  if (current.suborUrl || current.suborName || (await getDlFile(id))) {
    return { ok: false, reason: "exists", list: current };
  }
  const checked = inspectDlFile(file);
  const next: DodaciList = {
    ...current,
    suborUrl: dlFileViewUrl(current.id),
    suborName: checked.name,
    suborMime: checked.mime,
  };
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const sql = getSql();
    await sql`
      UPDATE dodacie_listy SET
        subor_url = ${next.suborUrl},
        subor_name = ${next.suborName},
        subor_mime = ${next.suborMime},
        subor_bytes = ${checked.bytes}
      WHERE id = ${current.id}
        AND stav = 'cakajuci'
        AND (subor_url = '' OR subor_url IS NULL)
    `;
  } else {
    const blob = await readBlob();
    blob.files[current.id] = {
      name: checked.name,
      mime: checked.mime,
      data: checked.bytes.toString("base64"),
    };
    blob.listy = blob.listy.map((d) => (d.id === current.id ? next : d));
    await writeBlob(blob);
  }
  try {
    const { writeAudit } = await import("./kontrola-store");
    await writeAudit({
      autor: current.vytvoril,
      typ: "sklad",
      akcia: "priloha",
      entityId: current.id,
      popis: `Príloha k príjmu ${current.cisloDl || current.id} · ${checked.name}`,
    });
  } catch {
    /* audit must never break a mutation */
  }
  return { ok: true, list: next };
}

export async function getDlFile(id: string) {
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT subor_name, subor_mime, subor_bytes
      FROM dodacie_listy WHERE id = ${id} LIMIT 1
    `;
    const row = rows[0] as
      | { subor_name?: string; subor_mime?: string; subor_bytes?: Buffer }
      | undefined;
    if (!row?.subor_bytes) return null;
    return {
      name: String(row.subor_name || "dodaci-list"),
      mime: String(row.subor_mime || "application/octet-stream"),
      bytes: Buffer.from(row.subor_bytes),
    };
  }
  const blob = await readBlob();
  const file = blob.files[id];
  if (!file) return null;
  return {
    name: file.name,
    mime: file.mime,
    bytes: Buffer.from(file.data, "base64"),
  };
}

export async function resolveDodaciList(
  id: string,
  action: "accepted" | "rejected",
  author: string,
) {
  const current = await getDodaciList(id);
  if (!current || current.stav !== "cakajuci") return current;
  // Súbor ostáva na riadku — neschvaľovanie ani zamietnutie ho nemaže.
  if (action === "rejected") {
    return setDlStav(current, "zamietnuty", author);
  }
  for (const line of current.riadky) {
    let polozkaId = line.polozkaId;
    if (!polozkaId || line.nova) {
      const created = await createPolozka({
        kod: line.kod || line.nazov.slice(0, 12),
        nazov: line.nazov,
        kategoria: line.kategoria,
        jednotka: line.jednotka,
        minStav: line.minStav,
      });
      polozkaId = created.id;
    }
    await addPohyb({
      polozkaId,
      typ: "prijem",
      mnozstvo: line.mnozstvo,
      dodaciListId: current.id,
      kto: author,
      datum: current.datum,
    });
  }
  return setDlStav(current, "schvaleny", author);
}

async function setDlStav(current: DodaciList, stav: DlStav, author: string) {
  const next: DodaciList = {
    ...current,
    stav,
    schvalil: author,
    schvaleneAt: nowIso(),
  };
  if (isDatabaseConfigured()) {
    const sql = getSql();
    await sql`
      UPDATE dodacie_listy SET
        stav = ${next.stav},
        schvalil = ${next.schvalil},
        schvalene_at = ${next.schvaleneAt}::timestamptz
      WHERE id = ${current.id}
    `;
  } else {
    const blob = await readBlob();
    blob.listy = blob.listy.map((d) => (d.id === current.id ? next : d));
    await writeBlob(blob);
  }
  try {
    const { writeAudit } = await import("./kontrola-store");
    await writeAudit({
      autor: author,
      typ: "sklad",
      akcia: stav === "schvaleny" ? "schvalil" : "zamietol",
      entityId: current.id,
      popis: `${stav === "schvaleny" ? "Schválený" : "Zamietnutý"} príjem ${current.cisloDl || current.id}`,
    });
  } catch {
    /* audit must never break a mutation */
  }
  return next;
}

export async function reservedForOpenTickets() {
  const tickets = await listTickets({ status: "aktivne", archived: "hide" });
  const open = new Set(tickets.map((t) => t.id));
  const material = await listMaterial();
  return material
    .filter((m) => open.has(m.ticketId) && m.status === "planovane")
    .map((m) => ({
      polozkaId: m.polozkaId || "",
      quantity: m.quantity,
      ticketId: m.ticketId,
      prevadzkaId: m.prevadzkaId,
      item: m.item,
    }))
    .filter((m) => m.polozkaId);
}

export async function skladSnapshot() {
  await ensureSkladCatalog();
  const [polozky, pohyby, reserved, pending, listy] = await Promise.all([
    listPolozky(),
    listPohyby(),
    reservedForOpenTickets(),
    listDodacieListy({ stav: "cakajuci" }),
    listDodacieListy(),
  ]);
  const rows = polozky.map((p) => {
    const stock = stockFromPohyby(pohyby, p.id);
    const reservedN = reservedQty(reserved, p.id);
    return {
      ...p,
      stock,
      reserved: reservedN,
      free: stock - reservedN,
      low: stock - reservedN < p.minStav,
    };
  });
  return {
    polozky: rows,
    pohyby,
    reserved,
    pending,
    listy,
    stats: {
      items: rows.length,
      low: rows.filter((r) => r.low).length,
      reservedTickets: new Set(reserved.map((r) => r.ticketId)).size,
      prijmyMonth: listy.filter((d) => {
        const at = new Date(d.datum || d.createdAt);
        const now = new Date();
        return (
          d.stav === "schvaleny" &&
          at.getFullYear() === now.getFullYear() &&
          at.getMonth() === now.getMonth()
        );
      }).length,
    },
  };
}

export async function writeOffUsedMaterial(ticket: {
  id: string;
  assignedTo: string;
  prevadzkaId?: string;
}) {
  const items = await listMaterial({ ticketId: ticket.id });
  const written = [];
  for (const item of items) {
    if (item.status !== "pouzite") continue;
    const polozka =
      (item.polozkaId ? await getPolozka(item.polozkaId) : null) ||
      (await findPolozkaByNameOrCode(item.item));
    if (!polozka) continue;
    written.push(
      await addPohyb({
        polozkaId: polozka.id,
        typ: "vydaj",
        mnozstvo: item.quantity,
        ticketId: ticket.id,
        prevadzkaId: item.prevadzkaId || ticket.prevadzkaId || "",
        ticketMaterialId: item.id,
        kto: ticket.assignedTo || "Servis",
      }),
    );
  }
  return written;
}

async function ensureSchemaIfNeeded() {
  if (isDatabaseConfigured()) await ensureSchema();
}

export function serializePolozka(
  row: SkladPolozka & { stock?: number; reserved?: number; free?: number; low?: boolean },
) {
  return {
    id: row.id,
    kod: row.kod,
    nazov: row.nazov,
    kategoria: row.kategoria,
    jednotka: row.jednotka,
    minStav: row.minStav,
    poznamka: row.poznamka,
    stock: row.stock,
    reserved: row.reserved,
    free: row.free,
    low: row.low,
  };
}

export function serializeDl(list: DodaciList) {
  return {
    id: list.id,
    dodavatel: list.dodavatel,
    cisloDl: list.cisloDl,
    datum: list.datum,
    suborUrl: list.suborUrl,
    suborName: list.suborName,
    suborMime: list.suborMime,
    stav: list.stav,
    zdroj: list.zdroj,
    vytvoril: list.vytvoril,
    riadky: list.riadky.map((r) => ({
      polozkaId: r.polozkaId,
      nazov: r.nazov,
      kod: r.kod,
      kategoria: r.kategoria,
      jednotka: r.jednotka,
      mnozstvo: r.mnozstvo,
      poznamka: r.poznamka,
      nova: r.nova,
    })),
    createdAt: list.createdAt,
  };
}

export function serializePohyb(p: SkladPohyb) {
  return {
    id: p.id,
    polozkaId: p.polozkaId,
    typ: p.typ,
    mnozstvo: p.mnozstvo,
    dodaciListId: p.dodaciListId,
    ticketId: p.ticketId,
    prevadzkaId: p.prevadzkaId,
    datum: p.datum,
    kto: p.kto,
  };
}
