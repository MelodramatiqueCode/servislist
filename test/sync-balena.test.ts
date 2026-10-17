import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "path";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import {
  BALENA_FETCH_TIMEOUT_MS,
  BALENA_FULL_REFRESH_MS,
  BALENA_PAGE_SIZE,
  BALENA_SYNC_LEASE_MS,
  BALENA_SYNC_MAX_DURATION_SEC,
  KONTROLA_SYNC_OK_MINUTES,
} from "../src/lib/balena-sync-policy";
import { acquireSyncLease, releaseSyncLease } from "../src/lib/sync-lease";

describe("balena sync policy", () => {
  test("cron does not force a full refresh every 5 minutes", () => {
    const raw = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
    const cfg = JSON.parse(raw) as { crons?: Array<{ path: string; schedule: string }> };
    const cron = cfg.crons?.find((c) => c.path.includes("sync-balena"));
    assert.ok(cron);
    assert.equal(cron?.path, "/api/sync-balena");
    assert.equal(cron?.schedule, "*/5 * * * *");
    assert.doesNotMatch(cron?.path ?? "", /force=1/);
  });

  test("route sets maxDuration and fetch timeout below the 300s wall", () => {
    const route = readFileSync(
      new URL("../src/app/api/sync-balena/route.ts", import.meta.url),
      "utf8",
    );
    assert.match(route, /export const maxDuration = 90/);
    assert.equal(BALENA_SYNC_MAX_DURATION_SEC, 90);
    assert.equal(BALENA_FETCH_TIMEOUT_MS, 15_000);
    assert.equal(BALENA_PAGE_SIZE, 400);
    assert.ok(BALENA_FULL_REFRESH_MS === 60 * 60 * 1000);
    assert.ok(BALENA_SYNC_LEASE_MS < BALENA_SYNC_MAX_DURATION_SEC * 1000);
  });

  test("Kontrola still treats an hourly refresh as healthy", () => {
    assert.equal(KONTROLA_SYNC_OK_MINUTES, 70);
    const view = readFileSync(
      new URL("../src/lib/kontrola-view.ts", import.meta.url),
      "utf8",
    );
    assert.match(view, /KONTROLA_SYNC_OK_MINUTES/);
  });
});

describe("sync lease", () => {
  let dir = "";
  const previous = {
    dataDir: process.env.SERVISLIST_DATA_DIR,
    databaseUrl: process.env.DATABASE_URL,
    postgresUrl: process.env.POSTGRES_URL,
    prismaUrl: process.env.POSTGRES_PRISMA_URL,
  };

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "servislist-lease-"));
    process.env.SERVISLIST_DATA_DIR = dir;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;
  });

  after(async () => {
    if (previous.dataDir === undefined) delete process.env.SERVISLIST_DATA_DIR;
    else process.env.SERVISLIST_DATA_DIR = previous.dataDir;
    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.databaseUrl;
    if (previous.postgresUrl === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = previous.postgresUrl;
    if (previous.prismaUrl === undefined) delete process.env.POSTGRES_PRISMA_URL;
    else process.env.POSTGRES_PRISMA_URL = previous.prismaUrl;
    await rm(dir, { recursive: true, force: true });
  });

  test("second acquire is skipped until release or expiry", async () => {
    assert.equal(await acquireSyncLease("a", 60_000), true);
    assert.equal(await acquireSyncLease("b", 60_000), false);
    await releaseSyncLease("b");
    assert.equal(await acquireSyncLease("c", 60_000), false);
    await releaseSyncLease("a");
    assert.equal(await acquireSyncLease("c", 60_000), true);
    await releaseSyncLease("c");
  });

  test("expired lease can be taken over", async () => {
    assert.equal(await acquireSyncLease("old", 1), true);
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(await acquireSyncLease("new", 60_000), true);
    await releaseSyncLease("new");
  });
});
