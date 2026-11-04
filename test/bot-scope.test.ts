import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import type { ServiceDevice } from "../src/lib/types";
import type * as Store from "../src/lib/store";
import type * as BotApi from "../src/lib/bot-api";
import type * as KontrolaStore from "../src/lib/kontrola-store";
import type * as ApiHttp from "../src/lib/api-http";
import type * as SkladStore from "../src/lib/sklad-store";

const previous = {
  dataDir: process.env.SERVISLIST_DATA_DIR,
  databaseUrl: process.env.DATABASE_URL,
  postgresUrl: process.env.POSTGRES_URL,
  prismaUrl: process.env.POSTGRES_PRISMA_URL,
  servisToken: process.env.SERVIS_BOT_API_TOKEN,
  ustrednaToken: process.env.USTREDNA_BOT_API_TOKEN,
  ustrednaHash: process.env.USTREDNA_BOT_API_TOKEN_HASH,
};

const SERVIS_TOKEN = "servis-scope-test-token";
const USTREDNA_TOKEN = "ustredna-scope-test-token";

const device: ServiceDevice = {
  uuid: "uuid-ustredna-1",
  balenaId: 41,
  name: "41-COOP Zilina",
  code: "41",
  partner: "COOP",
  city: "Žilina",
  address: "Námestie 4",
  phone: "+4219000041",
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

let store: typeof Store;
let bot: typeof BotApi;
let kontrola: typeof KontrolaStore;
let http: typeof ApiHttp;
let sklad: typeof SkladStore;

function botRequest(
  method: string,
  pathname: string,
  token: string,
  body?: unknown,
) {
  return new Request(`http://servislist.test${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

before(async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "servislist-scope-"));
  process.env.SERVISLIST_DATA_DIR = dataDir;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_PRISMA_URL;
  process.env.SERVIS_BOT_API_TOKEN = SERVIS_TOKEN;
  process.env.USTREDNA_BOT_API_TOKEN = USTREDNA_TOKEN;
  delete process.env.USTREDNA_BOT_API_TOKEN_HASH;
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
  kontrola = await import("../src/lib/kontrola-store");
  http = await import("../src/lib/api-http");
  sklad = await import("../src/lib/sklad-store");
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
  if (previous.servisToken === undefined) delete process.env.SERVIS_BOT_API_TOKEN;
  else process.env.SERVIS_BOT_API_TOKEN = previous.servisToken;
  if (previous.ustrednaToken === undefined) {
    delete process.env.USTREDNA_BOT_API_TOKEN;
  } else {
    process.env.USTREDNA_BOT_API_TOKEN = previous.ustrednaToken;
  }
  if (previous.ustrednaHash === undefined) {
    delete process.env.USTREDNA_BOT_API_TOKEN_HASH;
  } else {
    process.env.USTREDNA_BOT_API_TOKEN_HASH = previous.ustrednaHash;
  }
});

describe("isBotRouteAllowed", () => {
  const ustredna = { id: "ustredna", name: "Ústredňa Ozvena", scope: "ustredna" as const };
  const servis = { id: "servis", name: "Servis bot", scope: "full" as const };
  const legacy = { id: "hotline", name: "Hotline bot" };

  test("full a chýbajúci scope pustia všetko", () => {
    assert.equal(
      http.isBotRouteAllowed(servis, "DELETE", "/api/v1/tickets/1/material/x"),
      true,
    );
    assert.equal(
      http.isBotRouteAllowed(legacy, "POST", "/api/v1/tickets/1/close"),
      true,
    );
    assert.equal(
      http.isBotRouteAllowed(legacy, "POST", "/api/v1/sklad/prijem"),
      true,
    );
  });

  test("ustredna allowlist: GET, POST tickets, POST notes", () => {
    assert.equal(http.isBotRouteAllowed(ustredna, "GET", "/api/v1"), true);
    assert.equal(
      http.isBotRouteAllowed(ustredna, "GET", "/api/v1/tickets?status=aktivne"),
      true,
    );
    assert.equal(
      http.isBotRouteAllowed(ustredna, "GET", "/api/v1/tickets/12/"),
      true,
    );
    assert.equal(
      http.isBotRouteAllowed(ustredna, "POST", "/api/v1/tickets"),
      true,
    );
    assert.equal(
      http.isBotRouteAllowed(ustredna, "POST", "/api/v1/tickets/12/notes"),
      true,
    );
    assert.equal(
      http.isBotRouteAllowed(
        ustredna,
        "POST",
        "/api/v1/tickets/53119c16-aaaa-bbbb-cccc-ddddeeeeffff/notes/",
      ),
      true,
    );
  });

  test("ustredna default deny: close, status, PATCH, DELETE, sklad, budúce write", () => {
    const denied = [
      ["POST", "/api/v1/tickets/12/close"],
      ["POST", "/api/v1/tickets/12/reopen"],
      ["PATCH", "/api/v1/tickets/12/status"],
      ["PATCH", "/api/v1/tickets/12"],
      ["POST", "/api/v1/tickets/12/vyjazd"],
      ["POST", "/api/v1/tickets/12/material"],
      ["DELETE", "/api/v1/tickets/12/material/item-1"],
      ["POST", "/api/v1/sklad/prijem"],
      ["POST", "/api/v1/sklad/prijem/dl-1/subor"],
      ["POST", "/api/v1/navrhy"],
      ["POST", "/api/v1/prevadzky"],
      ["PATCH", "/api/v1/prevadzky/p-1"],
      ["POST", "/api/v1/prevadzky/p-1/vykaz"],
      ["POST", "/api/v1/vyjazdy"],
      ["DELETE", "/api/v1/tickets/12"],
      ["POST", "/api/v1/future-write"],
    ] as const;
    for (const [method, path] of denied) {
      assert.equal(
        http.isBotRouteAllowed(ustredna, method, path),
        false,
        `${method} ${path}`,
      );
    }
  });
});

describe("handleBotRoute ustredna scope", () => {
  test("GET /api/v1 je 200 a vráti identitu Ústredne", async () => {
    const response = await http.handleBotRoute(
      botRequest("GET", "/api/v1", USTREDNA_TOKEN),
      async (actor) =>
        http.jsonOk({
          ok: true,
          bot: actor.name,
          botId: actor.id,
          scope: actor.scope,
        }),
    );
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.ok, true);
    assert.equal(body.bot, "Ústredňa Ozvena");
    assert.equal(body.botId, "ustredna");
    assert.equal(body.scope, "ustredna");
  });

  test("POST /api/v1/tickets je 201 a POST notes 201", async () => {
    const created = await http.handleBotRoute(
      botRequest("POST", "/api/v1/tickets", USTREDNA_TOKEN, {
        title: "Ústredňa hlásenie",
        description: "Volali z predajne, pokladňa bliká.",
        deviceUuid: device.uuid,
        clientRef: "ustredna-create-1",
      }),
      async (actor) => {
        const result = await bot.botCreateTicket(
          {
            title: "Ústredňa hlásenie",
            description: "Volali z predajne, pokladňa bliká.",
            deviceUuid: device.uuid,
            clientRef: "ustredna-create-1",
          },
          actor,
          "ustredna-create-1",
        );
        return http.jsonOk(result, result.created ? 201 : 200);
      },
    );
    assert.equal(created.status, 201);
    const createdBody = await json(created);
    assert.equal(createdBody.created, true);
    const ticket = createdBody.ticket as { id: string; number: number; notes: Array<{ author: string }> };
    assert.equal(ticket.notes[0]?.author, "Ústredňa Ozvena");

    const noted = await http.handleBotRoute(
      botRequest("POST", `/api/v1/tickets/${ticket.number}/notes`, USTREDNA_TOKEN, {
        text: "Zákazník volal znova.",
        clientRef: "ustredna-note-1",
      }),
      async (actor) => {
        const result = await bot.botAddNote(
          String(ticket.number),
          { text: "Zákazník volal znova.", clientRef: "ustredna-note-1" },
          actor,
        );
        return http.jsonOk(result, result.created ? 201 : 200);
      },
    );
    assert.equal(noted.status, 201);
    const notedBody = await json(noted);
    assert.equal(notedBody.created, true);
  });

  test("close/status/PATCH/DELETE/sklad vráti 403 bez vedľajších účinkov a ide do Kontroly", async () => {
    const seed = await bot.botCreateTicket(
      {
        title: "Seed ticket",
        description: "Pred scope testom.",
        deviceUuid: device.uuid,
        clientRef: "servis-seed-1",
      },
      { id: "servis", name: "Servis bot", scope: "full" },
    );
    const ticketId = seed.ticket.id;
    const before = await store.getTicket(ticketId);
    assert.ok(before);
    const beforeNotes = before!.notes.length;
    const beforeStatus = before!.status;
    const beforeSklad = (await sklad.skladSnapshot()).pohyby.length;

    const denied = [
      ["POST", `/api/v1/tickets/${ticketId}/close`, { note: "nesmie" }],
      ["PATCH", `/api/v1/tickets/${ticketId}/status`, { status: "hotove" }],
      ["PATCH", `/api/v1/tickets/${ticketId}`, { title: "prepísané" }],
      ["DELETE", `/api/v1/tickets/${ticketId}/material/item-1`],
      ["POST", "/api/v1/sklad/prijem", { cisloDl: "DL-403" }],
    ] as const;

    for (const [method, pathname, body] of denied) {
      let ran = false;
      const response = await http.handleBotRoute(
        botRequest(method, pathname, USTREDNA_TOKEN, body),
        async () => {
          ran = true;
          return http.jsonOk({ mutated: true });
        },
      );
      assert.equal(response.status, 403, `${method} ${pathname}`);
      assert.equal(ran, false, `handler ran for ${method} ${pathname}`);
      const payload = await json(response);
      assert.equal(payload.error, "forbidden_scope");
    }

    const after = await store.getTicket(ticketId);
    assert.equal(after?.status, beforeStatus);
    assert.equal(after?.notes.length, beforeNotes);
    assert.equal(after?.title, before?.title);
    assert.equal((await sklad.skladSnapshot()).pohyby.length, beforeSklad);

    const audit = await kontrola.listAudit({ akcia: "forbidden_scope" });
    assert.ok(audit.length >= denied.length);
    for (const row of audit) {
      assert.equal(row.autor, "ustredna_bot");
      assert.equal(row.akcia, "forbidden_scope");
      assert.ok(row.diff && typeof row.diff === "object");
      assert.equal((row.diff as { bot?: string }).bot, "ustredna");
      assert.ok(row.popis.includes("Ústredňa Ozvena"));
    }
    assert.ok(
      audit.some(
        (row) =>
          row.diff &&
          (row.diff as { method?: string; path?: string }).method === "POST" &&
          String((row.diff as { path?: string }).path).includes("/close"),
      ),
    );

    const errors = await kontrola.listAppErrors();
    assert.ok(
      errors.some(
        (row) =>
          row.zdroj === "api" &&
          row.status === 403 &&
          row.bot === "Ústredňa Ozvena" &&
          row.route.includes("/close"),
      ),
    );

    const requests = await kontrola.listBotRequests();
    assert.ok(
      requests.some(
        (row) =>
          row.bot === "ustredna" &&
          row.status === 403 &&
          row.method === "POST" &&
          row.path.includes("/close"),
      ),
    );
  });

  test("existujúci full bot stále môže close a status", async () => {
    const seed = await bot.botCreateTicket(
      {
        title: "Servis seed",
        description: "Full bot môže zatvoriť.",
        deviceUuid: device.uuid,
        clientRef: "servis-full-1",
      },
      { id: "servis", name: "Servis bot", scope: "full" },
    );
    let ran = false;
    const response = await http.handleBotRoute(
      botRequest("POST", `/api/v1/tickets/${seed.ticket.id}/close`, SERVIS_TOKEN, {
        note: "hotovo",
      }),
      async (actor) => {
        ran = true;
        const result = await bot.botCloseTicket(
          seed.ticket.id,
          { note: "hotovo" },
          actor,
        );
        return http.jsonOk(result);
      },
    );
    assert.equal(response.status, 200);
    assert.equal(ran, true);
    const closed = await store.getTicket(seed.ticket.id);
    assert.equal(closed?.status, "hotove");
  });
});
