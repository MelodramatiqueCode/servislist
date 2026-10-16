import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
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

let dataDir = "";
let store: typeof Store;
let botCreateTicket: typeof BotApi.botCreateTicket;
let botAddNote: typeof BotApi.botAddNote;
let botCloseTicket: typeof BotApi.botCloseTicket;
let botListTickets: typeof BotApi.botListTickets;
let botLinkTicket: typeof BotApi.botLinkTicket;

const device: ServiceDevice = {
  uuid: "uuid-1",
  balenaId: 1,
  name: "12-COOP Martin",
  code: "12",
  partner: "COOP",
  city: "Martin",
  address: "Hlavná 1",
  phone: "+421900",
  status: "Idle",
  overallStatus: "ok",
  isOnline: true,
  isConnectedToVpn: true,
  apiHeartbeat: "",
  supervisorVersion: "",
  osVersion: "",
  dashboardUrl: "",
  fleet: "ceo2/massiva",
  deviceType: "raspberrypi4-64",
  importedAt: "2026-01-01T00:00:00.000Z",
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
};

const actor = { id: "hotline", name: "Hotline bot" };

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "servislist-api-"));
  process.env.SERVISLIST_DATA_DIR = dataDir;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_PRISMA_URL;

  await mkdir(dataDir, { recursive: true });
  await writeFile(
    path.join(dataDir, "devices.json"),
    JSON.stringify({
      importedAt: "2026-01-01T00:00:00.000Z",
      devices: [device],
    }),
    "utf8",
  );
  await writeFile(
    path.join(dataDir, "vyjazdy.json"),
    JSON.stringify({
      nextNumber: 2,
      vyjazdy: [
        {
          id: "vyjazd-1",
          number: 1,
          title: "Servis Martin",
          store: "#12 · COOP · Martin",
          address: "Hlavná 1",
          contactPhone: "+421900",
          technician: "Peter",
          scheduledAt: "2026-10-16T08:00:00.000Z",
          status: "naplanovany",
          priority: "normalna",
          deviceUuid: "uuid-1",
          ticketId: "",
          description: "",
          result: "",
          stops: [
            {
              id: "stop-1",
              store: "#12 · COOP · Martin",
              address: "Hlavná 1",
              contactPhone: "+421900",
              deviceUuid: "uuid-1",
              ticketId: "",
              done: false,
              note: "",
            },
          ],
          route: null,
          originLabel: "",
          originAddress: "",
          createdAt: "2026-10-15T00:00:00.000Z",
          updatedAt: "2026-10-15T00:00:00.000Z",
        },
      ],
    }),
    "utf8",
  );

  store = await import("../src/lib/store");
  const api = await import("../src/lib/bot-api");
  botCreateTicket = api.botCreateTicket;
  botAddNote = api.botAddNote;
  botCloseTicket = api.botCloseTicket;
  botListTickets = api.botListTickets;
  botLinkTicket = api.botLinkTicket;
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

describe("bot API store", () => {
  test("vytvorí ticket, pridá záznam, uzavrie a naviaže výjazd", async () => {
    const created = await botCreateTicket(
      {
        title: "Pokladňa nejde",
        description: "Zákazník volal, čierna obrazovka.",
        deviceUuid: "uuid-1",
        clientRef: "hotline-42",
      },
      actor,
    );
    assert.equal(created.created, true);
    assert.equal(created.ticket.number, 1);
    assert.equal(created.ticket.customerName, "#12 · COOP · Martin");
    assert.equal(created.ticket.notes[0].author, "Hotline bot");

    const again = await botCreateTicket(
      {
        title: "Duplicita",
        description: "Nemá vzniknúť",
        deviceUuid: "uuid-1",
        clientRef: "hotline-42",
      },
      actor,
    );
    assert.equal(again.idempotent, true);
    assert.equal(again.ticket.id, created.ticket.id);

    const noted = await botAddNote(
      String(created.ticket.number),
      { text: "Technik vymenil napájanie.", clientRef: "note-1" },
      { id: "servis", name: "Servis bot" },
    );
    assert.equal(noted.created, true);
    const lastNote = noted.ticket.notes[noted.ticket.notes.length - 1];
    assert.equal(lastNote?.author, "Servis bot");

    const notedAgain = await botAddNote(
      created.ticket.id,
      { text: "ignoruj", clientRef: "note-1" },
      { id: "servis", name: "Servis bot" },
    );
    assert.equal(notedAgain.idempotent, true);
    assert.equal(
      notedAgain.ticket.notes.filter((n) => n.clientRef === "note-1").length,
      1,
    );

    const linked = await botLinkTicket(
      `#${String(created.ticket.number).padStart(4, "0")}`,
      { vyjazdId: "V-0001" },
      { id: "servis", name: "Servis bot" },
    );
    assert.equal(linked.linked, true);
    assert.equal(linked.vyjazd.ticketId, created.ticket.id);
    assert.ok(linked.ticket.notes.some((n) => n.text.includes("V-0001")));

    const closed = await botCloseTicket(
      created.ticket.id,
      {},
      { id: "servis", name: "Servis bot" },
    );
    assert.equal(closed.ticket.status, "hotove");
    assert.equal(closed.changed, true);

    const listed = await botListTickets(
      new URL(
        "https://servislist.vercel.app/api/v1/tickets?status=hotove&prevadzka=COOP",
      ),
    );
    assert.equal(listed.count, 1);
    assert.equal(listed.tickets[0].id, created.ticket.id);
  });

  test("číta zariadenia a prevádzky bez Balena syncu", async () => {
    const devices = await store.listDevices();
    assert.equal(devices.length, 1);
    const prevadzky = await store.listPrevadzky("Martin");
    assert.equal(prevadzky.length, 1);
    assert.equal(prevadzky[0].partner, "COOP");
    const ticket = await store.getTicketByRef("1");
    assert.ok(ticket);
    const vyjazd = await store.getVyjazdByRef("V-0001");
    assert.ok(vyjazd);
    assert.equal(vyjazd.ticketId, ticket.id);
  });
});
