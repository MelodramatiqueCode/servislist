import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { defaultAlertConfig } from "../src/lib/alert-config";
import { reconcileAlerts } from "../src/lib/alert-reconcile";
import type { AlertPending, DeviceEvent, ServiceDevice, TicketStore } from "../src/lib/types";

function device(partial: Partial<ServiceDevice> & { uuid: string }): ServiceDevice {
  return {
    balenaId: 1,
    name: partial.name ?? `${partial.code || "0"}-${partial.uuid}`,
    code: partial.code ?? "",
    partner: partial.partner ?? "COOP",
    city: partial.city ?? "Martin",
    address: partial.address ?? "Hlavná 1",
    phone: "",
    status: "",
    overallStatus: "",
    isOnline: true,
    isConnectedToVpn: true,
    apiHeartbeat: "",
    supervisorVersion: "",
    osVersion: "",
    dashboardUrl: "",
    fleet: "ceo2/massiva",
    deviceType: "raspberrypi4-64",
    importedAt: "",
    lastConnectivityEvent: "",
    lastVpnEvent: "",
    ipAddress: "",
    publicAddress: "",
    macAddress: "",
    cpuUsage: null,
    cpuTemp: null,
    memoryUsage: null,
    memoryTotal: null,
    storageUsage: null,
    storageTotal: null,
    isUndervolted: false,
    note: "",
    ...partial,
  };
}

function emptyTickets() {
  return { nextNumber: 1, tickets: [] };
}

function run(opts: {
  previous: ServiceDevice[];
  current: ServiceDevice[];
  now: Date;
  tickets?: TicketStore;
  pending?: AlertPending[];
  events?: DeviceEvent[];
}) {
  return reconcileAlerts({
    previous: opts.previous,
    current: opts.current,
    tickets: opts.tickets ?? emptyTickets(),
    pending: opts.pending ?? [],
    events: opts.events ?? [],
    mass: null,
    config: defaultAlertConfig(),
    now: opts.now,
  });
}

function mergeEvents(...lists: DeviceEvent[][]) {
  const map = new Map<string, DeviceEvent>();
  for (const list of lists) {
    for (const event of list) map.set(event.id, event);
  }
  return [...map.values()];
}

const monday10 = new Date("2026-09-14T08:00:00.000Z"); // 10:00 Bratislava (CEST)

describe("alert reconcile", () => {
  test("offline kratší ako grace nevytvorí ticket", () => {
    const d = device({ uuid: "u1", isOnline: false, code: "1" });
    const first = run({
      previous: [device({ uuid: "u1", isOnline: true, code: "1" })],
      current: [d],
      now: monday10,
    });
    assert.equal(first.created, 0);
    assert.equal(first.pending.length, 1);

    const later = run({
      previous: [d],
      current: [d],
      now: new Date(monday10.getTime() + 5 * 60_000),
      tickets: first.tickets,
      pending: first.pending,
      events: first.events,
    });
    assert.equal(later.created, 0);

    const recovered = run({
      previous: [d],
      current: [device({ uuid: "u1", isOnline: true, code: "1" })],
      now: new Date(monday10.getTime() + 6 * 60_000),
      tickets: later.tickets,
      pending: later.pending,
      events: mergeEvents(first.events, later.events),
    });
    assert.equal(recovered.tickets.tickets.length, 0);
    assert.equal(recovered.events.some((e) => e.outcome === "short"), true);
  });

  test("offline dlhší ako grace počas hodín vytvorí ticket", () => {
    const d = device({ uuid: "u1", isOnline: false, code: "1" });
    const first = run({
      previous: [device({ uuid: "u1", isOnline: true, code: "1" })],
      current: [d],
      now: monday10,
    });
    const confirmed = run({
      previous: [d],
      current: [d],
      now: new Date(monday10.getTime() + 16 * 60_000),
      tickets: first.tickets,
      pending: first.pending,
      events: first.events,
    });
    assert.equal(confirmed.created, 1);
    assert.equal(confirmed.tickets.tickets[0].alertType, "offline");
  });

  test("offline v noci ide do histórie, nie do ticketov", () => {
    const night = new Date("2026-09-14T21:30:00.000Z"); // 23:30 CEST
    const d = device({ uuid: "u1", isOnline: false, code: "264" });
    const first = run({
      previous: [device({ uuid: "u1", isOnline: true, code: "264" })],
      current: [d],
      now: night,
    });
    const later = run({
      previous: [d],
      current: [d],
      now: new Date(night.getTime() + 30 * 60_000),
      tickets: first.tickets,
      pending: first.pending,
      events: first.events,
    });
    assert.equal(later.created, 0);
    const back = run({
      previous: [d],
      current: [device({ uuid: "u1", isOnline: true, code: "264" })],
      now: new Date(night.getTime() + 40 * 60_000),
      tickets: later.tickets,
      pending: later.pending,
      events: mergeEvents(first.events, later.events),
    });
    assert.equal(back.tickets.tickets.length, 0);
    assert.equal(back.events.some((e) => e.outcome === "outside_hours"), true);
  });

  test("hromadný výpadok = jeden incident", () => {
    const previous = Array.from({ length: 20 }, (_, i) =>
      device({ uuid: `d${i}`, isOnline: true, code: String(i) }),
    );
    const current = previous.map((d) => ({ ...d, isOnline: false }));
    const result = run({ previous, current, now: monday10 });
    assert.equal(result.created, 1);
    assert.equal(result.tickets.tickets[0].alertType, "mass_offline");
    assert.ok(result.mass);
    assert.equal(result.mass?.deviceUuids.length, 20);
  });

  test("nočné zatvorenie predajní nie je hromadný incident", () => {
    const night = new Date("2026-09-14T21:30:00.000Z"); // 23:30 CEST
    const previous = Array.from({ length: 20 }, (_, i) =>
      device({ uuid: `n${i}`, isOnline: true, code: String(200 + i) }),
    );
    const current = previous.map((d) => ({ ...d, isOnline: false }));
    const result = run({ previous, current, now: night });
    assert.equal(result.created, 0);
    assert.equal(result.mass, null);
  });

  test("Horúce CPU okolo 80 °C bez prekročenia open/minút", () => {
    const warm = device({ uuid: "u200", code: "200", cpuTemp: 80.5, name: "JLM" });
    const first = run({
      previous: [device({ uuid: "u200", code: "200", cpuTemp: 70 })],
      current: [warm],
      now: monday10,
    });
    assert.equal(first.created, 0);
    assert.equal(first.pending.length, 0);
  });

  test("Horúce CPU hysterézia: open 82 + 10 min, close 75", () => {
    const hot = device({ uuid: "u200", code: "200", cpuTemp: 86 });
    const first = run({
      previous: [device({ uuid: "u200", code: "200", cpuTemp: 70 })],
      current: [hot],
      now: monday10,
    });
    assert.equal(first.created, 0);
    const confirmed = run({
      previous: [hot],
      current: [hot],
      now: new Date(monday10.getTime() + 11 * 60_000),
      tickets: first.tickets,
      pending: first.pending,
      events: first.events,
    });
    assert.equal(confirmed.created, 1);
    assert.equal(confirmed.tickets.tickets[0].alertType, "hot");

    const hold = run({
      previous: [hot],
      current: [device({ uuid: "u200", code: "200", cpuTemp: 78 })],
      now: new Date(monday10.getTime() + 20 * 60_000),
      tickets: confirmed.tickets,
      pending: confirmed.pending,
      events: mergeEvents(first.events, confirmed.events),
    });
    assert.equal(hold.tickets.tickets[0].status, "otvorene");

    const closed = run({
      previous: [device({ uuid: "u200", code: "200", cpuTemp: 78 })],
      current: [device({ uuid: "u200", code: "200", cpuTemp: 74 })],
      now: new Date(monday10.getTime() + 25 * 60_000),
      tickets: hold.tickets,
      pending: hold.pending,
      events: mergeEvents(first.events, confirmed.events, hold.events),
    });
    assert.equal(closed.tickets.tickets[0].status, "hotove");
  });

  test("Undervolt ostáva okamžitý ticket", () => {
    const result = run({
      previous: [device({ uuid: "u1", isUndervolted: false })],
      current: [device({ uuid: "u1", isUndervolted: true })],
      now: monday10,
    });
    assert.equal(result.created, 1);
    assert.equal(result.tickets.tickets[0].alertType, "undervolt");
  });

  test("opakované krátke offline otvoria jeden flap ticket", () => {
    const uuid = "flap-1";
    let tickets = emptyTickets();
    let pending: AlertPending[] = [];
    let events: DeviceEvent[] = [];
    let now = monday10;

    for (let i = 0; i < 5; i += 1) {
      const down = run({
        previous: [device({ uuid, isOnline: true })],
        current: [device({ uuid, isOnline: false })],
        now,
        tickets,
        pending,
        events,
      });
      events = mergeEvents(events, down.events);
      const up = run({
        previous: [device({ uuid, isOnline: false })],
        current: [device({ uuid, isOnline: true })],
        now: new Date(now.getTime() + 3 * 60_000),
        tickets: down.tickets,
        pending: down.pending,
        events,
      });
      tickets = up.tickets;
      pending = up.pending;
      events = mergeEvents(events, up.events);
      now = new Date(now.getTime() + 2 * 60 * 60_000);
    }

    const flap = tickets.tickets.filter((t) => t.alertType === "flap");
    assert.equal(flap.length, 1);
    assert.equal(tickets.tickets.filter((t) => t.alertType === "offline").length, 0);
  });

  test("nočné offline nepočíta do Opakovaný výpadok", () => {
    const uuid = "night-flap";
    let tickets = emptyTickets();
    let pending: AlertPending[] = [];
    let events: DeviceEvent[] = [];
    let now = new Date("2026-09-14T21:30:00.000Z");

    for (let i = 0; i < 6; i += 1) {
      const down = run({
        previous: [device({ uuid, isOnline: true, code: "264" })],
        current: [device({ uuid, isOnline: false, code: "264" })],
        now,
        tickets,
        pending,
        events,
      });
      events = mergeEvents(events, down.events);
      const up = run({
        previous: [device({ uuid, isOnline: false, code: "264" })],
        current: [device({ uuid, isOnline: true, code: "264" })],
        now: new Date(now.getTime() + 3 * 60_000),
        tickets: down.tickets,
        pending: down.pending,
        events,
      });
      tickets = up.tickets;
      pending = up.pending;
      events = mergeEvents(events, up.events);
      now = new Date(now.getTime() + 24 * 60 * 60_000);
    }

    assert.equal(tickets.tickets.length, 0);
    assert.ok(events.filter((e) => e.outcome === "outside_hours").length >= 6);
  });
});
