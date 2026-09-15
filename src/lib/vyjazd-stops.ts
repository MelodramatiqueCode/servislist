import type {
  ServiceDevice,
  Vyjazd,
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
  const anyDone = stops.some((s) => s.done);
  if (anyDone && (current === "naplanovany" || current === "hotovy")) {
    return "prebieha";
  }
  if (!anyDone && current === "hotovy") return "prebieha";
  return current;
}

export function markStopsDone(stops: VyjazdStop[], done: boolean): VyjazdStop[] {
  return stops.map((stop) => ({ ...stop, done }));
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
