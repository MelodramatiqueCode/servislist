import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  deviceIsOnline,
  hadReplacementPrefix,
  inheritStoreFields,
  pairReplacementDevices,
  planRemovedFromBalena,
  planStoreMerges,
  storeIdentityKey,
  stripDeviceNamePrefix,
} from "../src/lib/device-lifecycle";
import { parseDeviceName } from "../src/lib/parse-device";
import type { ServiceDevice } from "../src/lib/types";

function device(
  partial: Partial<ServiceDevice> & Pick<ServiceDevice, "uuid" | "name">,
): ServiceDevice {
  return {
    balenaId: 1,
    code: "",
    partner: "",
    city: "",
    address: "",
    phone: "",
    status: "",
    overallStatus: "",
    isOnline: false,
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
  };
}

describe("device name prefixes", () => {
  test("strips Nova/Nová/Nové/NÓVÁ and repeated NOVÁ2", () => {
    assert.equal(stripDeviceNamePrefix("Nova-44-VerexVO-051").name, "44-VerexVO-051");
    assert.equal(stripDeviceNamePrefix("Nová 135-KARMENMO-K30").name, "135-KARMENMO-K30");
    assert.equal(stripDeviceNamePrefix("Nové-377-JNZ-PJ129").name, "377-JNZ-PJ129");
    assert.equal(stripDeviceNamePrefix("NÓVÁ 49-GVPMO-P003").name, "49-GVPMO-P003");
    assert.equal(
      stripDeviceNamePrefix("NOVÁ NOVÁ2 49-GVPMO-P003").name,
      "49-GVPMO-P003",
    );
    assert.equal(
      stripDeviceNamePrefix("Prerábka predajne do konca októbra 12-COOP-X").name,
      "12-COOP-X",
    );
    assert.equal(hadReplacementPrefix("44-VerexVO-051"), false);
  });

  test("parseDeviceName maps prefixed names onto the original code", () => {
    assert.equal(parseDeviceName("Nova-44-VerexVO-051").code, "44");
    assert.equal(parseDeviceName("Nova-44-VerexVO-051").partner, "VerexVO");
    assert.equal(parseDeviceName("NOVÁ NOVÁ2 49-GVPMO-P003").code, "49");
    assert.equal(parseDeviceName("49-GVPMO-P003").code, "49");
    assert.equal(
      storeIdentityKey(parseDeviceName("Nova-44-VerexVO-051")),
      storeIdentityKey(parseDeviceName("44-VerexVO-051")),
    );
  });
});

describe("device online", () => {
  test("heartbeat or overall_status can keep a device online", () => {
    assert.equal(deviceIsOnline({ is_online: false }), false);
    assert.equal(
      deviceIsOnline({ is_online: false, api_heartbeat_state: "online" }),
      true,
    );
    assert.equal(
      deviceIsOnline({ is_online: false, overall_status: "operational" }),
      true,
    );
    assert.equal(
      deviceIsOnline({
        is_online: false,
        overall_status: "reduced-functionality",
      }),
      true,
    );
  });
});

describe("ghosts", () => {
  test("marks missing uuids and unmarks on return", () => {
    const existing = Array.from({ length: 11 }, (_, i) =>
      device({ uuid: `u${i}`, name: `${i}-X` }),
    );
    const first = planRemovedFromBalena({
      remoteUuids: existing.slice(0, 10).map((d) => d.uuid),
      devices: existing,
      now: "2026-10-23T00:00:00.000Z",
    });
    assert.equal(first.skipped, null);
    assert.equal(first.marked, 1);
    assert.equal(
      first.devices.find((d) => d.uuid === "u10")?.removedFromBalenaAt,
      "2026-10-23T00:00:00.000Z",
    );

    const back = planRemovedFromBalena({
      remoteUuids: existing.map((d) => d.uuid),
      devices: first.devices,
      now: "2026-10-23T01:00:00.000Z",
    });
    assert.equal(back.unmarked, 1);
    assert.equal(
      back.devices.find((d) => d.uuid === "u10")?.removedFromBalenaAt,
      undefined,
    );
  });

  test("skips empty remote and mass disappear >10%", () => {
    const ten = Array.from({ length: 10 }, (_, i) =>
      device({ uuid: `u${i}`, name: `${i}-X` }),
    );
    assert.equal(
      planRemovedFromBalena({ remoteUuids: [], devices: ten, now: "t" }).skipped,
      "empty_remote",
    );
    const mass = planRemovedFromBalena({
      remoteUuids: ["u0"],
      devices: ten,
      now: "t",
    });
    assert.equal(mass.skipped, "mass_disappear");
    assert.equal(mass.marked, 0);
    assert.equal(ten.filter((d) => d.removedFromBalenaAt).length, 0);
  });
});

describe("replacement pairing", () => {
  test("inherits real city/address over a site-code suffix", () => {
    const old = device({
      uuid: "f22219e8",
      name: "44-VerexVO-051",
      code: "44",
      partner: "VerexVO",
      city: "Martin",
      address: "Hlavná 1",
    });
    const neu = device({
      uuid: "58c6452c",
      name: "Nova-44-VerexVO-051",
      code: "44",
      partner: "VerexVO",
      address: "051",
    });
    const inherited = inheritStoreFields([old, neu]);
    const next = inherited.find((d) => d.uuid === "58c6452c");
    assert.equal(next?.city, "Martin");
    assert.equal(next?.address, "Hlavná 1");
  });

  test("inherits city and marks the old UUID as replaced", () => {
    const old = device({
      uuid: "f22219e8",
      name: "44-VerexVO-051",
      code: "44",
      partner: "VerexVO",
      city: "Martin",
      address: "Hlavná 1",
    });
    const neu = device({
      uuid: "58c6452c",
      name: "Nova-44-VerexVO-051",
      code: "44",
      partner: "VerexVO",
      isOnline: true,
    });
    const inherited = inheritStoreFields([old, neu]);
    assert.equal(inherited.find((d) => d.uuid === "58c6452c")?.city, "Martin");
    const paired = pairReplacementDevices(inherited);
    assert.equal(paired.find((d) => d.uuid === "f22219e8")?.replacedByUuid, "58c6452c");
    assert.equal(paired.find((d) => d.uuid === "58c6452c")?.replacedByUuid, undefined);
  });

  test("pairs GVPMO 49 nova siblings onto the original", () => {
    const orig = device({
      uuid: "4158dcd3",
      name: "49-GVPMO-P003",
      code: "49",
      partner: "GVPMO",
      city: "Nitra",
    });
    const nova = device({
      uuid: "1fe0c6c8",
      name: "NÓVÁ 49-GVPMO-P003",
      code: "49",
      partner: "GVPMO",
    });
    const nova2 = device({
      uuid: "291d8894",
      name: "NOVÁ NOVÁ2 49-GVPMO-P003",
      code: "49",
      partner: "GVPMO",
      isOnline: true,
    });
    const paired = pairReplacementDevices(inheritStoreFields([orig, nova, nova2]));
    assert.equal(paired.find((d) => d.uuid === "291d8894")?.replacedByUuid, undefined);
    assert.equal(paired.find((d) => d.uuid === "4158dcd3")?.replacedByUuid, "291d8894");
    assert.equal(paired.find((d) => d.uuid === "1fe0c6c8")?.replacedByUuid, "291d8894");
    assert.equal(paired.find((d) => d.uuid === "291d8894")?.city, "Nitra");
  });

  test("does not mark two ordinary devices at the same store", () => {
    const a = device({
      uuid: "a",
      name: "12-COOP-X",
      code: "12",
      partner: "COOP",
      city: "Nitra",
    });
    const b = device({
      uuid: "b",
      name: "12-COOP-Y",
      code: "12",
      partner: "COOP",
      city: "Nitra",
    });
    const paired = pairReplacementDevices([a, b]);
    assert.equal(paired.every((d) => !d.replacedByUuid), true);
  });

  test("plans a merge of a nova-only store into the original", () => {
    const devices = [
      device({
        uuid: "old",
        name: "44-VerexVO-051",
        code: "44",
        partner: "VerexVO",
        city: "Martin",
      }),
      device({
        uuid: "neu",
        name: "Nova-44-VerexVO-051",
        code: "44",
        partner: "VerexVO",
        city: "Martin",
        replacedByUuid: undefined,
      }),
    ];
    const stores = [
      {
        id: "orig",
        storeKey: "verexvo|martin|",
        code: "44",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "dup",
        storeKey: "device:neu",
        code: "",
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ];
    const links = new Map([
      ["orig", ["old"]],
      ["dup", ["neu"]],
    ]);
    const plan = planStoreMerges(stores, links, devices);
    assert.equal(plan.length, 1);
    assert.equal(plan[0].keeperId, "orig");
    assert.deepEqual(plan[0].absorbIds, ["dup"]);
  });

  test("merges a leftover nova store still linked to a ghost UUID", () => {
    const devices = [
      device({
        uuid: "4158dcd3",
        name: "49-GVPMO-P003",
        code: "49",
        partner: "GVPMO",
        city: "Čierna nad Tisou",
        removedFromBalenaAt: "2026-10-23T00:00:00.000Z",
      }),
      device({
        uuid: "1fe0c6c8",
        name: "NÓVÁ 49-GVPMO-P003",
        code: "49",
        partner: "GVPMO",
        city: "Čierna nad Tisou",
        removedFromBalenaAt: "2026-10-23T00:00:00.000Z",
      }),
      device({
        uuid: "291d8894",
        name: "NOVÁ NOVÁ2 49-GVPMO-P003",
        code: "49",
        partner: "GVPMO",
        city: "Čierna nad Tisou",
        isOnline: true,
      }),
    ];
    const stores = [
      {
        id: "orig",
        storeKey: "gvpmo|cierna|dukelskych",
        code: "49",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "dup",
        storeKey: "device:1fe0c6c8",
        code: "",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ];
    const links = new Map([
      ["orig", ["4158dcd3", "291d8894"]],
      ["dup", ["1fe0c6c8", "291d8894"]],
    ]);
    const plan = planStoreMerges(stores, links, devices);
    assert.equal(plan.length, 1);
    assert.equal(plan[0].keeperId, "orig");
    assert.deepEqual(plan[0].absorbIds, ["dup"]);
  });
});
