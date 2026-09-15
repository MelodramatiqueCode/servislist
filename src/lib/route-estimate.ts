import { geocodeCandidates } from "./geocode-query";
import type { VyjazdRouteSummary, VyjazdStop } from "./types";
import { originQuery, stopMapsQuery } from "./vyjazd-stops";

export { geocodeCandidates };

const DEFAULT_OSRM = "https://router.project-osrm.org";
const DEFAULT_NOMINATIM = "https://nominatim.openstreetmap.org";
const DEFAULT_UA =
  "ServisList/1.0 (vyjazdy; https://github.com/MelodramatiqueCode/servislist)";
const GEOCODE_GAP_MS = 1100;
const REQUEST_TIMEOUT_MS = 8000;

type LatLon = { lat: number; lon: number };

const geocodeCache = new Map<string, LatLon | null>();

function envUrl(name: string, fallback: string) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  return raw.replace(/\/+$/, "");
}

function osmUserAgent() {
  return process.env.OSM_USER_AGENT?.trim() || DEFAULT_UA;
}

function nominatimBase() {
  return envUrl("NOMINATIM_URL", DEFAULT_NOMINATIM);
}

function osrmBase() {
  return envUrl("OSRM_URL", DEFAULT_OSRM);
}

function throttleNominatim() {
  try {
    const host = new URL(nominatimBase()).hostname;
    return (
      host === "nominatim.openstreetmap.org" ||
      host.endsWith(".openstreetmap.org")
    );
  } catch {
    return true;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "sk",
      "User-Agent": osmUserAgent(),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

export type RouteOrigin = {
  originAddress?: string;
  originLabel?: string;
} | string | null | undefined;

export function routeFingerprint(
  stops: Array<{ store?: string; address?: string }>,
  origin?: RouteOrigin,
) {
  const parts = stops
    .map((stop) => stopMapsQuery(stop).trim().toLowerCase())
    .filter(Boolean);
  const from =
    typeof origin === "string"
      ? origin.trim().toLowerCase()
      : originQuery(origin ?? undefined).toLowerCase();
  if (from) return [`origin:${from}`, ...parts].join(" → ");
  return parts.join(" → ");
}

export function mappedRouteStopCount(
  stops: Array<{ store?: string; address?: string }>,
) {
  return stops.filter((stop) => stopMapsQuery(stop).trim()).length;
}

export function mappedRoutePointCount(
  stops: Array<{ store?: string; address?: string }>,
  origin?: RouteOrigin,
) {
  const from =
    typeof origin === "string" ? origin.trim() : originQuery(origin ?? undefined);
  return (from ? 1 : 0) + mappedRouteStopCount(stops);
}

function errorSummary(
  fingerprint: string,
  computedAt: string,
  error?: string,
): VyjazdRouteSummary {
  return {
    status: "error",
    distanceMeters: 0,
    durationSeconds: 0,
    computedAt,
    fingerprint,
    error: error?.trim() || "Vzdialenosť sa nepodarilo spočítať",
  };
}

function stopErrorLabel(stop: { store?: string; address?: string }) {
  const store = (stop.store ?? "").trim();
  const address = (stop.address ?? "").trim();
  return store || address || "neznáma zastávka";
}

function geocodeFailMessage(
  kind: "origin" | "stop",
  label: string,
): string {
  const name = label.trim() || "neznáme miesto";
  if (kind === "origin") {
    return `Vzdialenosť sa nepodarilo spočítať. Nenašiel sa výstupný bod „${name}“.`;
  }
  return `Vzdialenosť sa nepodarilo spočítať. Nenašla sa zastávka „${name}“.`;
}

function incompleteSummary(
  fingerprint: string,
  computedAt: string,
): VyjazdRouteSummary {
  return {
    status: "incomplete",
    distanceMeters: 0,
    durationSeconds: 0,
    computedAt,
    fingerprint,
    error: "",
  };
}

let lastNominatimAt = 0;

async function geocodeOnce(query: string) {
  if (throttleNominatim()) {
    const wait = GEOCODE_GAP_MS - (Date.now() - lastNominatimAt);
    if (lastNominatimAt > 0 && wait > 0) await sleep(wait);
    lastNominatimAt = Date.now();
  }
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "1",
    addressdetails: "0",
    countrycodes: "sk",
  });
  const url = `${nominatimBase()}/search?${params.toString()}`;
  const data = await fetchJson(url);
  if (!Array.isArray(data) || data.length === 0) return null;
  const hit = data[0] as { lat?: string; lon?: string };
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function geocode(query: string): Promise<LatLon | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const key = `sk:${trimmed.toLowerCase()}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null;

  const point = await geocodeOnce(trimmed);

  if (point) {
    if (geocodeCache.size > 200) {
      const first = geocodeCache.keys().next().value;
      if (first) geocodeCache.delete(first);
    }
    geocodeCache.set(key, point);
  }
  return point;
}

async function geocodeStop(stop: { store?: string; address?: string }) {
  for (const query of geocodeCandidates(stop)) {
    const point = await geocode(query);
    if (point) return point;
  }
  return null;
}

async function osrmRoute(points: LatLon[]) {
  const path = points
    .map((point) => `${point.lon},${point.lat}`)
    .join(";");
  const params = new URLSearchParams({
    overview: "false",
    geometries: "geojson",
    steps: "false",
  });
  const url = `${osrmBase()}/route/v1/driving/${path}?${params.toString()}`;
  const data = await fetchJson(url);
  if (!data || typeof data !== "object") return null;
  const payload = data as {
    code?: string;
    routes?: Array<{ distance?: number; duration?: number }>;
  };
  if (payload.code && payload.code !== "Ok") return null;
  const route = payload.routes?.[0];
  const distance = Number(route?.distance);
  const duration = Number(route?.duration);
  if (!Number.isFinite(distance) || !Number.isFinite(duration)) return null;
  if (distance < 0 || duration < 0) return null;
  return { distance, duration };
}

/**
 * Odhad jazdy po poradí zastávok: Nominatim (geocode) + OSRM (route).
 * Nikdy nehodí výnimku — pri výpadku vráti status error.
 */
export async function estimateDrivingRoute(
  stops: Array<{ store?: string; address?: string }>,
  origin?: RouteOrigin,
): Promise<VyjazdRouteSummary> {
  const computedAt = new Date().toISOString();
  const fingerprint = routeFingerprint(stops, origin);
  const mapped = stops.filter((stop) => stopMapsQuery(stop).trim());
  const originMeta =
    typeof origin === "string"
      ? { originAddress: origin, originLabel: "" }
      : origin ?? undefined;
  const from = originQuery(originMeta);

  if (mappedRoutePointCount(mapped, originMeta) < 2) {
    return incompleteSummary(fingerprint, computedAt);
  }

  try {
    const points: LatLon[] = [];
    if (from) {
      const originPoint = await geocodeStop({
        store: originMeta?.originLabel ?? "",
        address: originMeta?.originAddress || from,
      });
      if (!originPoint) {
        return errorSummary(
          fingerprint,
          computedAt,
          geocodeFailMessage("origin", originMeta?.originLabel || from),
        );
      }
      points.push(originPoint);
    }
    for (const stop of mapped) {
      const point = await geocodeStop(stop);
      if (!point) {
        return errorSummary(
          fingerprint,
          computedAt,
          geocodeFailMessage("stop", stopErrorLabel(stop)),
        );
      }
      points.push(point);
    }
    const route = await osrmRoute(points);
    if (!route) {
      return errorSummary(
        fingerprint,
        computedAt,
        "Vzdialenosť sa nepodarilo spočítať. Trasovanie cesty zlyhalo.",
      );
    }
    return {
      status: "ok",
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      computedAt,
      fingerprint,
      error: "",
    };
  } catch {
    return errorSummary(fingerprint, computedAt);
  }
}

export function formatRouteDistance(meters: number) {
  if (!Number.isFinite(meters) || meters < 0) return "";
  if (meters < 950) {
    return `${Math.max(1, Math.round(meters || 1))} m`;
  }
  const km = meters / 1000;
  const digits = km < 10 ? 1 : 0;
  return `${new Intl.NumberFormat("sk-SK", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(km)} km`;
}

export function formatRouteDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const totalMin = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

export function formatRouteLabel(route: VyjazdRouteSummary) {
  if (route.status !== "ok") return "";
  const distance = formatRouteDistance(route.distanceMeters);
  const duration = formatRouteDuration(route.durationSeconds);
  if (!distance || !duration) return "";
  return `Trasa ~${distance} · ~${duration}`;
}

export function liveRouteLabel(v: {
  stops?: VyjazdStop[];
  route?: VyjazdRouteSummary | null;
  originAddress?: string;
  originLabel?: string;
}) {
  const route = v.route;
  if (!route || route.status !== "ok") return null;
  if (route.fingerprint !== routeFingerprint(v.stops ?? [], v)) return null;
  const label = formatRouteLabel(route);
  return label || null;
}

export function liveRouteError(v: {
  stops?: VyjazdStop[];
  route?: VyjazdRouteSummary | null;
  originAddress?: string;
  originLabel?: string;
}) {
  const route = v.route;
  if (!route || route.status !== "error") return null;
  if (route.fingerprint !== routeFingerprint(v.stops ?? [], v)) return null;
  return route.error || "Vzdialenosť sa nepodarilo spočítať";
}

