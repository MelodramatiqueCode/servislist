import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import {
  auditToCsv,
  parseAuditAutor,
  wantsPendingNavrh,
} from "../src/lib/kontrola";
import type * as KontrolaStore from "../src/lib/kontrola-store";
import type * as Store from "../src/lib/store";

const previous = {
  dataDir: process.env.SERVISLIST_DATA_DIR,
  databaseUrl: process.env.DATABASE_URL,
  postgresUrl: process.env.POSTGRES_URL,
  prismaUrl: process.env.POSTGRES_PRISMA_URL,
};

let kontrola: typeof KontrolaStore;
let tickets: typeof Store;

describe("kontrola helpers", () => {
  test("maps bot names and pending flags", () => {
    assert.equal(parseAuditAutor("Hotline bot"), "hotline_bot");
    assert.equal(parseAuditAutor("Servis bot"), "servis_bot");
    assert.equal(parseAuditAutor("Martin"), "martin");
    assert.equal(wantsPendingNavrh({ pending: true }), true);
    assert.equal(wantsPendingNavrh({ navrh: "true" }), true);
    assert.equal(wantsPendingNavrh({}), false);
  });

  test("csv export includes header and escaped popis", () => {
    const csv = auditToCsv([
      {
        id: "1",
        at: "2026-10-17T08:00:00.000Z",
        autor: "servis_bot",
        typ: "sklad",
        akcia: "navrh",
        entityId: "dl1",
        popis: 'Príjem DL, "0187"',
        diff: null,
        requestId: "",
      },
    ]);
    assert.match(csv, /^cas,autor,typ,akcia,entity_id,popis/);
    assert.match(csv, /Servis bot/);
    assert.match(csv, /"Príjem DL, ""0187"""/);
  });
});

describe("kontrola store", () => {
  before(async () => {
    process.env.SERVISLIST_DATA_DIR = await mkdtemp(
      path.join(tmpdir(), "servislist-kontrola-"),
    );
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    kontrola = await import("../src/lib/kontrola-store");
    tickets = await import("../src/lib/store");
  });

  after(() => {
    if (previous.dataDir === undefined) delete process.env.SERVISLIST_DATA_DIR;
    else process.env.SERVISLIST_DATA_DIR = previous.dataDir;
    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.databaseUrl;
    if (previous.postgresUrl === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = previous.postgresUrl;
    if (previous.prismaUrl === undefined) delete process.env.POSTGRES_PRISMA_URL;
    else process.env.POSTGRES_PRISMA_URL = previous.prismaUrl;
  });

  test("audit, errors and sync runs persist", async () => {
    await kontrola.writeAudit({
      autor: "Servis bot",
      typ: "ticket",
      akcia: "vytvoril",
      entityId: "t1",
      popis: "Ticket #0001",
    });
    await kontrola.captureAppError({
      zdroj: "api",
      route: "/api/v1/tickets",
      status: 422,
      bot: "Hotline bot",
      message: "Chýba prevadzkaId",
    });
    await kontrola.recordSyncRun({
      startedAt: "2026-10-17T08:00:00.000Z",
      finishedAt: "2026-10-17T08:01:00.000Z",
      ok: true,
      devicesOnline: 10,
      devicesOffline: 1,
      devicesLongOffline: 0,
      devicesTest: 1,
      ticketsOpened: 0,
      ticketsClosed: 0,
      error: "",
    });
    const audit = await kontrola.listAudit();
    assert.ok(audit.some((r) => r.popis.includes("#0001")));
    const errors = await kontrola.listAppErrors();
    assert.equal(errors[0]?.status, 422);
    const sync = await kontrola.lastSyncRun();
    assert.equal(sync?.ok, true);
    assert.equal(sync?.devicesOnline, 10);
  });

  test("pending ticket návrh stays pending until Martin approves", async () => {
    const navrh = await kontrola.createNavrh({
      kind: "ticket",
      payload: {
        title: "Offline Leles",
        description: "2 h",
        deviceType: "Pi",
        deviceSerial: "",
        customerName: "Leles",
        customerPhone: "",
        assignedTo: "Servis bot",
        priority: "vysoka",
      },
      summary: "Návrh ticketu: Leles",
      actorId: "servis",
      actorName: "Servis bot",
    });
    assert.equal(navrh.stav, "cakajuci");
    const pending = await kontrola.listNavrhy({ stav: "cakajuci" });
    assert.ok(pending.some((n) => n.id === navrh.id));

    const before = await tickets.listTickets({ status: "vsetky", archived: "all" });
    await kontrola.resolveNavrh(navrh.id, "rejected", "Martin");
    const after = await tickets.listTickets({ status: "vsetky", archived: "all" });
    assert.equal(after.length, before.length);
    const resolved = await kontrola.getNavrh(navrh.id);
    assert.equal(resolved?.stav, "zamietnuty");
  });
});
