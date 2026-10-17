import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  outageCountsByDay,
  relativeAge,
  sparkPolyline,
  ticketProgress,
  ticketSourceLabel,
  ticketStripeClass,
} from "../src/lib/pulse";
import { searchCatalog, searchCommands } from "../src/lib/search";
import type { Ticket } from "../src/lib/types";

function ticket(partial: Partial<Ticket> = {}): Ticket {
  return {
    id: "t1",
    number: 321,
    title: "Prehrávač offline",
    description: "",
    deviceType: "",
    deviceSerial: "",
    deviceUuid: "",
    customerName: "Leles",
    customerPhone: "",
    assignedTo: "Servis bot",
    status: "otvorene",
    priority: "vysoka",
    notes: [],
    createdAt: "2026-10-17T08:00:00.000Z",
    updatedAt: "2026-10-17T08:00:00.000Z",
    source: "auto",
    ...partial,
  };
}

describe("pulse helpers", () => {
  test("progress and stripe follow status and priority", () => {
    assert.equal(ticketProgress("otvorene"), 10);
    assert.equal(ticketProgress("hotove"), 100);
    assert.equal(ticketStripeClass("vysoka"), "p-vysoka");
    assert.equal(ticketStripeClass("nizka"), "p-nizka");
  });

  test("source label distinguishes bots from manual tickets", () => {
    assert.equal(ticketSourceLabel(ticket()), "Servis bot");
    assert.equal(
      ticketSourceLabel(ticket({ assignedTo: "Hotline bot" })),
      "Hotline bot",
    );
    assert.equal(
      ticketSourceLabel(ticket({ source: "manual", assignedTo: "Martin" })),
      "manuálne",
    );
  });

  test("relative age uses minutes hours and days", () => {
    const now = new Date("2026-10-17T12:00:00.000Z");
    assert.equal(relativeAge("2026-10-17T11:50:00.000Z", now), "10 min");
    assert.equal(relativeAge("2026-10-17T10:00:00.000Z", now), "2 h");
    assert.equal(relativeAge("2026-10-16T12:00:00.000Z", now), "1 d");
  });

  test("sparkline and 7-day outage buckets", () => {
    const now = new Date("2026-10-17T12:00:00.000Z");
    const counts = outageCountsByDay(
      [
        "2026-10-17T08:00:00.000Z",
        "2026-10-17T09:00:00.000Z",
        "2026-10-15T08:00:00.000Z",
      ],
      7,
      now,
    );
    assert.equal(counts.length, 7);
    assert.equal(counts[6], 2);
    assert.equal(counts[4], 1);
    const spark = sparkPolyline([0, 2, 1]);
    assert.match(spark.points, /,/);
  });
});

describe("command search", () => {
  test("commands match Slovak phrases", () => {
    const hits = searchCommands("nový ticket");
    assert.equal(hits[0]?.href, "/novy");
    assert.ok(searchCommands("nová prevádzka").some((h) => h.href === "/prevadzky/nova"));
    assert.ok(searchCommands("sklad").some((h) => h.href === "/sklad"));
    assert.ok(searchCommands("nový príjem").some((h) => h.href === "/sklad/prijem"));
    assert.ok(searchCommands("kontrola").some((h) => h.href === "/kontrola"));
  });

  test("catalog finds tickets by code and store name", () => {
    const result = searchCatalog({
      q: "leles",
      tickets: [ticket()],
      stores: [],
      devices: [],
    });
    assert.equal(result.tickets[0]?.id, "t1");
  });
});
