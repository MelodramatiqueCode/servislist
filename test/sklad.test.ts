import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import {
  RPI_QTY_SPLIT_NOTE,
  SKLAD_KATEGORIA_FALLBACK,
  WAVESHARE_NOT_STOCK_NOTE,
  isLowStock,
  isWaveshareNonStockItem,
  itemMatchesKod,
  mapLegacyRpiCategory,
  normalizeName,
  parseKategoria,
  reservedQty,
  rpiQtySplitDeltas,
  stockFromPohyby,
  toSqlTimestamptz,
  type SkladPohyb,
} from "../src/lib/sklad";
import type * as SkladStore from "../src/lib/sklad-store";
import type * as MaterialStore from "../src/lib/material-store";
import type * as Store from "../src/lib/store";
import type * as KontrolaStore from "../src/lib/kontrola-store";

const previous = {
  dataDir: process.env.SERVISLIST_DATA_DIR,
  databaseUrl: process.env.DATABASE_URL,
  postgresUrl: process.env.POSTGRES_URL,
  prismaUrl: process.env.POSTGRES_PRISMA_URL,
};

let sklad: typeof SkladStore;
let material: typeof MaterialStore;
let tickets: typeof Store;
let kontrola: typeof KontrolaStore;

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

  test("legacy Prehrávače/RPi maps by name and keeps old API value", () => {
    assert.equal(parseKategoria("Prehrávače/RPi"), "Prehrávače (nešpecifikované)");
    assert.equal(parseKategoria("RPi 4"), "RPi 4");
    assert.equal(mapLegacyRpiCategory("RPi 4", "PI-RPI4"), "RPi 4");
    assert.equal(mapLegacyRpiCategory("Raspberry Pi 3", ""), "RPi 3");
    assert.equal(
      mapLegacyRpiCategory("Zdroj USB-C (RPi 4)", "PI-PSU4"),
      "Zdroje RPi 4 (USB-C)",
    );
    assert.equal(
      mapLegacyRpiCategory("Napájací zdroj micro USB", ""),
      "Zdroje RPi 3 (micro USB)",
    );
    assert.equal(mapLegacyRpiCategory("Raspberry Pi", "PI-RPI"), "Prehrávače (nešpecifikované)");
    assert.equal(mapLegacyRpiCategory("Napájací zdroj", "PI-PSU"), "Prehrávače (nešpecifikované)");
    assert.equal(mapLegacyRpiCategory("RPi 4", "RPI401"), "RPi 4");
    assert.equal(
      mapLegacyRpiCategory("Zdroj USB-C (RPi 4)", "OFI045"),
      "Zdroje RPi 4 (USB-C)",
    );
  });

  test("Martin 17.10.2026 split moves 7+19 onto the four Zonepi SKUs", () => {
    const deltas = rpiQtySplitDeltas();
    assert.equal(deltas.get("PI-RPI"), -7);
    assert.equal(deltas.get("PI-PSU"), -19);
    assert.equal(deltas.get("RPI401"), 3);
    assert.equal(deltas.get("RPI303"), 4);
    assert.equal(deltas.get("OFI045"), 13);
    assert.equal(deltas.get("OFI090"), 6);
    assert.ok(
      itemMatchesKod({ kod: "PI-RPI4", nazov: "RPi 4" }, "RPI401", "RPi 4"),
    );
    assert.ok(itemMatchesKod({ kod: "RPI401", nazov: "RPi 4" }, "PI-RPI4"));
    assert.equal(isWaveshareNonStockItem("Waveshare 4\" displej", "WAV865"), true);
    assert.equal(isWaveshareNonStockItem("SD karta", "SD-CARD"), false);
  });

  test("toSqlTimestamptz rejects JS Date.toString() as SQL input", () => {
    const neonDate = new Date("2026-10-14T00:00:00.000Z");
    const leaked = String(neonDate);
    assert.equal(
      leaked,
      "Wed Oct 14 2026 00:00:00 GMT+0000 (Coordinated Universal Time)",
    );
    assert.equal(toSqlTimestamptz(neonDate), "2026-10-14T00:00:00.000Z");
    assert.equal(toSqlTimestamptz(leaked), "2026-10-14T00:00:00.000Z");
    assert.equal(
      toSqlTimestamptz("", "2026-10-14T00:00:00.000Z"),
      "2026-10-14T00:00:00.000Z",
    );
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
    kontrola = await import("../src/lib/kontrola-store");
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

  test("JS Date.toString() datum is normalized to ISO and approve stays atomic", async () => {
    const catalog = await sklad.listPolozky();
    const sd = catalog.find((p) => p.kod === "SD-CARD");
    const amp = catalog.find((p) => p.kod === "ZS-AMP");
    assert.ok(sd);
    assert.ok(amp);

    const bad = String(new Date("2026-10-14T00:00:00.000Z"));
    assert.match(bad, /Wed Oct 14 2026 00:00:00 GMT\+0000/);
    assert.equal(toSqlTimestamptz(bad), "2026-10-14T00:00:00.000Z");
    assert.equal(
      toSqlTimestamptz(new Date("2026-10-14T00:00:00.000Z")),
      "2026-10-14T00:00:00.000Z",
    );
    assert.equal(toSqlTimestamptz("2026-10-14"), "2026-10-14T00:00:00.000Z");

    const before = await sklad.skladSnapshot();
    const stockSd = before.polozky.find((p) => p.id === sd.id)?.stock ?? 0;
    const stockAmp = before.polozky.find((p) => p.id === amp.id)?.stock ?? 0;

    const dl = await sklad.createDodaciList({
      dodavatel: "AudioTech",
      cisloDl: "DL-DATE-BUG",
      datum: bad,
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
          mnozstvo: 4,
          poznamka: "",
          nova: false,
        },
        {
          polozkaId: amp.id,
          kod: amp.kod,
          nazov: amp.nazov,
          kategoria: amp.kategoria,
          jednotka: amp.jednotka,
          minStav: amp.minStav,
          mnozstvo: 1,
          poznamka: "",
          nova: false,
        },
      ],
    });
    assert.equal(dl.stav, "cakajuci");
    assert.equal(dl.datum, "2026-10-14T00:00:00.000Z");

    const reread = await sklad.getDodaciList(dl.id);
    assert.equal(reread?.datum, "2026-10-14T00:00:00.000Z");

    const approved = await sklad.resolveDodaciList(dl.id, "accepted", "Martin");
    assert.equal(approved?.stav, "schvaleny");
    assert.equal(approved?.datum, "2026-10-14T00:00:00.000Z");

    const after = await sklad.skladSnapshot();
    assert.equal(after.polozky.find((p) => p.id === sd.id)?.stock, stockSd + 4);
    assert.equal(after.polozky.find((p) => p.id === amp.id)?.stock, stockAmp + 1);
    assert.equal(after.pending.some((p) => p.id === dl.id), false);
    const prijmy = after.pohyby.filter((p) => p.dodaciListId === dl.id);
    assert.equal(prijmy.length, 2);
    assert.ok(prijmy.every((p) => p.datum === "2026-10-14T00:00:00.000Z"));

    const again = await sklad.resolveDodaciList(dl.id, "accepted", "Martin");
    assert.equal(again?.stav, "schvaleny");
    const afterAgain = await sklad.skladSnapshot();
    assert.equal(
      afterAgain.pohyby.filter((p) => p.dodaciListId === dl.id).length,
      2,
    );
    assert.equal(afterAgain.polozky.find((p) => p.id === sd.id)?.stock, stockSd + 4);
  });

  test("quantity split writes korekcia + audit, archives leftover SKUs, hides Waveshare", async () => {
    await sklad.ensureSkladCatalog();
    const rpi = await sklad.createPolozka({
      kod: "PI-RPI",
      nazov: "Raspberry Pi",
      kategoria: SKLAD_KATEGORIA_FALLBACK,
    });
    const psu = await sklad.createPolozka({
      kod: "PI-PSU",
      nazov: "Napájací zdroj",
      kategoria: SKLAD_KATEGORIA_FALLBACK,
    });
    const wave = await sklad.createPolozka({
      kod: "WAV865",
      nazov: "Waveshare 4\" displej",
      kategoria: "Iné",
    });
    await sklad.addPohyb({ polozkaId: rpi.id, typ: "korekcia", mnozstvo: 7, kto: "Martin" });
    await sklad.addPohyb({ polozkaId: psu.id, typ: "korekcia", mnozstvo: 19, kto: "Martin" });
    await sklad.addPohyb({ polozkaId: wave.id, typ: "korekcia", mnozstvo: 1, kto: "Martin" });

    const first = await sklad.ensureSkladCatalog();
    const again = await sklad.ensureSkladCatalog();
    const snap = await sklad.skladSnapshot();
    const byKod = (kod: string) =>
      snap.polozky.find((p) => p.kod === kod) ??
      first.find((p) => p.kod === kod);

    assert.equal(snap.polozky.find((p) => p.kod === "RPI401")?.stock, 3);
    assert.equal(snap.polozky.find((p) => p.kod === "RPI303")?.stock, 4);
    assert.equal(snap.polozky.find((p) => p.kod === "OFI045")?.stock, 13);
    assert.equal(snap.polozky.find((p) => p.kod === "OFI090")?.stock, 6);
    assert.equal(snap.polozky.some((p) => p.kod === "PI-RPI" || p.kod === "PI-PSU"), false);
    assert.equal(snap.polozky.some((p) => p.kod === "WAV865"), false);

    const archived = again.filter((p) => p.id === rpi.id || p.id === psu.id || p.id === wave.id);
    assert.equal(archived.length, 3);
    assert.ok(archived.every((p) => p.archivedAt));

    const splitPohyby = snap.pohyby.filter((p) =>
      ["from:rpi4", "to:rpi4", "from:rpi3", "to:rpi3", "from:psu4", "to:psu4", "from:psu3", "to:psu3"]
        .map((k) => `split:2026-10-17:${k}`)
        .includes(p.ticketMaterialId),
    );
    assert.equal(splitPohyby.length, 8);
    const afterAgain = await sklad.listPohyby();
    assert.equal(
      afterAgain.filter((p) => p.ticketMaterialId.startsWith("split:2026-10-17:")).length,
      splitPohyby.length + 1,
    );

    const audit = await kontrola.listAudit({ typ: "sklad" });
    assert.ok(
      audit.some(
        (row) =>
          row.autor === "martin" &&
          row.popis.includes(RPI_QTY_SPLIT_NOTE) &&
          row.akcia === "korekcia",
      ),
    );
    assert.ok(
      audit.some(
        (row) =>
          row.autor === "martin" &&
          row.popis.includes(WAVESHARE_NOT_STOCK_NOTE),
      ),
    );
    assert.equal(byKod("RPI401")?.kod, "RPI401");
  });
});
