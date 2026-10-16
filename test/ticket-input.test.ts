import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ServiceDevice } from "../src/lib/types";
import {
  applyDeviceToTicketFields,
  collectTicketCreateFields,
  normalizePriority,
  parseTicketStatus,
  validateCreateTicket,
} from "../src/lib/ticket-input";

const device = {
  uuid: "dev-1",
  name: "Pi predajňa",
  code: "12",
  partner: "COOP",
  city: "Martin",
  address: "Hlavná 1",
  phone: "+421900",
  deviceType: "raspberrypi4-64",
} as ServiceDevice;

describe("ticket-input", () => {
  test("doplní polia zo zariadenia rovnako ako UI", () => {
    const filled = applyDeviceToTicketFields(device, {
      title: "Offline",
      description: "Neide",
    });
    assert.equal(filled.deviceUuid, "dev-1");
    assert.equal(filled.deviceSerial, "dev-1");
    assert.equal(filled.deviceType, "Raspberry Pi 4");
    assert.equal(filled.customerName, "#12 · COOP · Martin");
    assert.equal(filled.customerPhone, "+421900");
  });

  test("validácia vyžaduje názov, popis, typ a prevádzku", () => {
    const errors = validateCreateTicket({ title: "", description: "" });
    assert.ok(errors);
    assert.ok(errors.title);
    assert.ok(errors.description);
    assert.ok(errors.deviceType);
    assert.ok(errors.customerName);
    assert.equal(
      validateCreateTicket({
        title: "A",
        description: "B",
        deviceType: "PC",
        customerName: "COOP",
      }),
      null,
    );
  });

  test("normalizuje prioritu a stav", () => {
    assert.equal(normalizePriority("urgentna"), "urgentna");
    assert.equal(normalizePriority("xxx"), "normalna");
    assert.equal(parseTicketStatus("caka_diely"), "caka_diely");
    assert.equal(parseTicketStatus("hotoveee"), null);
  });

  test("clientRef a prevádzka z JSON tela", () => {
    const fields = collectTicketCreateFields({
      title: "Hlásenie",
      description: "Volali",
      prevadzka: "COOP Martin",
      clientRef: "hotline-1",
    });
    assert.equal(fields.customerName, "COOP Martin");
    assert.equal(fields.clientRef, "hotline-1");
  });
});
