import { getAlertConfig } from "./alert-config";
import { isTestDevice, offlineDays } from "./alert-suppress";
import { ticketCode, vyjazdCode } from "./format";
import { isLongOfflineDevice } from "./parse-device";
import { deviceStoreLabel, prevadzkaKey } from "./vyjazd-stops";
import type {
  ServiceDevice,
  Ticket,
  TicketNote,
  Vyjazd,
} from "./types";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  VYJAZD_STATUS_LABELS,
} from "./types";
import type { Prevadzka } from "./prevadzky";
import { formatOpeningHours, profileCompleteness, type PrevadzkaRecord } from "./prevadzka-profile";
import { storeLabel } from "./prevadzka-store";
import type { MaterialItem } from "./material";
import { serializeMaterial } from "./material-store";
import type { VykazEntry } from "./vykaz-prace";
import { deviceSnapshot, serializeVykaz } from "./prevadzka-view";

export function serializeNote(note: TicketNote) {
  return {
    id: note.id,
    text: note.text,
    author: note.author,
    createdAt: note.createdAt,
    clientRef: note.clientRef || undefined,
  };
}

export function serializeTicket(ticket: Ticket) {
  return {
    id: ticket.id,
    number: ticket.number,
    code: ticketCode(ticket.number),
    title: ticket.title,
    description: ticket.description,
    deviceType: ticket.deviceType,
    deviceSerial: ticket.deviceSerial,
    deviceUuid: ticket.deviceUuid || "",
    customerName: ticket.customerName,
    customerPhone: ticket.customerPhone,
    assignedTo: ticket.assignedTo,
    status: ticket.status,
    statusLabel: STATUS_LABELS[ticket.status],
    priority: ticket.priority,
    priorityLabel: PRIORITY_LABELS[ticket.priority],
    notes: ticket.notes.map(serializeNote),
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    source: ticket.source ?? "manual",
    alertType: ticket.alertType,
    archivedAt: ticket.archivedAt,
    clientRef: ticket.clientRef || undefined,
    prevadzkaId: ticket.prevadzkaId || "",
    kind: ticket.kind || "",
  };
}

export function serializeVyjazd(vyjazd: Vyjazd) {
  return {
    id: vyjazd.id,
    number: vyjazd.number,
    code: vyjazdCode(vyjazd.number),
    title: vyjazd.title,
    store: vyjazd.store,
    address: vyjazd.address,
    contactPhone: vyjazd.contactPhone,
    technician: vyjazd.technician,
    scheduledAt: vyjazd.scheduledAt,
    status: vyjazd.status,
    statusLabel: VYJAZD_STATUS_LABELS[vyjazd.status],
    priority: vyjazd.priority,
    priorityLabel: PRIORITY_LABELS[vyjazd.priority],
    deviceUuid: vyjazd.deviceUuid || "",
    ticketId: vyjazd.ticketId || "",
    description: vyjazd.description,
    result: vyjazd.result,
    stops: vyjazd.stops,
    originLabel: vyjazd.originLabel,
    originAddress: vyjazd.originAddress,
    createdAt: vyjazd.createdAt,
    updatedAt: vyjazd.updatedAt,
  };
}

function roundDays(days: number | null) {
  return days == null ? null : Math.floor(days * 10) / 10;
}

export function serializeDevice(device: ServiceDevice) {
  return {
    uuid: device.uuid,
    name: device.name,
    code: device.code,
    partner: device.partner,
    city: device.city,
    address: device.address,
    phone: device.phone,
    prevadzka: deviceStoreLabel(device),
    prevadzkaKey: prevadzkaKey(device),
    status: device.status,
    overallStatus: device.overallStatus,
    isOnline: device.isOnline,
    isConnectedToVpn: device.isConnectedToVpn,
    deviceType: device.deviceType,
    fleet: device.fleet,
    dashboardUrl: device.dashboardUrl,
    lastSyncedAt: device.lastSyncedAt || "",
    lastConnectivityEvent: device.lastConnectivityEvent || "",
    offlineDays: roundDays(offlineDays(device, new Date())),
    longOffline: isLongOfflineDevice(device),
    testDevice: isTestDevice(device, getAlertConfig().ignoreDevices),
    note: device.note,
  };
}

export function serializePrevadzka(prevadzka: Prevadzka) {
  return prevadzka;
}

export function serializePrevadzkaProfile(
  store: PrevadzkaRecord,
  extras?: {
    devices?: ServiceDevice[];
    vykaz?: VykazEntry[];
    material?: MaterialItem[];
    pending?: boolean;
  },
) {
  const completeness = profileCompleteness(store);
  return {
    id: store.id,
    key: store.storeKey,
    label: storeLabel(store),
    partner: store.chain,
    chain: store.chain,
    code: store.code,
    storeType: store.storeType,
    name: store.name,
    city: store.city,
    address: store.address,
    phone: store.phone,
    gpsLat: store.gpsLat,
    gpsLng: store.gpsLng,
    openingHours: store.openingHours,
    openingHoursLabel: formatOpeningHours(store.openingHours),
    profile: store.profile,
    status: store.status,
    jobType: store.jobType,
    deviceCount: extras?.devices?.length ?? 0,
    devices: (extras?.devices ?? []).map(deviceSnapshot),
    vykaz: (extras?.vykaz ?? []).map(serializeVykaz),
    material: (extras?.material ?? []).map(serializeMaterial),
    completeness,
    createdAt: store.createdAt,
    updatedAt: store.updatedAt,
    pending: extras?.pending ?? store.status === "pending",
  };
}

export function serializeVyjazdSummary(vyjazd: Vyjazd) {
  return {
    id: vyjazd.id,
    number: vyjazd.number,
    code: vyjazdCode(vyjazd.number),
    title: vyjazd.title,
    status: vyjazd.status,
    statusLabel: VYJAZD_STATUS_LABELS[vyjazd.status],
    store: vyjazd.store,
    scheduledAt: vyjazd.scheduledAt,
  };
}
