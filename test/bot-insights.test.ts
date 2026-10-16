import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { groupOpenTicketsByLocation, serializeDeviceEvent } from "../src/lib/bot-insights";
import type { DeviceEvent, ServiceDevice, Ticket } from "../src/lib/types";

function device(partial: Partial<ServiceDevice> & { uuid: string }): ServiceDevice {
  return {
    balenaId: 1,
    name: partial.name ?? partial.uuid,
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

function ticket(partial: Partial<Ticket> & { id: string }): Ticket {
  return {
    id: partial.id,
    number: partial.number ?? 1,
    title: partial.title ?? "Offline",
    description: "",
    deviceType: "Pi",
    deviceSerial: "",
    deviceUuid: partial.deviceUuid ?? "",
    customerName: partial.customerName ?? "",
    customerPhone: "",
    assignedTo: "",
    status: partial.status ?? "otvorene",
    priority: "vysoka",
    notes: [],
    createdAt: "2026-10-16T10:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-10-16T10:00:00.000Z",
    source: "auto",
    alertType: "offline",
  };
}

describe("bot insights", () => {
  test("otvorené tickety zoskupí podľa prevádzky a regiónu", () => {
    const devices = [
      device({ uuid: "a", code: "114", city: "Nitra", partner: "COOP" }),
      device({ uuid: "b", code: "200", city: "Fiľakovo", partner: "JLM" }),
      device({ uuid: "c", code: "201", city: "Fiľakovo", partner: "JLM", address: "Hlavná 1" }),
    ];
    const tickets = [
      ticket({ id: "t1", number: 1, deviceUuid: "a", title: "Offline Nitra" }),
      ticket({ id: "t2", number: 2, deviceUuid: "b", title: "Hot Fiľakovo" }),
      ticket({ id: "t3", number: 3, deviceUuid: "c", title: "Disk Fiľakovo" }),
      ticket({ id: "t4", number: 4, deviceUuid: "a", status: "hotove", title: "hotové" }),
    ];

    const all = groupOpenTicketsByLocation(tickets, devices);
    assert.equal(all.length, 2);
    assert.equal(all.reduce((n, g) => n + g.openCount, 0), 3);

    const filakovo = groupOpenTicketsByLocation(tickets, devices, {
      region: "Fiľakovo",
    });
    assert.equal(filakovo.length, 1);
    assert.equal(filakovo[0].openCount, 2);
    assert.equal(filakovo[0].region, "Fiľakovo");

    const coop = groupOpenTicketsByLocation(tickets, devices, {
      prevadzka: "COOP",
    });
    assert.equal(coop.length, 1);
    assert.equal(coop[0].tickets[0].code, "#0001");
  });

  test("serializuje epizódu pre bota", () => {
    const event: DeviceEvent = {
      id: "e1",
      deviceUuid: "a",
      alertType: "offline",
      startedAt: "2026-10-15T08:00:00.000Z",
      endedAt: "2026-10-15T08:04:00.000Z",
      durationSeconds: 240,
      outcome: "short",
      ticketId: "",
      note: "",
    };
    const row = serializeDeviceEvent(event);
    assert.equal(row.alertLabel, "Offline");
    assert.equal(row.outcome, "short");
    assert.equal(row.durationSeconds, 240);
  });
});
