import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Ticket, Vyjazd } from "../src/lib/types";
import {
  autoVykazFromTicket,
  autoVykazFromVyjazd,
  filterVykaz,
  inferVykazType,
  mergeVykazEntries,
  ticketQualifiesForVykaz,
} from "../src/lib/vykaz-prace";

describe("vykaz prace", () => {
  test("infer types from text", () => {
    assert.equal(inferVykazType("Demontáž racku"), "demontaz");
    assert.equal(inferVykazType("Spustenie zariadenia"), "spustenie");
    assert.equal(inferVykazType("Montáž 8 repro"), "montaz");
    assert.equal(inferVykazType("Výmena zdroja"), "vymena_hw");
    assert.equal(inferVykazType("Oprava jacku"), "oprava");
    assert.equal(inferVykazType("Bežný servis"), "servis");
  });

  test("merges auto and manual, newest first, no ticket duplicate", () => {
    const ticket: Ticket = {
      id: "t1",
      number: 1,
      title: "Montáž ozvučenia",
      description: "Inštalácia",
      deviceType: "",
      deviceSerial: "",
      deviceUuid: "",
      customerName: "COOP",
      customerPhone: "",
      assignedTo: "Martin",
      status: "hotove",
      priority: "normalna",
      notes: [
        {
          id: "n1",
          text: "Hotové, 8 repro.",
          author: "Martin",
          createdAt: "2026-10-17T10:00:00.000Z",
        },
      ],
      createdAt: "2026-10-16T10:00:00.000Z",
      updatedAt: "2026-10-17T10:00:00.000Z",
    };
    const auto = autoVykazFromTicket(ticket, "s1");
    assert.equal(auto.type, "montaz");
    assert.equal(auto.description, "Hotové, 8 repro.");

    const manual = {
      ...auto,
      id: "manual-1",
      source: "manual" as const,
      date: "2026-10-18T00:00:00.000Z",
    };
    const merged = mergeVykazEntries([manual], [auto]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].id, "manual-1");

    const vyjazd = {
      id: "v1",
      number: 1,
      title: "Servis Nitra",
      store: "Nitra",
      address: "",
      contactPhone: "",
      technician: "Jano",
      scheduledAt: "2026-10-10T08:00:00.000Z",
      status: "hotovy",
      priority: "normalna",
      deviceUuid: "",
      ticketId: "",
      description: "",
      result: "Výmena SD karty",
      stops: [],
      route: null,
      originLabel: "",
      originAddress: "",
      createdAt: "2026-10-10T08:00:00.000Z",
      updatedAt: "2026-10-10T12:00:00.000Z",
    } satisfies Vyjazd;
    const fromV = autoVykazFromVyjazd(vyjazd, "s1");
    assert.equal(fromV.type, "vymena_hw");
    const both = mergeVykazEntries([], [auto, fromV]);
    assert.equal(both[0].ticketId, "t1");
    assert.equal(filterVykaz(both, "vymena_hw").length, 1);
  });

  test("auto tickets stay out of výkaz unless human resolution or výjazd", () => {
    const autoClosed: Ticket = {
      id: "auto-1",
      number: 2,
      title: "Offline",
      description: "Zariadenie je offline.",
      deviceType: "",
      deviceSerial: "",
      deviceUuid: "u1",
      customerName: "COOP Nitra",
      customerPhone: "",
      assignedTo: "Automat",
      status: "hotove",
      priority: "normalna",
      source: "auto",
      notes: [
        {
          id: "n1",
          text: "Stav zmenený: Otvorené → Hotové.",
          author: "Automat",
          createdAt: "2026-10-17T10:00:00.000Z",
        },
        {
          id: "n2",
          text: "Archivované pred nasadením nových pravidiel auto-ticketov (Balena). Ticket ostáva, nie je zmazaný.",
          author: "Automat",
          createdAt: "2026-10-17T11:00:00.000Z",
        },
      ],
      createdAt: "2026-10-16T10:00:00.000Z",
      updatedAt: "2026-10-17T11:00:00.000Z",
      archivedAt: "2026-10-17T11:00:00.000Z",
    };
    assert.equal(ticketQualifiesForVykaz(autoClosed, []), false);

    const humanResolved = {
      ...autoClosed,
      id: "auto-2",
      archivedAt: undefined,
      notes: [
        ...autoClosed.notes,
        {
          id: "n3",
          text: "Vymenený zdroj, predajňa beží.",
          author: "Martin",
          createdAt: "2026-10-17T12:00:00.000Z",
        },
      ],
    };
    assert.equal(ticketQualifiesForVykaz(humanResolved, []), true);

    const linked = { ...autoClosed, id: "auto-3" };
    const vyjazd = {
      id: "v-link",
      number: 2,
      title: "Výjazd",
      store: "Nitra",
      address: "",
      contactPhone: "",
      technician: "Jano",
      scheduledAt: "",
      status: "hotovy" as const,
      priority: "normalna" as const,
      deviceUuid: "u1",
      ticketId: "auto-3",
      description: "",
      result: "",
      stops: [],
      route: null,
      originLabel: "",
      originAddress: "",
      createdAt: "2026-10-17T00:00:00.000Z",
      updatedAt: "2026-10-17T00:00:00.000Z",
    };
    assert.equal(ticketQualifiesForVykaz(linked, [vyjazd]), true);

    const manual: Ticket = {
      ...autoClosed,
      id: "man-1",
      source: "manual",
      notes: [],
      archivedAt: undefined,
    };
    assert.equal(ticketQualifiesForVykaz(manual, []), true);
  });
});
