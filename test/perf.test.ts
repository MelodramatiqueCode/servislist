import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { SCHEMA_VERSION } from "../src/lib/db";
import { matchDevicesForPrevadzka } from "../src/lib/store";
import type { PrevadzkaRecord, ServiceDevice } from "../src/lib/types";

const device = (partial: Partial<ServiceDevice> & Pick<ServiceDevice, "uuid">): ServiceDevice => ({
  uuid: partial.uuid,
  balenaId: 1,
  name: partial.name ?? partial.uuid,
  code: "",
  partner: partial.partner ?? "COOP",
  city: partial.city ?? "Nitra",
  address: partial.address ?? "Hlavná 1",
  phone: "",
  status: "",
  overallStatus: "",
  isOnline: true,
  isConnectedToVpn: true,
  apiHeartbeat: "",
  supervisorVersion: "",
  osVersion: "",
  dashboardUrl: "",
  fleet: "",
  deviceType: "",
  importedAt: "",
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
  ...partial,
});

describe("perf helpers", () => {
  test("schema version is pinned so ensureSchema can skip DDL", () => {
    assert.equal(SCHEMA_VERSION, "perf-1");
  });

  test("functions run next to Neon in Frankfurt", () => {
    const raw = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
    const cfg = JSON.parse(raw) as { regions?: string[] };
    assert.deepEqual(cfg.regions, ["fra1"]);
  });

  test("matchDevicesForPrevadzka prefers linked uuids over store-key fallback", () => {
    const store = {
      id: "s1",
      storeKey: "coop|nitra|hlavná 1",
      code: "1",
      chain: "COOP",
      storeType: "",
      name: "Nitra",
      city: "Nitra",
      address: "Hlavná 1",
      gpsLat: "",
      gpsLng: "",
      phone: "",
      openingHours: {},
      profile: {},
      status: "active",
      jobType: "",
      createdAt: "",
      updatedAt: "",
    } as PrevadzkaRecord;
    const linked = device({ uuid: "a", partner: "Other", city: "X", address: "Y" });
    const fallback = device({ uuid: "b", partner: "COOP", city: "Nitra", address: "Hlavná 1" });
    assert.deepEqual(
      matchDevicesForPrevadzka(store, [linked, fallback], ["a"]).map((d) => d.uuid),
      ["a"],
    );
    assert.deepEqual(
      matchDevicesForPrevadzka(store, [linked, fallback], []).map((d) => d.uuid),
      ["b"],
    );
  });

  test("zariadenia pages do not fetch Balena during render", () => {
    const list = readFileSync(
      new URL("../src/app/zariadenia/page.tsx", import.meta.url),
      "utf8",
    );
    const detail = readFileSync(
      new URL("../src/app/zariadenia/[uuid]/page.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(list, /ensureFreshBalenaSync/);
    assert.doesNotMatch(detail, /ensureFreshBalenaSync/);
  });
});
