import { vyjazdCode } from "./format";
import type {
  ServiceDevice,
  TicketPriority,
  Vyjazd,
  VyjazdRouteSummary,
  VyjazdStatus,
  VyjazdStop,
  VyjazdStopInput,
} from "./types";

export function newStopId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `stop-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function deviceStoreLabel(d: {
  code?: string;
  partner?: string;
  city?: string;
  name?: string;
}) {
  return (
    [d.code && `#${d.code}`, d.partner, d.city].filter(Boolean).join(" · ") ||
    d.name ||
    ""
  );
}

export function prevadzkaKey(d: {
  partner?: string;
  city?: string;
  address?: string;
  uuid?: string;
}) {
  const partner = (d.partner ?? "").trim().toLowerCase();
  const city = (d.city ?? "").trim().toLowerCase();
  const address = (d.address ?? "").trim().toLowerCase();
  if (partner || city || address) {
    return `${partner}|${city}|${address}`;
  }
  return d.uuid ? `device:${d.uuid}` : "";
}

export function stopCoverageKey(stop: {
  store?: string;
  address?: string;
  deviceUuid?: string;
}) {
  const store = (stop.store ?? "").trim().toLowerCase();
  const address = (stop.address ?? "").trim().toLowerCase();
  if (store || address) return `${store}|${address}`;
  return stop.deviceUuid ? `device:${stop.deviceUuid}` : "";
}

export function prevadzkyCountLabel(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} prevádzka`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} prevádzky`;
  }
  return `${n} prevádzok`;
}

export function hydrateStop(
  raw: Partial<VyjazdStop> | VyjazdStopInput | null | undefined,
  fallback?: Partial<VyjazdStop>,
): VyjazdStop | null {
  if (!raw && !fallback) return null;
  const store = String(raw?.store ?? fallback?.store ?? "").trim();
  const address = String(raw?.address ?? fallback?.address ?? "").trim();
  const deviceUuid = String(
    raw?.deviceUuid ?? fallback?.deviceUuid ?? "",
  ).trim();
  const ticketId = String(raw?.ticketId ?? fallback?.ticketId ?? "").trim();
  if (!store && !address && !deviceUuid && !ticketId) return null;

  return {
    id: String(raw?.id || fallback?.id || newStopId()),
    store: store || fallback?.store || "",
    address,
    contactPhone: String(
      raw?.contactPhone ?? fallback?.contactPhone ?? "",
    ).trim(),
    deviceUuid,
    ticketId,
    done: Boolean(raw?.done ?? fallback?.done),
    note: String(raw?.note ?? fallback?.note ?? "").trim(),
  };
}

function parseStopsArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function stopsFromLegacy(
  v: {
    id?: string;
    store?: string;
    address?: string;
    contactPhone?: string;
    deviceUuid?: string;
    ticketId?: string;
    result?: string;
    status?: VyjazdStatus;
  },
  opts?: { done?: boolean },
): VyjazdStop[] {
  const stop = hydrateStop({
    id: v.id ? `stop-${v.id}` : newStopId(),
    store: v.store ?? "",
    address: v.address ?? "",
    contactPhone: v.contactPhone ?? "",
    deviceUuid: v.deviceUuid ?? "",
    ticketId: v.ticketId ?? "",
    done: opts?.done ?? v.status === "hotovy",
    note: v.result ?? "",
  });
  return stop ? [stop] : [];
}

export function normalizeStops(
  raw: unknown,
  legacy: {
    id?: string;
    store?: string;
    address?: string;
    contactPhone?: string;
    deviceUuid?: string;
    ticketId?: string;
    result?: string;
    status?: VyjazdStatus;
  },
): VyjazdStop[] {
  const parsed = parseStopsArray(raw)
    .map((item) =>
      hydrateStop(item as Partial<VyjazdStop> | VyjazdStopInput),
    )
    .filter((stop): stop is VyjazdStop => Boolean(stop));

  if (parsed.length > 0) return parsed;
  return stopsFromLegacy(legacy);
}

export function stopsFromInput(
  input: {
    store?: string;
    address?: string;
    contactPhone?: string;
    deviceUuid?: string;
    ticketId?: string;
    result?: string;
    status?: VyjazdStatus;
    stops?: VyjazdStopInput[];
  },
): VyjazdStop[] {
  if (input.stops && input.stops.length > 0) {
    const parsed = input.stops
      .map((stop) => hydrateStop(stop))
      .filter((stop): stop is VyjazdStop => Boolean(stop));
    if (parsed.length > 0) return parsed;
  }
  return stopsFromLegacy(input);
}

export function firstStop(stops: VyjazdStop[]): VyjazdStop | null {
  return stops[0] ?? null;
}

export function syncLegacyVyjazdFields<T extends {
  store: string;
  address: string;
  contactPhone: string;
  deviceUuid: string;
  ticketId: string;
  stops: VyjazdStop[];
}>(vyjazd: T): T {
  const primary = firstStop(vyjazd.stops);
  if (!primary) return vyjazd;
  vyjazd.store = primary.store;
  vyjazd.address = primary.address;
  vyjazd.contactPhone = primary.contactPhone;
  vyjazd.deviceUuid = primary.deviceUuid;
  vyjazd.ticketId = primary.ticketId;
  return vyjazd;
}

export function vyjazdDeviceUuids(v: {
  deviceUuid?: string;
  stops?: VyjazdStop[];
}) {
  const ids = new Set<string>();
  if (v.deviceUuid) ids.add(v.deviceUuid);
  for (const stop of v.stops ?? []) {
    if (stop.deviceUuid) ids.add(stop.deviceUuid);
  }
  return ids;
}

export function vyjazdTicketIds(v: {
  ticketId?: string;
  stops?: VyjazdStop[];
}) {
  const ids = new Set<string>();
  if (v.ticketId) ids.add(v.ticketId);
  for (const stop of v.stops ?? []) {
    if (stop.ticketId) ids.add(stop.ticketId);
  }
  return ids;
}

export function vyjazdCoversDevice(
  v: { deviceUuid?: string; stops?: VyjazdStop[] },
  deviceUuid: string,
) {
  if (!deviceUuid) return false;
  return vyjazdDeviceUuids(v).has(deviceUuid);
}

export function doneStopCount(stops: VyjazdStop[]) {
  return stops.filter((s) => s.done).length;
}

export function allStopsDone(stops: VyjazdStop[]) {
  return stops.length > 0 && stops.every((s) => s.done);
}

export function storeSummary(v: {
  store?: string;
  stops?: VyjazdStop[];
}) {
  const stops = v.stops ?? [];
  if (stops.length > 1) {
    const names = stops
      .map((s) => s.store)
      .filter(Boolean)
      .slice(0, 3);
    const extra = stops.length - names.length;
    return extra > 0
      ? `${names.join(" → ")} +${extra}`
      : names.join(" → ");
  }
  return stops[0]?.store || v.store || "";
}

export function statusAfterStopProgress(
  current: VyjazdStatus,
  stops: VyjazdStop[],
): VyjazdStatus {
  if (current === "zruseny" || stops.length === 0) return current;
  if (allStopsDone(stops)) return "hotovy";
  if (stops.some((s) => s.done)) return "prebieha";
  if (current === "hotovy") return "prebieha";
  return current;
}

export function remainingStopCount(stops: VyjazdStop[]) {
  return Math.max(0, stops.length - doneStopCount(stops));
}

export function markStopsDone(stops: VyjazdStop[], done: boolean): VyjazdStop[] {
  return stops.map((stop) => ({ ...stop, done }));
}

export function hydrateRouteSummary(raw: unknown): VyjazdRouteSummary | null {
  if (raw == null || raw === "") return null;
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const r = value as Partial<VyjazdRouteSummary>;
  const distanceMeters = Math.max(0, Number(r.distanceMeters) || 0);
  const durationSeconds = Math.max(0, Number(r.durationSeconds) || 0);
  const status: VyjazdRouteSummary["status"] =
    r.status === "ok" || r.status === "incomplete" || r.status === "error"
      ? r.status
      : distanceMeters > 0 && durationSeconds > 0
        ? "ok"
        : "error";
  return {
    status,
    distanceMeters,
    durationSeconds,
    computedAt: String(r.computedAt ?? ""),
    fingerprint: String(r.fingerprint ?? ""),
    error: String(r.error ?? ""),
  };
}

export function hydrateVyjazd(
  v: Partial<Vyjazd> & Pick<Vyjazd, "id" | "number" | "title">,
  nowIso = () => new Date().toISOString(),
): Vyjazd {
  const stops = normalizeStops(v.stops, v);
  const vyjazd: Vyjazd = {
    id: v.id,
    number: v.number,
    title: v.title,
    store: v.store ?? "",
    address: v.address ?? "",
    contactPhone: v.contactPhone ?? "",
    technician: v.technician ?? "",
    scheduledAt: v.scheduledAt ?? "",
    status: v.status ?? "naplanovany",
    priority: v.priority ?? "normalna",
    deviceUuid: v.deviceUuid ?? "",
    ticketId: v.ticketId ?? "",
    description: v.description ?? "",
    result: v.result ?? "",
    stops,
    route: hydrateRouteSummary(v.route),
    createdAt: v.createdAt ?? nowIso(),
    updatedAt: v.updatedAt ?? nowIso(),
  };
  return syncLegacyVyjazdFields(vyjazd);
}

export function parseStopsJson(raw: string): VyjazdStop[] {
  return normalizeStops(raw, {});
}

export function emptyStop(): VyjazdStop {
  return {
    id: newStopId(),
    store: "",
    address: "",
    contactPhone: "",
    deviceUuid: "",
    ticketId: "",
    done: false,
    note: "",
  };
}

export function stopFromDevice(
  device: Pick<
    ServiceDevice,
    "uuid" | "code" | "partner" | "city" | "name" | "address" | "phone"
  >,
  extra?: Partial<VyjazdStop>,
): VyjazdStop {
  return {
    id: extra?.id || newStopId(),
    store: extra?.store || deviceStoreLabel(device),
    address: extra?.address || device.address || "",
    contactPhone: extra?.contactPhone || device.phone || "",
    deviceUuid: extra?.deviceUuid || device.uuid,
    ticketId: extra?.ticketId || "",
    done: Boolean(extra?.done),
    note: extra?.note || "",
  };
}

export function stopMapsQuery(stop: { store?: string; address?: string }) {
  const address = (stop.address ?? "").trim();
  const store = (stop.store ?? "").trim();
  if (address && store) {
    if (address.toLowerCase().includes(store.toLowerCase())) return address;
    return `${address}, ${store}`;
  }
  return address || store;
}

export function googleMapsDirUrl(
  destination: string,
  waypoints: string[] = [],
) {
  const dest = destination.trim();
  if (!dest) return null;
  const params = new URLSearchParams();
  params.set("api", "1");
  params.set("destination", dest);
  params.set("travelmode", "driving");
  const via = waypoints.map((point) => point.trim()).filter(Boolean);
  if (via.length > 0) {
    params.set("waypoints", via.slice(0, 9).join("|"));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function stopNavigationUrl(stop: { store?: string; address?: string }) {
  const query = stopMapsQuery(stop);
  if (!query) return null;
  return googleMapsDirUrl(query);
}

export function routeNavigationUrl(
  stops: Array<{ store?: string; address?: string }>,
) {
  const queries = stops
    .map((stop) => stopMapsQuery(stop))
    .filter((query): query is string => Boolean(query));
  if (queries.length < 2) return null;
  const destination = queries[queries.length - 1];
  const waypoints = queries.slice(0, -1);
  return googleMapsDirUrl(destination, waypoints);
}

const MERGE_PRIORITY_RANK: Record<TicketPriority, number> = {
  nizka: 0,
  normalna: 1,
  vysoka: 2,
  urgentna: 3,
};

function foldPlace(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function appendNote(existing: string, note: string) {
  const base = existing.trim();
  if (!base) return note;
  if (base.includes(note)) return base;
  return `${base}\n${note}`;
}

export function mergeNarrative(primary: string, secondary: string) {
  const a = primary.trim();
  const b = secondary.trim();
  if (!a) return b;
  if (!b || a.includes(b)) return a;
  return `${a}\n\n${b}`;
}

/** Identity used to drop duplicate stops when merging two výjazdy. */
export function stopIdentityKey(stop: VyjazdStop): string {
  return stopIdentityKeys(stop)[0] ?? `id:${stop.id}`;
}

export function stopIdentityKeys(stop: VyjazdStop): string[] {
  const keys: string[] = [];
  const ticket = stop.ticketId.trim();
  if (ticket) keys.push(`ticket:${ticket}`);
  const uuid = stop.deviceUuid.trim().toLowerCase();
  if (uuid) keys.push(`device:${uuid}`);
  const store = foldPlace(stop.store);
  const address = foldPlace(stop.address);
  if (store && address) keys.push(`place:${store}|${address}`);
  else if (store) keys.push(`store:${store}`);
  return keys;
}

function mergeStopPair(kept: VyjazdStop, extra: VyjazdStop): VyjazdStop {
  const notes = [kept.note, extra.note].map((n) => n.trim()).filter(Boolean);
  const extraTicket = extra.ticketId.trim();
  if (extraTicket && extraTicket !== kept.ticketId.trim()) {
    notes.push(`Ticket ${extraTicket}`);
  }
  const extraDevice = extra.deviceUuid.trim();
  if (
    extraDevice &&
    extraDevice.toLowerCase() !== kept.deviceUuid.trim().toLowerCase()
  ) {
    notes.push(`UUID ${extraDevice}`);
  }
  const uniqueNotes = [...new Set(notes)];
  return {
    ...kept,
    ticketId: kept.ticketId.trim() || extra.ticketId,
    deviceUuid: kept.deviceUuid.trim() || extra.deviceUuid,
    store: kept.store.trim() || extra.store,
    address: kept.address.trim() || extra.address,
    contactPhone: kept.contactPhone.trim() || extra.contactPhone,
    done: kept.done || extra.done,
    note: uniqueNotes.join(" · "),
  };
}

/**
 * Union of two stop lists: primary order first, then secondary.
 * Duplicates (same ticket, device UUID, or store+address) keep the first
 * occurrence and merge notes / done / missing contact fields from the later one.
 * Appended (non-duplicate) stops get new ids so they stay unique on the primary.
 */
export function mergeStopLists(
  primary: VyjazdStop[],
  secondary: VyjazdStop[],
): VyjazdStop[] {
  const out: VyjazdStop[] = [];
  const indexByKey = new Map<string, number>();

  function register(index: number, stop: VyjazdStop) {
    for (const key of stopIdentityKeys(stop)) {
      indexByKey.set(key, index);
    }
  }

  function absorb(stop: VyjazdStop, assignNewId: boolean) {
    const keys = stopIdentityKeys(stop);
    let existing: number | undefined;
    for (const key of keys) {
      const idx = indexByKey.get(key);
      if (idx !== undefined) {
        existing = idx;
        break;
      }
    }
    if (existing !== undefined) {
      out[existing] = mergeStopPair(out[existing], stop);
      register(existing, out[existing]);
      return;
    }
    const next = assignNewId ? { ...stop, id: newStopId() } : { ...stop };
    register(out.length, next);
    out.push(next);
  }

  for (const stop of primary) absorb(stop, false);
  for (const stop of secondary) absorb(stop, true);
  return out;
}

export function canMergeVyjazdStatus(status: VyjazdStatus): boolean {
  return status === "naplanovany" || status === "prebieha";
}

/** Prefer the primary technician; fall back to the secondary if primary is empty. */
export function pickMergeTechnician(primary: string, secondary: string): string {
  return primary.trim() || secondary.trim();
}

/** Prefer the primary scheduled time; fall back to secondary if primary is empty. */
export function pickMergeScheduledAt(primary: string, secondary: string): string {
  return primary.trim() || secondary.trim();
}

/** Higher of the two priorities (urgentná > vysoká > normálna > nízka). */
export function pickMergePriority(
  primary: TicketPriority,
  secondary: TicketPriority,
): TicketPriority {
  return MERGE_PRIORITY_RANK[secondary] > MERGE_PRIORITY_RANK[primary]
    ? secondary
    : primary;
}

/**
 * Merge policy — primary = výjazd from which merge is started (the one Martin
 * is on). We do **not** pick the earlier scheduled výjazd as primary; that
 * would surprise someone who opened V-0003 and chose to absorb V-0001.
 *
 * - title / technician / scheduledAt: primary, fallback to secondary if empty
 * - description: primary, then append secondary if it adds new text
 * - priority: max(primary, secondary)
 * - status: prebieha if either was already prebieha, then tick-derived status
 * - stops: primary order, then secondary; dedupe ticket / device / store+address
 * - secondary: soft-cancel to zruseny with note „Spojené do V-xxxx“
 */
export function buildMergedVyjazdPair(
  primary: Vyjazd,
  secondary: Vyjazd,
  now: string,
): { primary: Vyjazd; secondary: Vyjazd } {
  if (primary.id === secondary.id) {
    throw new Error("Nie je možné spojiť výjazd so sebou samým.");
  }
  if (!canMergeVyjazdStatus(primary.status) || !canMergeVyjazdStatus(secondary.status)) {
    throw new Error("Spojiť sa dajú len naplánované alebo prebiehajúce výjazdy.");
  }

  const mergedStops = mergeStopLists(primary.stops, secondary.stops);
  const primaryCode = vyjazdCode(primary.number);
  const secondaryCode = vyjazdCode(secondary.number);
  const day = now.slice(0, 10);

  let nextStatus: VyjazdStatus =
    primary.status === "prebieha" || secondary.status === "prebieha"
      ? "prebieha"
      : "naplanovany";
  nextStatus = statusAfterStopProgress(nextStatus, mergedStops);

  const mergedPrimary = syncLegacyVyjazdFields({
    ...primary,
    title: primary.title.trim() || secondary.title,
    description: mergeNarrative(primary.description, secondary.description),
    technician: pickMergeTechnician(primary.technician, secondary.technician),
    scheduledAt: pickMergeScheduledAt(primary.scheduledAt, secondary.scheduledAt),
    priority: pickMergePriority(primary.priority, secondary.priority),
    status: nextStatus,
    stops: mergedStops,
    result: appendNote(
      mergeNarrative(primary.result, secondary.result),
      `Spojené s ${secondaryCode} (${day}).`,
    ),
    updatedAt: now,
  });

  const cancelledSecondary: Vyjazd = {
    ...secondary,
    status: "zruseny",
    result: appendNote(secondary.result, `Spojené do ${primaryCode} (${day}).`),
    updatedAt: now,
  };

  return { primary: mergedPrimary, secondary: cancelledSecondary };
}
