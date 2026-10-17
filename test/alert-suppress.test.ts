import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { defaultAlertConfig } from "../src/lib/alert-config";
import { reconcileAlerts } from "../src/lib/alert-reconcile";
import {
  isIgnoredDevice,
  isTestDeviceName,
  parseIgnoreList,
} from "../src/lib/alert-suppress";
import type {
  AlertPending,
  DeviceEvent,
  ServiceDevice,
  Ticket,
  TicketStore,
} from "../src/lib/types";

function device(partial: Partial<ServiceDevice> & { uuid: string }): ServiceDevice {
  return {
    balenaId: 1,
    name: partial.name ?? `1-JTS-${partial.uuid}`,
    code: partial.code ?? "1",
    partner: "JTS",
    city: "Martin",
    address: "Hlavná 1",
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
    deviceType: "raspberrypi3",
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

const now = new Date("2026-10-19T08:00:00.000Z"); // pondelok 10:00 CEST

function step(opts: {
  dev: ServiceDevice;
  prev?: ServiceDevice;
  at: Date;
  tickets?: TicketStore;
  pending?: AlertPending[];
  events?: DeviceEvent[];
  ignore?: string[];
}) {
  return reconcileAlerts({
    previous: [opts.prev ?? opts.dev],
    current: [opts.dev],
    tickets: opts.tickets ?? { nextNumber: 1, tickets: [] },
    pending: opts.pending ?? [],
    events: opts.events ?? [],
    mass: null,
    config: { ...defaultAlertConfig(), ignoreDevices: opts.ignore ?? [] },
    now: opts.at,
  });
}

/** Dva syncy: začiatok epizódy a potvrdenie po grace. */
function offlineTwice(dev: ServiceDevice, tickets?: TicketStore, ignore?: string[]) {
  const first = step({ dev, prev: { ...dev, isOnline: true }, at: now, tickets, ignore });
  const second = step({
    dev,
    at: new Date(now.getTime() + 20 * 60_000),
    tickets: first.tickets,
    pending: first.pending,
    events: first.events,
    ignore,
  });
  return { first, second };
}

function archivedOffline(uuid: string, createdAt: string): Ticket {
  return {
    id: `old-${uuid}`,
    number: 1,
    title: "Offline",
    description: "",
    deviceType: "",
    deviceSerial: uuid,
    deviceUuid: uuid,
    customerName: "",
    customerPhone: "",
    assignedTo: "Automat",
    status: "otvorene",
    priority: "vysoka",
    notes: [],
    createdAt,
    updatedAt: createdAt,
    source: "auto",
    alertType: "offline",
    archivedAt: "2026-10-16T22:00:00.000Z",
  };
}

describe("testovacie zariadenia", () => {
  test("detekcia názvov je konzervatívna", () => {
    for (const n of ["Demo", "Demo2", "cheeky-mine", "quiet-engine", "steamed-afternoon"]) {
      assert.equal(isTestDeviceName(n), true, n);
    }
    for (const n of [
      "STB-bory",
      "JGA-Šintava",
      "JLM - Palucka",
      "stb RPI 4B",
      "1-JTS-PJ099,Zázrivá,Ústredie 153",
      "Nova-44-VerexVO-051",
      "STB2",
    ]) {
      assert.equal(isTestDeviceName(n), false, n);
    }
  });

  test("ignore list podľa uuid, skráteného uuid, názvu alebo kódu", () => {
    const list = parseIgnoreList("abcdef1, Moja Testovacia ;  999");
    const d = device({ uuid: "abcdef1234567890", name: "x", code: "1" });
    assert.equal(isIgnoredDevice(d, list), true);
    assert.equal(isIgnoredDevice(device({ uuid: "zz", name: "moja testovacia" }), list), true);
    assert.equal(isIgnoredDevice(device({ uuid: "zz", code: "999" }), list), true);
    assert.equal(isIgnoredDevice(device({ uuid: "zz" }), list), false);
  });

  test("testovacie zariadenie offline nevytvorí ticket", () => {
    const dev = device({ uuid: "t1", name: "quiet-engine", code: "", isOnline: false });
    const { first, second } = offlineTwice(dev);
    assert.equal(first.pending.length, 0);
    assert.equal(second.created, 0);
    assert.equal(second.tickets.tickets.length, 0);
  });

  test("zariadenie z ALERT_IGNORE_DEVICES nevytvorí ticket", () => {
    const dev = device({ uuid: "ign1234567", isOnline: false });
    const { second } = offlineTwice(dev, undefined, ["ign1234"]);
    assert.equal(second.created, 0);
  });
});

describe("dlhodobo offline", () => {
  test("offline > 7 dní podľa Baleny nevytvorí ticket", () => {
    const dev = device({
      uuid: "l1",
      isOnline: false,
      lastConnectivityEvent: "2026-10-05T10:00:00.000Z",
    });
    const { first, second } = offlineTwice(dev);
    assert.equal(first.created + second.created, 0);
    assert.equal(
      [...first.events, ...second.events].some((e) => e.outcome === "long_offline"),
      true,
    );
  });

  test("offline 2 dni normálne vytvorí ticket", () => {
    const dev = device({
      uuid: "l2",
      isOnline: false,
      lastConnectivityEvent: "2026-10-17T10:00:00.000Z",
    });
    const { first, second } = offlineTwice(dev);
    assert.equal(first.created + second.created, 1);
  });
});

describe("archivované auto tickety", () => {
  test("archivovaný ticket toho istého incidentu sa znova nevytvorí", () => {
    const dev = device({
      uuid: "a1",
      isOnline: false,
      lastConnectivityEvent: "2026-10-16T11:36:00.000Z",
    });
    const tickets = {
      nextNumber: 2,
      tickets: [archivedOffline("a1", "2026-10-16T11:40:00.000Z")],
    };
    const { first, second } = offlineTwice(dev, tickets);
    assert.equal(first.created + second.created, 0);
    const ev = [...first.events, ...second.events].find((e) => e.deviceUuid === "a1");
    assert.equal(ev?.outcome, "archived");
    assert.equal(ev?.ticketId, "old-a1");
  });

  test("nový výpadok po návrate online vytvorí nový ticket", () => {
    const dev = device({
      uuid: "a2",
      isOnline: false,
      // zariadenie bolo po archivovanom tickete znova online a padlo neskôr
      lastConnectivityEvent: "2026-10-18T19:00:00.000Z",
    });
    const tickets = {
      nextNumber: 2,
      tickets: [archivedOffline("a2", "2026-10-16T11:40:00.000Z")],
    };
    const { first, second } = offlineTwice(dev, tickets);
    assert.equal(first.created + second.created, 1);
  });
});
