export const SKLAD_KATEGORIA_FALLBACK = "Prehrávače (nešpecifikované)";
export const SKLAD_KATEGORIA_LEGACY_RPI = "Prehrávače/RPi";

export const SKLAD_KATEGORIE = [
  "Reproduktory",
  "Zosilňovače",
  "RPi 4",
  "RPi 3",
  "Zdroje RPi 4 (USB-C)",
  "Zdroje RPi 3 (micro USB)",
  SKLAD_KATEGORIA_FALLBACK,
  "SD karty",
  "Káble",
  "Tlačidlá",
  "Držiaky",
  "Iné",
] as const;

export type SkladKategoria = (typeof SKLAD_KATEGORIE)[number];

export const SKLAD_JEDNOTKY = ["ks", "m", "bal"] as const;
export type SkladJednotka = (typeof SKLAD_JEDNOTKY)[number];

export const DL_STAVY = ["cakajuci", "schvaleny", "zamietnuty"] as const;
export type DlStav = (typeof DL_STAVY)[number];

export const POHYB_TYPY = ["prijem", "vydaj", "korekcia"] as const;
export type PohybTyp = (typeof POHYB_TYPY)[number];

export type SkladPolozka = {
  id: string;
  kod: string;
  nazov: string;
  kategoria: SkladKategoria;
  jednotka: SkladJednotka;
  minStav: number;
  poznamka: string;
  archivedAt: string;
};

export type DodaciListRiadok = {
  polozkaId: string;
  kod: string;
  nazov: string;
  kategoria: SkladKategoria;
  jednotka: SkladJednotka;
  minStav: number;
  mnozstvo: number;
  poznamka: string;
  nova: boolean;
};

export type DodaciList = {
  id: string;
  dodavatel: string;
  cisloDl: string;
  datum: string;
  suborUrl: string;
  suborName: string;
  suborMime: string;
  stav: DlStav;
  zdroj: "web" | "servis_bot";
  vytvoril: string;
  schvalil: string;
  schvaleneAt: string;
  riadky: DodaciListRiadok[];
  createdAt: string;
};

export type SkladPohyb = {
  id: string;
  polozkaId: string;
  typ: PohybTyp;
  mnozstvo: number;
  dodaciListId: string;
  ticketId: string;
  prevadzkaId: string;
  ticketMaterialId: string;
  datum: string;
  kto: string;
};

export const CATALOG_SEED: Array<
  Pick<SkladPolozka, "kod" | "nazov" | "kategoria" | "jednotka" | "minStav">
> = [
  { kod: "RP-STR65", nazov: "Reproduktory stropné", kategoria: "Reproduktory", jednotka: "ks", minStav: 10 },
  { kod: "RP-BOX5", nazov: "Reproduktory nástenné", kategoria: "Reproduktory", jednotka: "ks", minStav: 4 },
  { kod: "ZS-AMP", nazov: "Zosilňovač", kategoria: "Zosilňovače", jednotka: "ks", minStav: 2 },
  { kod: "RPI401", nazov: "RPi 4", kategoria: "RPi 4", jednotka: "ks", minStav: 2 },
  { kod: "RPI303", nazov: "RPi 3", kategoria: "RPi 3", jednotka: "ks", minStav: 2 },
  { kod: "OFI045", nazov: "Zdroj USB-C (RPi 4)", kategoria: "Zdroje RPi 4 (USB-C)", jednotka: "ks", minStav: 2 },
  { kod: "OFI090", nazov: "Zdroj micro USB (RPi 3)", kategoria: "Zdroje RPi 3 (micro USB)", jednotka: "ks", minStav: 2 },
  { kod: "SD-CARD", nazov: "SD karta", kategoria: "SD karty", jednotka: "ks", minStav: 10 },
  { kod: "KB-REPRO", nazov: "Káble reproduktorové", kategoria: "Káble", jednotka: "m", minStav: 100 },
  { kod: "KB-CAB", nazov: "Káble", kategoria: "Káble", jednotka: "m", minStav: 20 },
  { kod: "TL-BTN", nazov: "Tlačidlá", kategoria: "Tlačidlá", jednotka: "ks", minStav: 5 },
  { kod: "DR-KONZ", nazov: "Držiaky / konzoly", kategoria: "Držiaky", jednotka: "ks", minStav: 3 },
];

export function parseKategoria(raw: string | undefined | null): SkladKategoria | null {
  const value = String(raw ?? "").trim();
  if (value === SKLAD_KATEGORIA_LEGACY_RPI) return SKLAD_KATEGORIA_FALLBACK;
  return (SKLAD_KATEGORIE as readonly string[]).includes(value)
    ? (value as SkladKategoria)
    : null;
}

export const RPI_STOCK_ITEMS = [
  {
    kod: "RPI401",
    legacyKody: ["PI-RPI4"] as const,
    nazov: "RPi 4",
    kategoria: "RPi 4" as SkladKategoria,
    jednotka: "ks" as const,
    minStav: 2,
  },
  {
    kod: "RPI303",
    legacyKody: ["PI-RPI3"] as const,
    nazov: "RPi 3",
    kategoria: "RPi 3" as SkladKategoria,
    jednotka: "ks" as const,
    minStav: 2,
  },
  {
    kod: "OFI045",
    legacyKody: ["PI-PSU4"] as const,
    nazov: "Zdroj USB-C (RPi 4)",
    kategoria: "Zdroje RPi 4 (USB-C)" as SkladKategoria,
    jednotka: "ks" as const,
    minStav: 2,
  },
  {
    kod: "OFI090",
    legacyKody: ["PI-PSU3"] as const,
    nazov: "Zdroj micro USB (RPi 3)",
    kategoria: "Zdroje RPi 3 (micro USB)" as SkladKategoria,
    jednotka: "ks" as const,
    minStav: 2,
  },
] as const;

export const RPI_QTY_SPLIT_NOTE = "Rozdelenie podľa Martina 17.10.2026";
export const RPI_QTY_SPLIT_AUTHOR = "Martin";
export const RPI_QTY_SPLIT_META_KEY = "rpi_qty_split_2026-10-17";
export const WAVESHARE_NOT_STOCK_NOTE = "Nie je skladová položka – Martin 17.10.2026";

export type RpiQtySplitTransfer = {
  key: string;
  fromKod: string;
  toKod: string;
  toNazov: string;
  qty: number;
};

/** Martin 17.10.2026 — Zonepi faktúra 202638910 / order 727137. */
export const RPI_QTY_SPLIT_TRANSFERS: readonly RpiQtySplitTransfer[] = [
  { key: "rpi4", fromKod: "PI-RPI", toKod: "RPI401", toNazov: "RPi 4", qty: 3 },
  { key: "rpi3", fromKod: "PI-RPI", toKod: "RPI303", toNazov: "RPi 3", qty: 4 },
  { key: "psu4", fromKod: "PI-PSU", toKod: "OFI045", toNazov: "Zdroj USB-C (RPi 4)", qty: 13 },
  { key: "psu3", fromKod: "PI-PSU", toKod: "OFI090", toNazov: "Zdroj micro USB (RPi 3)", qty: 6 },
];

export function rpiQtySplitDeltas(
  transfers: readonly RpiQtySplitTransfer[] = RPI_QTY_SPLIT_TRANSFERS,
) {
  const deltas = new Map<string, number>();
  for (const row of transfers) {
    deltas.set(row.fromKod, (deltas.get(row.fromKod) ?? 0) - row.qty);
    deltas.set(row.toKod, (deltas.get(row.toKod) ?? 0) + row.qty);
  }
  return deltas;
}

export function itemMatchesKod(
  item: Pick<SkladPolozka, "kod" | "nazov">,
  kod: string,
  nazov?: string,
) {
  const needle = kod.trim().toUpperCase();
  const aliases = new Set<string>([needle]);
  for (const row of RPI_STOCK_ITEMS) {
    if (row.kod === needle || (row.legacyKody as readonly string[]).includes(needle)) {
      aliases.add(row.kod);
      for (const legacy of row.legacyKody) aliases.add(legacy);
    }
  }
  if (aliases.has(item.kod.trim().toUpperCase())) return true;
  return Boolean(nazov && normalizeName(item.nazov) === normalizeName(nazov));
}

export function isWaveshareNonStockItem(nazov: string, kod = "") {
  const hay = normalizeName(`${nazov} ${kod}`);
  if (/\b(waveshare|wav865)\b/.test(hay)) return true;
  return /\bdisplej\b/.test(hay) && /\bdsi\b/.test(hay);
}

/** Map old Prehrávače/RPi rows by name. Ambiguous names stay in the fallback. */
export function mapLegacyRpiCategory(
  nazov: string,
  kod = "",
): SkladKategoria {
  const hay = normalizeName(`${nazov} ${kod}`);
  const isPsu = /\b(zdroj|psu|napajac|adapter|usb c|usbc|micro usb|microusb)\b/.test(hay);
  const hasUsbC = /\b(usb c|usbc|type c|typ c)\b/.test(hay);
  const hasMicro = /\b(micro usb|microusb|micro)\b/.test(hay);
  const isPi4 = /\b(rpi 4|rpi4|pi 4|pi4|raspberry pi 4|raspberry 4)\b/.test(hay);
  const isPi3 = /\b(rpi 3|rpi3|pi 3|pi3|raspberry pi 3|raspberry 3)\b/.test(hay);

  if (isPsu || hasUsbC || hasMicro) {
    if (hasUsbC || (isPi4 && !isPi3 && !hasMicro)) return "Zdroje RPi 4 (USB-C)";
    if (hasMicro || (isPi3 && !isPi4 && !hasUsbC)) return "Zdroje RPi 3 (micro USB)";
    return SKLAD_KATEGORIA_FALLBACK;
  }
  if (isPi4 && !isPi3) return "RPi 4";
  if (isPi3 && !isPi4) return "RPi 3";
  return SKLAD_KATEGORIA_FALLBACK;
}

export function needsLegacyRpiMigration(kategoria: string) {
  return (
    kategoria === SKLAD_KATEGORIA_LEGACY_RPI ||
    kategoria === "Prehravace/RPi"
  );
}

export function parseJednotka(raw: string | undefined | null): SkladJednotka {
  const value = String(raw ?? "").trim();
  return (SKLAD_JEDNOTKY as readonly string[]).includes(value)
    ? (value as SkladJednotka)
    : "ks";
}

export function parseDlStav(raw: string | undefined | null): DlStav | null {
  const value = String(raw ?? "").trim();
  return (DL_STAVY as readonly string[]).includes(value) ? (value as DlStav) : null;
}

export function parsePohybTyp(raw: string | undefined | null): PohybTyp | null {
  const value = String(raw ?? "").trim();
  return (POHYB_TYPY as readonly string[]).includes(value) ? (value as PohybTyp) : null;
}

export function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function stockFromPohyby(pohyby: SkladPohyb[], polozkaId: string) {
  return pohyby
    .filter((p) => p.polozkaId === polozkaId)
    .reduce((sum, p) => sum + p.mnozstvo, 0);
}

export function reservedQty(
  reserved: Array<{ polozkaId: string; quantity: number }>,
  polozkaId: string,
) {
  return reserved
    .filter((r) => r.polozkaId === polozkaId)
    .reduce((sum, r) => sum + r.quantity, 0);
}

export function isLowStock(stock: number, reserved: number, minStav: number) {
  return stock - reserved < minStav;
}

/**
 * Neon returns TIMESTAMPTZ as Date. String(date) is
 * "Wed Oct 14 2026 00:00:00 GMT+0000 (Coordinated Universal Time)",
 * which Postgres rejects as timestamptz. Always write ISO-8601.
 */
export function toSqlTimestamptz(value: unknown, fallback?: unknown): string {
  return parseToDate(value)?.toISOString()
    ?? parseToDate(fallback)?.toISOString()
    ?? new Date().toISOString();
}

export function parseToDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const DL_FILE_MAX_BYTES = 4 * 1024 * 1024;
