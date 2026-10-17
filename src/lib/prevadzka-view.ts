import { formatDate } from "./format";
import { listMaterial } from "./material-store";
import { materialTotal } from "./material";
import {
  formatOpeningHours,
  profileCompleteness,
  type PrevadzkaRecord,
} from "./prevadzka-profile";
import {
  listMergedVykaz,
  listPrevadzkaDeviceUuids,
  listPrevadzkaHistory,
  listProfileSuggestions,
  storeLabel,
} from "./prevadzka-store";
import {
  devicesForPrevadzka,
  listDeviceAlertEvents,
  listTickets,
  listVyjazdy,
} from "./store";
import type { ServiceDevice, Ticket, Vyjazd } from "./types";
import { VYKAZ_TYPE_LABELS, type VykazEntry } from "./vykaz-prace";

const OPEN = new Set(["otvorene", "v_rieseni", "caka_diely"]);

export function mapsHref(store: PrevadzkaRecord) {
  if (store.gpsLat.trim() && store.gpsLng.trim()) {
    return `https://maps.google.com/?q=${encodeURIComponent(
      `${store.gpsLat},${store.gpsLng}`,
    )}`;
  }
  const q = [store.address, store.city].filter(Boolean).join(", ");
  return q ? `https://maps.google.com/?q=${encodeURIComponent(q)}` : "";
}

export function serializeVykaz(entry: VykazEntry) {
  return {
    id: entry.id,
    prevadzkaId: entry.prevadzkaId,
    date: entry.date,
    type: entry.type,
    typeLabel: VYKAZ_TYPE_LABELS[entry.type],
    author: entry.author,
    description: entry.description,
    durationMin: entry.durationMin,
    ticketId: entry.ticketId,
    vyjazdId: entry.vyjazdId,
    source: entry.source,
    createdAt: entry.createdAt,
  };
}

export async function loadPrevadzkaDetail(
  store: PrevadzkaRecord,
  opts?: { vykazType?: string },
) {
  const [linkedUuids, devices, tickets, vyjazdy, suggestions, history, material] =
    await Promise.all([
      listPrevadzkaDeviceUuids(store.id),
      devicesForPrevadzka(store),
      listTickets({ archived: "all" }),
      listVyjazdy(),
      listProfileSuggestions(store.id, "pending"),
      listPrevadzkaHistory(store.id),
      listMaterial({ prevadzkaId: store.id }),
    ]);
  const uuidSet = new Set(devices.map((d) => d.uuid));
  const storeTickets = tickets.filter((t) => matchesStoreTicket(t, store, uuidSet));
  const storeVyjazdy = vyjazdy.filter((v) => matchesStoreVyjazd(v, store, uuidSet));
  const openTickets = storeTickets.filter((t) => OPEN.has(t.status) && !t.archivedAt);
  const lastVyjazd = [...storeVyjazdy].sort((a, b) =>
    (b.scheduledAt || b.updatedAt).localeCompare(a.scheduledAt || a.updatedAt),
  )[0];
  const events = (
    await Promise.all(devices.map((d) => listDeviceAlertEvents(d.uuid, 30)))
  ).flat();
  const vykaz = await listMergedVykaz(
    store,
    storeTickets,
    storeVyjazdy,
    [...uuidSet, ...linkedUuids],
    opts?.vykazType,
  );
  const completeness = profileCompleteness(store);
  return {
    store,
    label: storeLabel(store),
    hoursLabel: formatOpeningHours(store.openingHours),
    mapsHref: mapsHref(store),
    devices,
    tickets: storeTickets,
    openTickets,
    vyjazdy: storeVyjazdy,
    lastVyjazd: lastVyjazd ?? null,
    outages30: events.length,
    events,
    suggestions,
    history,
    material,
    materialTotal: materialTotal(material),
    vykaz,
    completeness,
    online: devices.filter((d) => d.isOnline).length,
  };
}

function matchesStoreTicket(
  ticket: Ticket,
  store: PrevadzkaRecord,
  uuids: Set<string>,
) {
  if (ticket.prevadzkaId && ticket.prevadzkaId === store.id) return true;
  if (ticket.deviceUuid && uuids.has(ticket.deviceUuid)) return true;
  const hay = ticket.customerName.toLowerCase();
  return Boolean(
    (store.code && hay.includes(store.code.toLowerCase())) ||
      (store.city &&
        hay.includes(store.city.toLowerCase()) &&
        store.chain &&
        hay.includes(store.chain.toLowerCase())),
  );
}

function matchesStoreVyjazd(
  vyjazd: Vyjazd,
  store: PrevadzkaRecord,
  uuids: Set<string>,
) {
  if (vyjazd.deviceUuid && uuids.has(vyjazd.deviceUuid)) return true;
  if ((vyjazd.stops ?? []).some((s) => s.deviceUuid && uuids.has(s.deviceUuid))) {
    return true;
  }
  const hay = `${vyjazd.store} ${vyjazd.address} ${vyjazd.title}`.toLowerCase();
  return Boolean(
    (store.city && hay.includes(store.city.toLowerCase())) ||
      (store.code && hay.includes(store.code.toLowerCase())) ||
      (store.address && hay.includes(store.address.toLowerCase())),
  );
}

export function deviceSnapshot(device: ServiceDevice) {
  return {
    uuid: device.uuid,
    name: device.name,
    code: device.code,
    isOnline: device.isOnline,
    deviceType: device.deviceType,
    osVersion: device.osVersion,
    supervisorVersion: device.supervisorVersion,
    ipAddress: device.ipAddress,
    isUndervolted: device.isUndervolted,
    lastConnectivityEvent: device.lastConnectivityEvent,
  };
}

export function formatDay(iso: string) {
  if (!iso) return "—";
  try {
    return formatDate(iso).split(" ")[0] ?? formatDate(iso);
  } catch {
    return iso;
  }
}
