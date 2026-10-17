import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import type { ServiceDevice } from "../src/lib/types";
import type * as Store from "../src/lib/store";
import type * as BotApi from "../src/lib/bot-api";

const previous = {
  dataDir: process.env.SERVISLIST_DATA_DIR,
  databaseUrl: process.env.DATABASE_URL,
  postgresUrl: process.env.POSTGRES_URL,
  prismaUrl: process.env.POSTGRES_PRISMA_URL,
};

const device: ServiceDevice = {
  uuid: "uuid-store-1",
  balenaId: 2,
  name: "88-COOP Nitra",
  code: "88",
  partner: "COOP",
  city: "Nitra",
  address: "Hlavná 9",
  phone: "+421111",
  status: "Idle",
  overallStatus: "ok",
  isOnline: true,
  isConnectedToVpn: true,
  apiHeartbeat: "",
  supervisorVersion: "12",
  osVersion: "2.83",
  dashboardUrl: "",
  fleet: "ceo2/massiva",
  deviceType: "raspberrypi4-64",
  importedAt: "2026-01-01T00:00:00.000Z",
  lastConnectivityEvent: "",
  lastVpnEvent: "",
  ipAddress: "192.168.1.10",
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
};

let store: typeof Store;
let bot: typeof BotApi;
const actor = { id: "servis", name: "Servis bot" };

before(async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "servislist-prev-"));
  process.env.SERVISLIST_DATA_DIR = dataDir;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_PRISMA_URL;
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    path.join(dataDir, "devices.json"),
    JSON.stringify({ importedAt: "2026-01-01T00:00:00.000Z", devices: [device] }),
    "utf8",
  );
  await writeFile(
    path.join(dataDir, "tickets.json"),
    JSON.stringify({ nextNumber: 1, tickets: [] }),
    "utf8",
  );
  await writeFile(
    path.join(dataDir, "vyjazdy.json"),
    JSON.stringify({ nextNumber: 1, vyjazdy: [] }),
    "utf8",
  );
  store = await import("../src/lib/store");
  bot = await import("../src/lib/bot-api");
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

describe("prevadzka catalog and bot", () => {
  test("backfill from devices and list full profiles", async () => {
    const result = await store.ensurePrevadzkyCatalog();
    assert.ok(result.stores >= 1);
    const listed = await bot.botListPrevadzky(
      new URL("https://servislist.vercel.app/api/v1/prevadzky?q=Nitra"),
    );
    assert.ok(listed.count >= 1);
    const row = listed.prevadzky[0];
    assert.ok(row.id);
    assert.ok(Array.isArray(row.vykaz));
    assert.ok(row.profile);
  });

  test("UI create store+ticket, close writes vykaz with material", async () => {
    const created = await store.createPrevadzkaWithJob({
      name: "Nová predajňa",
      chain: "Terno",
      city: "Trenčín",
      address: "Mierové 1",
      code: "501",
      jobType: "montaz_ozvucenia",
      status: "active",
      author: "Martin",
    });
    assert.equal(created.store.status, "active");
    assert.equal(created.ticket.kind, "montaz");
    assert.equal(created.ticket.prevadzkaId, created.store.id);

    const { listMaterial } = await import("../src/lib/material-store");
    const items = await listMaterial({ ticketId: created.ticket.id });
    assert.ok(items.length > 3);
    await store.updateTicketStatus(created.ticket.id, "hotove", {
      author: "Martin",
      note: "Nainštalované, repro hrajú.",
    });
    const detail = await bot.botGetPrevadzka(created.store.id);
    assert.ok(detail.vykaz.some((e) => e.type === "montaz" && e.ticketId === created.ticket.id));
    assert.match(detail.vykaz[0].description, /Materiál|Nainštalované|repro/i);
  });

  test("bot POST is pending; PATCH is suggestion; POST vykaz applies", async () => {
    const created = await bot.botCreatePrevadzka(
      {
        jobType: "spustenie_zariadenia",
        name: "Bot predajňa",
        chain: "COOP",
        city: "Žilina",
        address: "Námestie 2",
      },
      actor,
    );
    assert.equal(created.pending, true);
    assert.equal(created.prevadzka.status, "pending");
    assert.equal(created.ticket.kind, "spustenie");

    const patched = await bot.botPatchPrevadzka(
      created.prevadzka.id,
      { profile: { speakersTotal: "6" } },
      actor,
    );
    assert.equal(patched.pending, true);
    assert.ok(patched.suggestion.id);

    const vykaz = await bot.botAddVykaz(
      created.prevadzka.id,
      { type: "spustenie", description: "Pi nahraté, overené." },
      actor,
    );
    assert.equal(vykaz.entry.source, "manual");
    assert.equal(vykaz.entry.type, "spustenie");

    const confirmed = await store.confirmPrevadzkaProposal(
      created.prevadzka.id,
      "Martin",
    );
    assert.equal(confirmed?.status, "active");
  });

  test("material CRUD on ticket", async () => {
    const created = await store.createPrevadzkaWithJob({
      name: "Materiál test",
      city: "Košice",
      jobType: "spustenie_zariadenia",
    });
    const added = await bot.botAddMaterial(
      created.ticket.id,
      { item: "Držiak", quantity: 2, unit: "ks", unitPrice: 4 },
      actor,
    );
    assert.equal(added.item.item, "Držiak");
    const patched = await bot.botPatchMaterial(created.ticket.id, added.item.id, {
      status: "pouzite",
    });
    assert.equal(patched.item?.status, "pouzite");
    const deleted = await bot.botDeleteMaterial(created.ticket.id, added.item.id);
    assert.equal(deleted.deleted, true);
  });
});
