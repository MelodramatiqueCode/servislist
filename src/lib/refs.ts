/** Parse ticket id, number (`12`) or kód (`#0012`). */
export function parseTicketRef(raw: string): {
  id?: string;
  number?: number;
} {
  const value = decodeRef(raw);
  if (!value) return {};
  const stripped = value.replace(/^#/, "");
  if (/^\d+$/.test(stripped)) {
    return { number: Number(stripped) };
  }
  return { id: value };
}

/** Parse výjazd id, number (`3`) or kód (`V-0003`). */
export function parseVyjazdRef(raw: string): {
  id?: string;
  number?: number;
} {
  const value = decodeRef(raw);
  if (!value) return {};
  const stripped = value.replace(/^v[-_]?/i, "");
  if (/^\d+$/.test(stripped)) {
    return { number: Number(stripped) };
  }
  return { id: value };
}

export function decodeRef(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    return decodeURIComponent(trimmed).trim();
  } catch {
    return trimmed;
  }
}

export function inDateRange(
  iso: string,
  from?: string,
  to?: string,
): boolean {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;

  if (from) {
    const start = parseRangeBound(from, "start");
    if (start != null && time < start) return false;
  }
  if (to) {
    const end = parseRangeBound(to, "end");
    if (end != null && time > end) return false;
  }
  return true;
}

export function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function localMonthRange(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: localDateKey(start), to: localDateKey(end) };
}

function parseRangeBound(value: string, edge: "start" | "end"): number | null {
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const suffix = edge === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
    const time = new Date(`${raw}${suffix}`).getTime();
    return Number.isNaN(time) ? null : time;
  }
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? null : time;
}
