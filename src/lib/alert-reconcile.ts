import { randomUUID } from "crypto";
import type { AlertConfig } from "./alert-config";
import { isWithinStoreHours } from "./alert-hours";
import {
  canConfirmAlert,
  countFlapEvents,
  eventDurationSeconds,
  isPhysicallyActive,
  shouldJoinMass,
} from "./alert-policy";
import {
  findHandledArchivedTicket,
  isLongOffline,
  isTestDevice,
} from "./alert-suppress";
import {
  ALERT_LABELS,
  ALERT_TYPES,
  activationNote,
  alertPriority,
  buildAlertTicket,
  buildFlapTicket,
  buildMassOfflineTicket,
  recoveryNote,
  type AlertType,
} from "./alerts";
import type {
  AlertPending,
  DeviceEvent,
  DeviceEventOutcome,
  MassIncidentState,
  ServiceDevice,
  Ticket,
  TicketNote,
  TicketPriority,
  TicketStore,
} from "./types";

const OPEN_STATUSES = ["otvorene", "v_rieseni", "caka_diely"] as const;

const PRIORITY_RANK: Record<TicketPriority, number> = {
  nizka: 0,
  normalna: 1,
  vysoka: 2,
  urgentna: 3,
};

function autoNote(text: string, createdAt: string): TicketNote {
  return { id: randomUUID(), text, author: "Automat", createdAt };
}

function pendingKey(uuid: string, type: AlertType) {
  return `${uuid}:${type}`;
}

function findOpenAutoTicket(store: TicketStore, deviceUuid: string) {
  if (!deviceUuid) return undefined;
  return store.tickets.find(
    (t) =>
      t.source === "auto" &&
      !t.archivedAt &&
      t.deviceUuid === deviceUuid &&
      OPEN_STATUSES.includes(t.status as (typeof OPEN_STATUSES)[number]) &&
      t.alertType !== "mass_offline",
  );
}

function findOpenMassTicket(store: TicketStore, ticketId?: string) {
  return store.tickets.find(
    (t) =>
      t.source === "auto" &&
      !t.archivedAt &&
      t.alertType === "mass_offline" &&
      OPEN_STATUSES.includes(t.status as (typeof OPEN_STATUSES)[number]) &&
      (!ticketId || t.id === ticketId),
  );
}

type AlertTicketInput =
  | ReturnType<typeof buildAlertTicket>
  | ReturnType<typeof buildMassOfflineTicket>
  | ReturnType<typeof buildFlapTicket>;

function pushTicket(store: TicketStore, input: AlertTicketInput, timestamp: string, extras?: Partial<Ticket>) {
  const ticket: Ticket = {
    id: randomUUID(),
    number: store.nextNumber,
    title: input.title,
    description: input.description,
    deviceType: input.deviceType,
    deviceSerial: input.deviceSerial,
    deviceUuid: input.deviceUuid,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    assignedTo: input.assignedTo,
    status: "otvorene",
    priority: input.priority,
    notes: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    source: input.source,
    alertType: input.alertType,
    ...extras,
  };
  store.nextNumber += 1;
  store.tickets.unshift(ticket);
  return ticket;
}

function endEvent(
  event: DeviceEvent,
  endedAt: string,
  outcome: DeviceEventOutcome,
  ticketId = "",
) {
  event.endedAt = endedAt;
  event.durationSeconds = eventDurationSeconds(event.startedAt, endedAt);
  event.outcome = outcome;
  if (ticketId) event.ticketId = ticketId;
}

export type ReconcileInput = {
  previous: ServiceDevice[];
  current: ServiceDevice[];
  tickets: TicketStore;
  pending: AlertPending[];
  events: DeviceEvent[];
  mass: MassIncidentState | null;
  config: AlertConfig;
  now: Date;
};

export type ReconcileResult = {
  tickets: TicketStore;
  pending: AlertPending[];
  events: DeviceEvent[];
  mass: MassIncidentState | null;
  created: number;
  resolved: number;
};

export function reconcileAlerts(input: ReconcileInput): ReconcileResult {
  const { previous, current, config, now } = input;
  const timestamp = now.toISOString();
  const tickets = input.tickets;
  const pendingMap = new Map(
    input.pending.map((p) => [pendingKey(p.deviceUuid, p.alertType as AlertType), p]),
  );
  const eventsById = new Map(input.events.map((e) => [e.id, { ...e }]));
  const prevMap = new Map(previous.map((d) => [d.uuid, d]));
  const dirtyEventIds = new Set<string>();

  let created = 0;
  let resolved = 0;
  let mass = input.mass
    ? { ...input.mass, deviceUuids: [...input.mass.deviceUuids] }
    : null;
  const massTicket = mass ? findOpenMassTicket(tickets, mass.ticketId) : findOpenMassTicket(tickets);
  if (mass && !massTicket) mass = null;

  const touchEvent = (event: DeviceEvent) => {
    eventsById.set(event.id, event);
    dirtyEventIds.add(event.id);
  };

  const getEvent = (id: string) => eventsById.get(id);

  const confirmOnTicket = (
    device: ServiceDevice,
    type: AlertType,
    pending: AlertPending,
  ) => {
    const event = getEvent(pending.eventId);
    let open = findOpenAutoTicket(tickets, device.uuid);
    if (!open) {
      const inputTicket = buildAlertTicket(device, type);
      const others = ALERT_TYPES.filter(
        (t) =>
          t !== type &&
          isPhysicallyActive(device, t, {
            config,
            pending: pendingMap.get(pendingKey(device.uuid, t)) ?? null,
            hasOpenHotTicket: false,
          }),
      );
      open = pushTicket(tickets, inputTicket, timestamp);
      if (others.length > 0) {
        open.notes.push(
          autoNote(
            `Pri vytvorení ticketu boli aktívne aj: ${others
              .map((t) => ALERT_LABELS[t])
              .join(", ")}.`,
            timestamp,
          ),
        );
      }
      created += 1;
    } else {
      open.notes.push(autoNote(activationNote(type, device), timestamp));
      if (PRIORITY_RANK[alertPriority(type)] > PRIORITY_RANK[open.priority]) {
        open.priority = alertPriority(type);
        open.alertType = type;
      }
      open.updatedAt = timestamp;
    }
    if (event) {
      event.outcome = "ticketed";
      event.ticketId = open.id;
      touchEvent(event);
    }
    return open;
  };

  const offlineConfirm: Array<{ device: ServiceDevice; pending: AlertPending }> =
    [];
  const newlyShort = new Set<string>();

  const allEvents = () => [...eventsById.values()];

  const ignoredUuids = new Set<string>();
  const longOfflineUuids = new Set<string>();

  for (const device of current) {
    const prev = prevMap.get(device.uuid);
    const openExisting = findOpenAutoTicket(tickets, device.uuid);

    if (isTestDevice(device, config.ignoreDevices)) {
      // Testovacie zariadenie: žiadne auto tickety, rozpracované epizódy zahoď.
      ignoredUuids.add(device.uuid);
      for (const type of ALERT_TYPES) {
        const key = pendingKey(device.uuid, type);
        const pending = pendingMap.get(key);
        if (!pending) continue;
        const event = getEvent(pending.eventId);
        if (event && !event.endedAt) {
          endEvent(event, timestamp, "ignored");
          touchEvent(event);
        }
        pendingMap.delete(key);
      }
      continue;
    }

    const longOffline =
      !device.isOnline && isLongOffline(device, now, config.longOfflineDays);
    if (longOffline) longOfflineUuids.add(device.uuid);

    for (const type of ALERT_TYPES) {
      const key = pendingKey(device.uuid, type);
      const pending = pendingMap.get(key) ?? null;
      const ctx = {
        now,
        config,
        pending,
        hasOpenHotTicket: openExisting?.alertType === "hot",
      };
      const active = isPhysicallyActive(device, type, ctx);
      const wasActive = prev
        ? isPhysicallyActive(prev, type, {
            config,
            pending,
            hasOpenHotTicket: ctx.hasOpenHotTicket,
          })
        : false;

      if (active) {
        let row = pending;
        if (!row) {
          const event: DeviceEvent = {
            id: randomUUID(),
            deviceUuid: device.uuid,
            alertType: type,
            startedAt: timestamp,
            endedAt: null,
            durationSeconds: null,
            outcome: "open",
            ticketId: "",
            note: "",
          };
          touchEvent(event);
          const inHours =
            type !== "offline" || isWithinStoreHours(now, device, config);
          row = {
            deviceUuid: device.uuid,
            alertType: type,
            firstSeenAt: timestamp,
            lastSeenAt: timestamp,
            inHoursSince: inHours ? timestamp : null,
            eventId: event.id,
          };
          pendingMap.set(key, row);
        } else {
          row.lastSeenAt = timestamp;
          if (type === "offline") {
            const inHours = isWithinStoreHours(now, device, config);
            if (inHours && !row.inHoursSince) row.inHoursSince = timestamp;
            if (!inHours) row.inHoursSince = null;
          }
        }

        const event = getEvent(row.eventId);
        const alreadyRaised =
          event?.outcome === "ticketed" || event?.outcome === "mass";
        const decision = canConfirmAlert(type, device, {
          now,
          config,
          pending: row,
          hasOpenHotTicket: ctx.hasOpenHotTicket,
        });
        const alreadyHandled =
          alreadyRaised ||
          event?.outcome === "archived" ||
          event?.outcome === "long_offline";
        if (decision.confirm && !alreadyHandled) {
          if (longOffline) {
            // Dlhodobo offline (Balena last-seen > N dní): bez ticketu, len prehľad.
            if (event) {
              event.outcome = "long_offline";
              touchEvent(event);
            }
            continue;
          }
          const handled = findHandledArchivedTicket(
            tickets.tickets,
            device,
            type,
            allEvents(),
          );
          if (handled) {
            // Ten istý incident už mal ticket, ktorý bol archivovaný — nevytváraj znova.
            if (event) {
              event.outcome = "archived";
              event.ticketId = handled.id;
              touchEvent(event);
            }
            continue;
          }
          if (type === "offline") offlineConfirm.push({ device, pending: row });
          else confirmOnTicket(device, type, row);
        }
      } else if (pending) {
        const event = getEvent(pending.eventId);
        const inHours = isWithinStoreHours(now, device, config);
        let outcome: DeviceEventOutcome = "short";
        if (
          event?.outcome === "ticketed" ||
          event?.outcome === "mass" ||
          event?.outcome === "archived"
        ) {
          outcome = "recovered";
        } else if (event?.outcome === "long_offline") {
          outcome = "long_offline";
        } else if (
          pending.alertType === "offline" &&
          !inHours &&
          !pending.inHoursSince
        ) {
          outcome = "outside_hours";
        }
        if (event) {
          endEvent(event, timestamp, outcome);
          touchEvent(event);
        }
        if (outcome === "short") newlyShort.add(device.uuid);
        pendingMap.delete(key);

        const open = findOpenAutoTicket(tickets, device.uuid);
        if (open && (wasActive || open.alertType === type)) {
          open.notes.push(autoNote(recoveryNote(type, device), timestamp));
          open.updatedAt = timestamp;
          resolved += 1;
          const stillActive = ALERT_TYPES.some((t) =>
            isPhysicallyActive(device, t, {
              config,
              pending: pendingMap.get(pendingKey(device.uuid, t)) ?? null,
              hasOpenHotTicket: open.alertType === "hot",
            }),
          );
          if (!stillActive && config.autoClose && open.alertType !== "flap") {
            open.status = "hotove";
          }
        }
      }
    }
  }

  const freshOffline = current.filter((device) => {
    const pending = pendingMap.get(pendingKey(device.uuid, "offline"));
    if (ignoredUuids.has(device.uuid) || longOfflineUuids.has(device.uuid)) {
      return false;
    }
    const pendingEvent = pending ? getEvent(pending.eventId) : undefined;
    if (
      pendingEvent?.outcome === "archived" ||
      pendingEvent?.outcome === "long_offline"
    ) {
      return false;
    }
    return Boolean(
      pending &&
        shouldJoinMass(pending.firstSeenAt, now, config.massWindowMinutes) &&
        isWithinStoreHours(now, device, config),
    );
  });

  const massOpen = massTicket ?? null;
  const canExtendMass =
    Boolean(massOpen) &&
    mass != null &&
    shouldJoinMass(mass.startedAt, now, config.massWindowMinutes);

  if (!massOpen && freshOffline.length >= config.massMinDevices) {
    const inputTicket = buildMassOfflineTicket(freshOffline, timestamp);
    const ticket = pushTicket(tickets, inputTicket, timestamp);
    created += 1;
    mass = {
      ticketId: ticket.id,
      startedAt: timestamp,
      deviceUuids: freshOffline.map((d) => d.uuid),
    };
    for (const device of freshOffline) {
      const pending = pendingMap.get(pendingKey(device.uuid, "offline"));
      const event = pending ? getEvent(pending.eventId) : undefined;
      if (event) {
        event.outcome = "mass";
        event.ticketId = ticket.id;
        touchEvent(event);
      }
    }
    ticket.notes.push(
      autoNote(
        `Vlna: ${freshOffline.length} zariadení offline v okne ${config.massWindowMinutes} min.`,
        timestamp,
      ),
    );
  } else if (canExtendMass && massOpen && mass) {
    const newcomers = freshOffline.filter((d) => !mass!.deviceUuids.includes(d.uuid));
    for (const device of newcomers) {
      mass.deviceUuids.push(device.uuid);
      const pending = pendingMap.get(pendingKey(device.uuid, "offline"));
      const event = pending ? getEvent(pending.eventId) : undefined;
      if (event) {
        event.outcome = "mass";
        event.ticketId = massOpen.id;
        touchEvent(event);
      }
    }
    if (newcomers.length > 0) {
      massOpen.notes.push(
        autoNote(
          `Do vlny pribudlo ${newcomers.length} zariadení (spolu ${mass.deviceUuids.length}).`,
          timestamp,
        ),
      );
      massOpen.title = `Hromadný výpadok: ${mass.deviceUuids.length} zariadení offline`;
      massOpen.updatedAt = timestamp;
    }
  }

  const massIds = new Set(mass?.deviceUuids ?? []);
  const skipOffline = new Set<string>();
  if (massOpen) {
    for (const uuid of massIds) skipOffline.add(uuid);
    for (const device of freshOffline) {
      if (massIds.has(device.uuid)) skipOffline.add(device.uuid);
    }
  }

  for (const { device, pending } of offlineConfirm) {
    if (skipOffline.has(device.uuid) && massOpen) {
      const event = getEvent(pending.eventId);
      if (event && event.outcome === "open") {
        event.outcome = "mass";
        event.ticketId = massOpen.id;
        touchEvent(event);
      }
      continue;
    }
    confirmOnTicket(device, "offline", pending);
  }

  if (massOpen && mass) {
    const stillDown = mass.deviceUuids.some((uuid) => {
      const device = current.find((d) => d.uuid === uuid);
      return Boolean(device && !device.isOnline);
    });
    if (!stillDown) {
      massOpen.notes.push(
        autoNote("Všetky zariadenia z vlny sú späť online.", timestamp),
      );
      massOpen.updatedAt = timestamp;
      if (config.autoClose) massOpen.status = "hotove";
      resolved += 1;
      mass = null;
    }
  }

  const recentEvents = [...eventsById.values()];
  for (const device of current) {
    if (!newlyShort.has(device.uuid)) continue;
    if (ignoredUuids.has(device.uuid)) continue;
    const count = countFlapEvents(
      recentEvents,
      device.uuid,
      now,
      config.flapWindowDays,
    );
    if (count < config.flapMinCount) continue;
    if (findOpenAutoTicket(tickets, device.uuid)) continue;
    const inputTicket = buildFlapTicket(device, count, config.flapWindowDays);
    const ticket = pushTicket(tickets, inputTicket, timestamp);
    created += 1;
    ticket.notes.push(
      autoNote(
        `${count}× krátky offline za ${config.flapWindowDays} dní. Epizódy sú v histórii zariadenia.`,
        timestamp,
      ),
    );
  }

  return {
    tickets,
    pending: [...pendingMap.values()],
    events: [...eventsById.values()].filter((e) => dirtyEventIds.has(e.id)),
    mass,
    created,
    resolved,
  };
}
