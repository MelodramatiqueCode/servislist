import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { ensureSchema, getSql, isDatabaseConfigured } from "./db";
import {
  hydrateMaterialItem,
  parseMaterialStatus,
  type MaterialInput,
  type MaterialItem,
} from "./material";

function dataFile() {
  const dir =
    process.env.SERVISLIST_DATA_DIR?.trim() ||
    path.join(process.cwd(), "data");
  return path.join(dir, "material.json");
}

let fileCache: MaterialItem[] | null = null;
let fileCachePath = "";

async function readFileItems(): Promise<MaterialItem[]> {
  const file = dataFile();
  if (fileCache && fileCachePath === file) return fileCache;
  fileCachePath = file;
  try {
    const raw = await fs.readFile(dataFile(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    fileCache = Array.isArray(parsed)
      ? parsed
          .map((row) => hydrateMaterialItem(row))
          .filter((row): row is MaterialItem => Boolean(row))
      : [];
  } catch {
    fileCache = [];
  }
  return fileCache;
}

async function writeFileItems(items: MaterialItem[]) {
  fileCache = items;
  fileCachePath = dataFile();
  await fs.mkdir(path.dirname(dataFile()), { recursive: true });
  await fs.writeFile(dataFile(), JSON.stringify(items, null, 2), "utf8");
}

function rowToItem(row: Record<string, unknown>): MaterialItem {
  return (
    hydrateMaterialItem(row) ?? {
      id: String(row.id ?? randomUUID()),
      ticketId: String(row.ticket_id ?? ""),
      prevadzkaId: String(row.prevadzka_id ?? ""),
      item: String(row.item ?? ""),
      quantity: Number(row.quantity ?? 1),
      unit: String(row.unit ?? "ks"),
      unitPrice:
        row.unit_price == null ? null : Number(row.unit_price),
      note: String(row.note ?? ""),
      status:
        parseMaterialStatus(String(row.status ?? "planovane")) ?? "planovane",
      polozkaId: String(row.polozka_id ?? row.polozkaId ?? "") || undefined,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at ?? new Date().toISOString()),
    }
  );
}

export async function listMaterial(filter?: {
  ticketId?: string;
  prevadzkaId?: string;
}): Promise<MaterialItem[]> {
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const sql = getSql();
    const rows = filter?.ticketId
      ? await sql`
          SELECT * FROM material
          WHERE ticket_id = ${filter.ticketId}
          ORDER BY created_at ASC
        `
      : filter?.prevadzkaId
        ? await sql`
            SELECT * FROM material
            WHERE prevadzka_id = ${filter.prevadzkaId}
            ORDER BY created_at ASC
          `
        : await sql`SELECT * FROM material ORDER BY created_at ASC`;
    return rows.map((r) => rowToItem(r as Record<string, unknown>));
  }
  const all = await readFileItems();
  return all.filter((item) => {
    if (filter?.ticketId) return item.ticketId === filter.ticketId;
    if (filter?.prevadzkaId) return item.prevadzkaId === filter.prevadzkaId;
    return true;
  });
}

async function insertDb(item: MaterialItem) {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO material (
      id, ticket_id, prevadzka_id, item, quantity, unit, unit_price,
      note, status, created_at, polozka_id
    ) VALUES (
      ${item.id},
      ${item.ticketId},
      ${item.prevadzkaId},
      ${item.item},
      ${item.quantity},
      ${item.unit},
      ${item.unitPrice},
      ${item.note},
      ${item.status},
      ${item.createdAt}::timestamptz,
      ${item.polozkaId || ""}
    )
  `;
}

async function updateDb(item: MaterialItem) {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE material SET
      item = ${item.item},
      quantity = ${item.quantity},
      unit = ${item.unit},
      unit_price = ${item.unitPrice},
      note = ${item.note},
      status = ${item.status},
      polozka_id = ${item.polozkaId || ""}
    WHERE id = ${item.id}
  `;
}

export async function addMaterialItem(
  input: MaterialInput & { ticketId: string; prevadzkaId: string },
): Promise<MaterialItem> {
  const item: MaterialItem = {
    id: randomUUID(),
    ticketId: input.ticketId,
    prevadzkaId: input.prevadzkaId,
    item: input.item.trim(),
    quantity: input.quantity && input.quantity > 0 ? input.quantity : 1,
    unit: input.unit?.trim() || "ks",
    unitPrice: input.unitPrice ?? null,
    note: input.note?.trim() || "",
    status: input.status ?? "planovane",
    createdAt: new Date().toISOString(),
    polozkaId: input.polozkaId,
  };
  if (!item.polozkaId) {
    const { findPolozkaByNameOrCode, ensureSkladCatalog } = await import(
      "./sklad-store"
    );
    await ensureSkladCatalog();
    const hit = await findPolozkaByNameOrCode(item.item);
    if (hit) item.polozkaId = hit.id;
  }
  if (isDatabaseConfigured()) {
    await insertDb(item);
  } else {
    const items = await readFileItems();
    items.push(item);
    await writeFileItems(items);
  }
  return item;
}

export async function replaceMaterial(
  ticketId: string,
  prevadzkaId: string,
  rows: MaterialInput[],
): Promise<MaterialItem[]> {
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const sql = getSql();
    await sql`DELETE FROM material WHERE ticket_id = ${ticketId}`;
  } else {
    const items = (await readFileItems()).filter((i) => i.ticketId !== ticketId);
    await writeFileItems(items);
  }
  const created: MaterialItem[] = [];
  for (const row of rows) {
    if (!row.item.trim()) continue;
    created.push(await addMaterialItem({ ...row, ticketId, prevadzkaId }));
  }
  return created;
}

export async function updateMaterialItem(
  id: string,
  patch: Partial<MaterialInput>,
): Promise<MaterialItem | null> {
  const all = await listMaterial();
  const current = all.find((i) => i.id === id);
  if (!current) return null;
  const next: MaterialItem = {
    ...current,
    item: patch.item?.trim() ?? current.item,
    quantity:
      patch.quantity != null && patch.quantity > 0
        ? patch.quantity
        : current.quantity,
    unit: patch.unit?.trim() || current.unit,
    unitPrice:
      patch.unitPrice === undefined ? current.unitPrice : patch.unitPrice,
    note: patch.note !== undefined ? patch.note : current.note,
    status: patch.status ?? current.status,
    polozkaId: patch.polozkaId ?? current.polozkaId,
  };
  if (isDatabaseConfigured()) {
    await updateDb(next);
  } else {
    const items = (await readFileItems()).map((i) => (i.id === id ? next : i));
    await writeFileItems(items);
  }
  return next;
}

export async function deleteMaterialItem(id: string): Promise<boolean> {
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`DELETE FROM material WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  }
  const items = await readFileItems();
  const next = items.filter((i) => i.id !== id);
  if (next.length === items.length) return false;
  await writeFileItems(next);
  return true;
}

export async function getMaterialItem(id: string) {
  return (await listMaterial()).find((i) => i.id === id) ?? null;
}

export function serializeMaterial(item: MaterialItem) {
  return {
    id: item.id,
    ticketId: item.ticketId,
    prevadzkaId: item.prevadzkaId,
    item: item.item,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    note: item.note,
    status: item.status,
    polozkaId: item.polozkaId || "",
    statusLabel:
      item.status === "pouzite" ? "Použité" : "Plánované",
    createdAt: item.createdAt,
  };
}
