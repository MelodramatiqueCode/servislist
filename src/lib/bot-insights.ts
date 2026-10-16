import { getAlertConfig } from "./alert-config";
import { countFlapEvents } from "./alert-policy";
import { deviceEventCounts } from "./alert-state";
import { TICKET_ALERT_LABELS } from "./alerts";
import { ApiError, queryString } from "./api-http";
import { ticketCode } from "./format";
import {
  matchesPrevadzkaQuery,
  prevadzkaHaystack,
  ticketMatchesPrevadzka,
} from "./prevadzky";
import { getDevice, listDeviceAlertEvents, listDevices, listTickets } from "./store";
import type { DeviceEvent, ServiceDevice, Ticket, TicketStatus } from "./types";
import { STATUS_LABELS } from "./types";
import { isTicketArchived, parseArchivedQuery } from "./ticket-archive";
import { deviceStoreLabel, prevadzkaKey } from "./vyjazd-stops";

const OPEN_STATUSES: TicketStatus[] = ["otvorene", "v_rieseni", "caka_diely"];

export function serializeDeviceEvent(event: DeviceEvent) {
  return {
    id: event.id,
    deviceUuid: event.deviceUuid,
    alertType: event.alertType,
    alertLabel: TICKET_ALERT_LABELS[event.alertType] ?? event.alertType,
    startedAt: event.startedAt,
    endedAt: event.endedAt,
    durationSeconds: event.durationSeconds,
    outcome: event.outcome,
    ticketId: event.ticketId || "",
  };
}

export function serializeOpenTicket(ticket: Ticket) {
  return {
    id: ticket.id,
    number: ticket.number,
    code: ticketCode(ticket.number),
    title: ticket.title,
    status: ticket.status,
    statusLabel: STATUS_LABELS[ticket.status],
    priority: ticket.priority,
    customerName: ticket.customerName,
    deviceUuid: ticket.deviceUuid || "",
    alertType: ticket.alertType,
    source: ticket.source ?? "manual",
    archivedAt: ticket.archivedAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

export type TicketLocation = {
  key: string;
  label: string;
  partner: string;
  city: string;
  address: string;
  region: string;
};

export function locationForTicket(
  ticket: Ticket,
  devices: ServiceDevice[],
): TicketLocation {
  const device = ticket.deviceUuid
    ? devices.find((d) => d.uuid === ticket.deviceUuid)
    : undefined;
  if (device) {
    return {
      key: prevadzkaKey(device) || `device:${device.uuid}`,
      label: deviceStoreLabel(device),
      partner: device.partner,
      city: device.city,
      address: device.address,
      region: device.city || device.partner || deviceStoreLabel(device),
    };
  }
  const label = ticket.customerName.trim() || "Neznáma prevádzka";
  return {
    key: `ticket:${ticket.id}`,
    label,
    partner: "",
    city: "",
    address: "",
    region: label,
  };
}

export function groupOpenTicketsByLocation(
  tickets: Ticket[],
  devices: ServiceDevice[],
  filters?: { prevadzka?: string; region?: string },
) {
  const prevadzka = filters?.prevadzka?.trim() ?? "";
  const region = filters?.region?.trim() ?? "";
  const open = tickets.filter(
    (t) =>
      OPEN_STATUSES.includes(t.status as TicketStatus) && !isTicketArchived(t),
  );

  const groups = new Map<
    string,
    TicketLocation & { tickets: Ticket[]; deviceUuids: Set<string> }
  >();

  for (const ticket of open) {
    if (prevadzka && !ticketMatchesPrevadzka(ticket, prevadzka, devices)) {
      continue;
    }
    const loc = locationForTicket(ticket, devices);
    if (
      region &&
      !matchesPrevadzkaQuery(
        prevadzkaHaystack({
          city: loc.city,
          partner: loc.partner,
          label: loc.label,
          customerName: loc.region,
        }),
        region,
      )
    ) {
      continue;
    }
    const row = groups.get(loc.key) ?? {
      ...loc,
      tickets: [],
      deviceUuids: new Set<string>(),
    };
    row.tickets.push(ticket);
    if (ticket.deviceUuid) row.deviceUuids.add(ticket.deviceUuid);
    groups.set(loc.key, row);
  }

  return [...groups.values()]
    .map((group) => ({
      key: group.key,
      label: group.label,
      partner: group.partner,
      city: group.city,
      address: group.address,
      region: group.region,
      openCount: group.tickets.length,
      deviceCount: group.deviceUuids.size,
      tickets: group.tickets
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(serializeOpenTicket),
    }))
    .sort((a, b) => b.openCount - a.openCount || a.label.localeCompare(b.label, "sk"));
}

export async function botDeviceEventHistory(uuid: string, daysRaw?: string) {
  const device = await getDevice(uuid.trim());
  if (!device) {
    throw new ApiError(404, "not_found", `Zariadenie „${uuid}“ sa nenašlo.`);
  }
  const config = getAlertConfig();
  const days = Math.min(
    90,
    Math.max(1, Number.parseInt(daysRaw || "", 10) || config.flapWindowDays),
  );
  const events = await listDeviceAlertEvents(device.uuid, days);
  const counts = deviceEventCounts(events, days);
  const shortOffline = countFlapEvents(
    events,
    device.uuid,
    new Date(),
    days,
  );

  return {
    device: {
      uuid: device.uuid,
      code: device.code,
      name: device.name,
      partner: device.partner,
      city: device.city,
      address: device.address,
      prevadzka: deviceStoreLabel(device),
      prevadzkaKey: prevadzkaKey(device),
      isOnline: device.isOnline,
    },
    days,
    counts: {
      offline: counts.offline ?? 0,
      hot: counts.hot ?? 0,
      undervolt: counts.undervolt ?? 0,
      disk: counts.disk ?? 0,
      vpn_down: counts.vpn_down ?? 0,
    },
    flap: {
      shortOffline,
      windowDays: days,
      minCount: config.flapMinCount,
      repeatedOutage: shortOffline >= config.flapMinCount,
    },
    events: events.map(serializeDeviceEvent),
  };
}

export async function botOpenTicketsByLocation(url: URL) {
  const archived = parseArchivedQuery(
    queryString(url, "archiv", "archived", "archive"),
  );
  const [tickets, devices] = await Promise.all([
    listTickets({ archived }),
    listDevices(),
  ]);
  const groups = groupOpenTicketsByLocation(tickets, devices, {
    prevadzka: queryString(url, "prevadzka", "store"),
    region: queryString(url, "region", "kraj", "mesto", "city"),
  });
  return {
    count: groups.length,
    openTickets: groups.reduce((sum, g) => sum + g.openCount, 0),
    groups,
  };
}
