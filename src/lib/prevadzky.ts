import { deviceStoreLabel, prevadzkaKey } from "./vyjazd-stops";
import type { ServiceDevice, Ticket, Vyjazd } from "./types";

export type Prevadzka = {
  key: string;
  label: string;
  partner: string;
  city: string;
  address: string;
  phone: string;
  deviceCount: number;
  devices: Array<{
    uuid: string;
    name: string;
    code: string;
    isOnline: boolean;
  }>;
};

export function buildPrevadzky(devices: ServiceDevice[]): Prevadzka[] {
  const groups = new Map<string, ServiceDevice[]>();
  for (const device of devices) {
    const key = prevadzkaKey(device) || `device:${device.uuid}`;
    const list = groups.get(key);
    if (list) list.push(device);
    else groups.set(key, [device]);
  }

  return [...groups.entries()]
    .map(([key, list]) => {
      const primary = list[0];
      return {
        key,
        label: deviceStoreLabel(primary),
        partner: primary.partner,
        city: primary.city,
        address: primary.address,
        phone: primary.phone,
        deviceCount: list.length,
        devices: list.map((d) => ({
          uuid: d.uuid,
          name: d.name,
          code: d.code,
          isOnline: d.isOnline,
        })),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "sk"));
}

export function prevadzkaHaystack(input: {
  label?: string;
  partner?: string;
  city?: string;
  address?: string;
  phone?: string;
  code?: string;
  name?: string;
  customerName?: string;
  store?: string;
}) {
  return [
    input.label,
    input.partner,
    input.city,
    input.address,
    input.phone,
    input.code,
    input.name,
    input.customerName,
    input.store,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesPrevadzkaQuery(
  haystack: string,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack.includes(q);
}

export function findDevicesForPrevadzka(
  devices: ServiceDevice[],
  query: string,
): ServiceDevice[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return devices.filter((device) => {
    const key = prevadzkaKey(device);
    if (key && key.toLowerCase() === q) return true;
    return matchesPrevadzkaQuery(
      prevadzkaHaystack({
        label: deviceStoreLabel(device),
        partner: device.partner,
        city: device.city,
        address: device.address,
        phone: device.phone,
        code: device.code,
        name: device.name,
      }),
      q,
    );
  });
}

export function ticketMatchesPrevadzka(
  ticket: Ticket,
  query: string,
  devices: ServiceDevice[],
): boolean {
  const q = query.trim();
  if (!q) return true;
  if (
    matchesPrevadzkaQuery(
      prevadzkaHaystack({ customerName: ticket.customerName }),
      q,
    )
  ) {
    return true;
  }
  if (ticket.deviceUuid) {
    const device = devices.find((d) => d.uuid === ticket.deviceUuid);
    if (device) {
      return findDevicesForPrevadzka([device], q).length > 0;
    }
  }
  return findDevicesForPrevadzka(devices, q).some(
    (d) => d.uuid === ticket.deviceUuid,
  );
}

export function vyjazdMatchesPrevadzka(vyjazd: Vyjazd, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const hay = prevadzkaHaystack({
    store: vyjazd.store,
    address: vyjazd.address,
    label: vyjazd.title,
  });
  if (matchesPrevadzkaQuery(hay, q)) return true;
  return (vyjazd.stops ?? []).some((stop) =>
    matchesPrevadzkaQuery(
      prevadzkaHaystack({
        store: stop.store,
        address: stop.address,
      }),
      q,
    ),
  );
}
