import { mapsHref } from "./prevadzka-view";
import type { PrevadzkaRecord } from "./prevadzka-profile";
import { storeLabel } from "./prevadzka-store";
import type { ServiceDevice, Ticket } from "./types";

export function findTicketStore(
  ticket: Ticket,
  stores: PrevadzkaRecord[],
  devices: ServiceDevice[],
) {
  if (ticket.prevadzkaId) {
    const hit = stores.find((s) => s.id === ticket.prevadzkaId);
    if (hit) return hit;
  }
  if (ticket.deviceUuid) {
    const device = devices.find((d) => d.uuid === ticket.deviceUuid);
    if (device) {
      const byDevice = stores.find(
        (s) =>
          s.code === device.code ||
          (s.city && s.city === device.city && s.address && s.address === device.address),
      );
      if (byDevice) return byDevice;
    }
  }
  return null;
}

export function ticketStoreLabel(
  ticket: Ticket,
  store: PrevadzkaRecord | null,
) {
  if (store) return storeLabel(store);
  return ticket.customerName || ticket.title;
}

export function ticketCallPhone(
  ticket: Ticket,
  store: PrevadzkaRecord | null,
) {
  const contact =
    store?.profile.contacts.find((c) => c.callBeforeVisit && c.phone) ||
    store?.profile.contacts.find((c) => c.phone);
  return contact?.phone || store?.phone || ticket.customerPhone || "";
}

export function ticketMapsHref(
  ticket: Ticket,
  store: PrevadzkaRecord | null,
  devices: ServiceDevice[],
) {
  if (store) return mapsHref(store);
  const device = ticket.deviceUuid
    ? devices.find((d) => d.uuid === ticket.deviceUuid)
    : null;
  const q = [device?.address || ticket.customerName, device?.city]
    .filter(Boolean)
    .join(", ");
  return q ? `https://maps.google.com/?q=${encodeURIComponent(q)}` : "";
}

export function ticketRegion(
  ticket: Ticket,
  store: PrevadzkaRecord | null,
  devices: ServiceDevice[],
) {
  if (store?.city.trim()) return store.city.trim();
  const device = ticket.deviceUuid
    ? devices.find((d) => d.uuid === ticket.deviceUuid)
    : null;
  return device?.city.trim() || "";
}
