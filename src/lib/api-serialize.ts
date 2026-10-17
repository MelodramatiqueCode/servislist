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
