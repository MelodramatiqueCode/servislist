import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import {
  isLowStock,
  normalizeName,
  reservedQty,
  stockFromPohyby,
  type SkladPohyb,
} from "../src/lib/sklad";
import type * as SkladStore from "../src/lib/sklad-store";
import type * as MaterialStore from "../src/lib/material-store";
import type * as Store from "../src/lib/store";

const previous = {
  dataDir: process.env.SERVISLIST_DATA_DIR,
  databaseUrl: process.env.DATABASE_URL,
  postgresUrl: process.env.POSTGRES_URL,
  prismaUrl: process.env.POSTGRES_PRISMA_URL,
};

let sklad: typeof SkladStore;
let material: typeof MaterialStore;
let tickets: typeof Store;

describe("sklad helpers", () => {
  test("stock is the signed sum of movements", () => {
    const rows: SkladPohyb[] = [
      {
        id: "1",
        polozkaId: "p1",
        typ: "prijem",
        mnozstvo: 10,
        dodaciListId: "dl",
        ticketId: "",
        prevadzkaId: "",
        ticketMaterialId: "",
        datum: "2026-10-01T00:00:00.000Z",
        kto: "Martin",
      },
      {
        id: "2",
        polozkaId: "p1",
        typ: "vydaj",
        mnozstvo: -3,
        dodaciListId: "",
        ticketId: "t1",
        prevadzkaId: "s1",
        ticketMaterialId: "m1",
        datum: "2026-10-02T00:00:00.000Z",
        kto: "Servis",
      },
      {
        id: "3",
        polozkaId: "p2",
        typ: "prijem",
        mnozstvo: 5,
        dodaciListId: "",
        ticketId: "",
        prevadzkaId: "",
        ticketMaterialId: "",
        datum: "2026-10-03T00:00:00.000Z",
        kto: "Martin",
      },
    ];
    assert.equal(stockFromPohyby(rows, "p1"), 7);
    assert.equal(stockFromPohyby(rows, "p2"), 5);
    assert.equal(stockFromPohyby(rows, "missing"), 0);
  });

  test("reserved and low-stock use free qty vs min", () => {
    const reserved = [
      { polozkaId: "p1", quantity: 4 },
      { polozkaId: "p1", quantity: 2 },
    ];
    assert.equal(reservedQty(reserved, "p1"), 6);
    assert.equal(isLowStock(10, 6, 5), true);
    assert.equal(isLowStock(10, 2, 5), false);
    assert.equal(normalizeName("SD  karta"), "sd karta");
  });
});

describe("sklad store", () => {
  before(async () => {
    process.env.SERVISLIST_DATA_DIR = await mkdtemp(
      path.join(tmpdir(), "servislist-sklad-"),
    );
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    sklad = await import("../src/lib/sklad-store");
    material = await import("../src/lib/material-store");
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

  test("catalog seeds once; pending príjem does not change stock until approve", async () => {
    const first = await sklad.ensureSkladCatalog();
    const again = await sklad.ensureSkladCatalog();
    assert.equal(first.length, again.length);
    assert.ok(first.length >= 8);

    const sd = first.find((p) => p.kod === "SD-CARD");
    assert.ok(sd);

    const dl = await sklad.createDodaciList({
      dodavatel: "AudioTech",
      cisloDl: "DL-TEST-1",
      datum: "2026-10-16",
      vytvoril: "Servis bot",
      zdroj: "servis_bot",
      riadky: [
        {
          polozkaId: sd.id,
          kod: sd.kod,
          nazov: sd.nazov,
          kategoria: sd.kategoria,
          jednotka: sd.jednotka,
          minStav: sd.minStav,
          mnozstvo: 12,
          poznamka: "",
          nova: false,
        },
      ],
    });
    assert.equal(dl.stav, "cakajuci");

    const before = await sklad.skladSnapshot();
    const pendingRow = before.polozky.find((p) => p.id === sd.id);
    assert.equal(pendingRow?.stock, 0);
    assert.equal(before.pending.length, 1);

    await sklad.resolveDodaciList(dl.id, "accepted", "Martin");
    const after = await sklad.skladSnapshot();
    assert.equal(after.polozky.find((p) => p.id === sd.id)?.stock, 12);
    assert.equal(after.pending.length, 0);
  });

  test("closing used material writes výdaj once", async () => {
    const catalog = await sklad.listPolozky();
    const sd = catalog.find((p) => p.kod === "SD-CARD");
    assert.ok(sd);

    const created = await tickets.createTicket({
      title: "Výmena SD",
      description: "test",
      deviceType: "",
      deviceSerial: "",
      customerName: "Leles",
      customerPhone: "",
      assignedTo: "Servis",
      priority: "normalna",
      source: "manual",
    });

    const item = await material.addMaterialItem({
      ticketId: created.id,
      prevadzkaId: created.prevadzkaId || "store-1",
      item: "SD karta",
      quantity: 2,
      unit: "ks",
      status: "pouzite",
      polozkaId: sd.id,
    });

    const first = await sklad.writeOffUsedMaterial({
      id: created.id,
      assignedTo: "Servis",
      prevadzkaId: created.prevadzkaId,
    });
    const second = await sklad.writeOffUsedMaterial({
      id: created.id,
      assignedTo: "Servis",
      prevadzkaId: created.prevadzkaId,
    });
    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.equal(first[0]?.id, second[0]?.id);
    assert.equal(first[0]?.ticketMaterialId, item.id);
    assert.equal(first[0]?.typ, "vydaj");
    assert.equal(first[0]?.mnozstvo, -2);

    const snap = await sklad.skladSnapshot();
    assert.equal(snap.polozky.find((p) => p.id === sd.id)?.stock, 10);
  });

  test("planned material on an open ticket is reserved", async () => {
    const catalog = await sklad.listPolozky();
    const sd = catalog.find((p) => p.kod === "SD-CARD");
    assert.ok(sd);
    const created = await tickets.createTicket({
      title: "Rezervácia SD",
      description: "test",
      deviceType: "",
      deviceSerial: "",
      customerName: "Nitra",
      customerPhone: "",
      assignedTo: "Servis",
      priority: "normalna",
      source: "manual",
    });
    await material.addMaterialItem({
      ticketId: created.id,
      prevadzkaId: created.prevadzkaId || "store-1",
      item: "SD karta",
      quantity: 3,
      unit: "ks",
      status: "planovane",
      polozkaId: sd.id,
    });
    const reserved = await sklad.reservedForOpenTickets();
    const qty = reserved
      .filter((r) => r.polozkaId === sd.id && r.ticketId === created.id)
      .reduce((sum, r) => sum + r.quantity, 0);
    assert.equal(qty, 3);
    const snap = await sklad.skladSnapshot();
    assert.equal(snap.polozky.find((p) => p.id === sd.id)?.reserved, 3);
    assert.equal(snap.polozky.find((p) => p.id === sd.id)?.free, 7);
  });
});
