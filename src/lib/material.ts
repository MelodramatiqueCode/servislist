import type { JobType } from "./prevadzka-profile";

export const MATERIAL_STATUSES = ["planovane", "pouzite"] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];

export const MATERIAL_STATUS_LABELS: Record<MaterialStatus, string> = {
  planovane: "Plánované",
  pouzite: "Použité",
};

export type MaterialItem = {
  id: string;
  ticketId: string;
  prevadzkaId: string;
  item: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  note: string;
  status: MaterialStatus;
  createdAt: string;
};

export type MaterialInput = {
  item: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number | null;
  note?: string;
  status?: MaterialStatus;
};

export function parseMaterialStatus(
  raw: string | undefined | null,
): MaterialStatus | null {
  const value = (raw ?? "").trim().toLowerCase();
  if ((MATERIAL_STATUSES as readonly string[]).includes(value)) {
    return value as MaterialStatus;
  }
  return null;
}

export function materialTemplate(jobType: JobType): MaterialInput[] {
  if (jobType === "spustenie_zariadenia") {
    return [
      { item: "Raspberry Pi", quantity: 1, unit: "ks" },
      { item: "SD karta", quantity: 1, unit: "ks" },
      { item: "Napájací zdroj", quantity: 1, unit: "ks" },
      { item: "Tlačidlá", quantity: 2, unit: "ks" },
      { item: "Káble", quantity: 5, unit: "m" },
    ];
  }
  return [
    { item: "Reproduktory stropné", quantity: 8, unit: "ks" },
    { item: "Reproduktory nástenné", quantity: 2, unit: "ks" },
    { item: "Zosilňovač", quantity: 1, unit: "ks" },
    { item: "Raspberry Pi", quantity: 1, unit: "ks" },
    { item: "SD karta", quantity: 1, unit: "ks" },
    { item: "Napájací zdroj", quantity: 1, unit: "ks" },
    { item: "Káble reproduktorové", quantity: 50, unit: "m" },
    { item: "Tlačidlá", quantity: 3, unit: "ks" },
    { item: "Držiaky / konzoly", quantity: 2, unit: "ks" },
  ];
}

export function materialTotal(items: MaterialItem[]) {
  const priced = items.filter((i) => i.unitPrice != null);
  if (priced.length === 0) return null;
  return priced.reduce(
    (sum, i) => sum + i.quantity * (i.unitPrice ?? 0),
    0,
  );
}

export function formatMaterialLine(item: MaterialItem | MaterialInput) {
  const qty = item.quantity ?? 1;
  const unit = item.unit || "ks";
  return `${qty} ${unit} ${item.item}`.trim();
}

export function formatMaterialSummary(items: MaterialItem[]) {
  const used = items.filter((i) => i.status === "pouzite");
  const listed = used.length ? used : items;
  if (listed.length === 0) return "";
  return listed.map(formatMaterialLine).join(", ");
}

export function hydrateMaterialItem(
  raw: unknown,
  fallback: { ticketId?: string; prevadzkaId?: string } = {},
): MaterialItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const item = String(o.item ?? "").trim();
  if (!item) return null;
  const qty = Number(o.quantity ?? 1);
  const priceRaw = o.unitPrice ?? o.unit_price;
  const price =
    priceRaw == null || priceRaw === "" ? null : Number(priceRaw);
  return {
    id: String(o.id ?? ""),
    ticketId: String(o.ticketId ?? o.ticket_id ?? fallback.ticketId ?? ""),
    prevadzkaId: String(
      o.prevadzkaId ?? o.prevadzka_id ?? fallback.prevadzkaId ?? "",
    ),
    item,
    quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
    unit: String(o.unit ?? "ks") || "ks",
    unitPrice: price != null && Number.isFinite(price) ? price : null,
    note: String(o.note ?? ""),
    status: parseMaterialStatus(String(o.status ?? "planovane")) ?? "planovane",
    createdAt: String(o.createdAt ?? o.created_at ?? new Date().toISOString()),
  };
}

export function parseMaterialList(raw: unknown): MaterialInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => hydrateMaterialItem(row))
    .filter((row): row is MaterialItem => Boolean(row))
    .map((row) => ({
      item: row.item,
      quantity: row.quantity,
      unit: row.unit,
      unitPrice: row.unitPrice,
      note: row.note,
      status: row.status,
    }));
}
