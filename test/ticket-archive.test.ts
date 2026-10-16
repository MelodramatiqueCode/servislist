import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  archiveLegacyAutoTickets,
  isLegacyAutoTicket,
  matchesArchivedFilter,
  parseArchivedQuery,
  selectLegacyAutoTickets,
} from "../src/lib/ticket-archive";
import type { Ticket } from "../src/lib/types";

function ticket(partial: Partial<Ticket> & { id: string }): Ticket {
  return {
    id: partial.id,
    number: partial.number ?? 1,
    title: partial.title ?? "T",
    description: "",
    deviceType: "Pi",
    deviceSerial: "",
    deviceUuid: "",
    customerName: "",
    customerPhone: "",
    assignedTo: "",
    status: partial.status ?? "otvorene",
    priority: "normalna",
    notes: [],
    createdAt: partial.createdAt ?? "2026-09-15T10:00:00.000Z",
    updatedAt: "2026-09-15T10:00:00.000Z",
    source: partial.source,
    archivedAt: partial.archivedAt,
  };
}

describe("ticket archive", () => {
  test("default zoznam schová archivované", () => {
    const live = ticket({ id: "a", source: "manual" });
    const archived = ticket({
      id: "b",
      source: "auto",
      archivedAt: "2026-10-16T00:00:00.000Z",
    });
    assert.equal(matchesArchivedFilter(live, "hide"), true);
    assert.equal(matchesArchivedFilter(archived, "hide"), false);
    assert.equal(matchesArchivedFilter(archived, "only"), true);
    assert.equal(matchesArchivedFilter(archived, "all"), true);
    assert.equal(parseArchivedQuery(""), "hide");
    assert.equal(parseArchivedQuery("only"), "only");
    assert.equal(parseArchivedQuery("1"), "all");
  });

  test("migrácia berie len staré auto, nie ručné, a je idempotentná", () => {
    const before = new Date("2026-10-16T22:00:00.000Z");
    const tickets = [
      ticket({ id: "auto-old", source: "auto", createdAt: "2026-09-12T08:00:00.000Z" }),
      ticket({
        id: "auto-old-open",
        source: "auto",
        status: "otvorene",
        createdAt: "2026-10-01T08:00:00.000Z",
      }),
      ticket({ id: "manual", source: "manual", createdAt: "2026-09-12T08:00:00.000Z" }),
      ticket({
        id: "auto-new",
        source: "auto",
        createdAt: "2026-10-16T23:00:00.000Z",
      }),
      ticket({
        id: "already",
        source: "auto",
        createdAt: "2026-09-01T00:00:00.000Z",
        archivedAt: "2026-10-16T12:00:00.000Z",
      }),
    ];

    assert.equal(selectLegacyAutoTickets(tickets, before).length, 2);
    assert.equal(isLegacyAutoTicket(tickets[2], before), false);

    const first = archiveLegacyAutoTickets(tickets, before, "2026-10-16T22:05:00.000Z");
    assert.equal(first.archived, 2);
    const archivedIds = first.tickets.filter((t) => t.archivedAt).map((t) => t.id);
    assert.ok(archivedIds.includes("auto-old"));
    assert.ok(archivedIds.includes("auto-old-open"));
    assert.ok(!archivedIds.includes("manual"));
    assert.ok(!first.tickets.find((t) => t.id === "auto-new")?.archivedAt);

    const second = archiveLegacyAutoTickets(
      first.tickets,
      before,
      "2026-10-16T23:00:00.000Z",
    );
    assert.equal(second.archived, 0);
    assert.equal(
      first.tickets.find((t) => t.id === "auto-old")?.archivedAt,
      "2026-10-16T22:05:00.000Z",
    );
  });
});
