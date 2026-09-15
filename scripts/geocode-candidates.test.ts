import assert from "node:assert/strict";
import {
  composeDeviceStopAddress,
  geocodeCandidates,
} from "../src/lib/geocode-query.ts";
import { parseDeviceName } from "../src/lib/parse-device.ts";
import { stopFromDevice, stopMapsQuery } from "../src/lib/vyjazd-stops.ts";

let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`fail  ${name}`);
    console.error(error);
  }
}

function has(list: string[], needle: string) {
  return list.some((item) => item.toLowerCase() === needle.toLowerCase());
}

test("Filakovo middot label → city + SK/SK aliases, no middot query", () => {
  const candidates = geocodeCandidates({
    store: "#42 · Massiva · Filakovo",
    address: "",
  });
  assert.ok(candidates.length > 0, "expected candidates");
  assert.equal(candidates[0], "Filakovo, Slovensko");
  assert.ok(has(candidates, "Filakovo, Slovakia"));
  assert.ok(has(candidates, "Filakovo"));
  assert.ok(has(candidates, "Fiľakovo, Slovensko"));
  assert.ok(has(candidates, "Fiľakovo"));
  assert.ok(
    !candidates.some((item) => item.includes("·")),
    `middot label must not be queried: ${candidates.join(" | ")}`,
  );
  assert.ok(!candidates.some((item) => /#\d+/.test(item)));
});

test("Fiľakovo store label with empty address", () => {
  const candidates = geocodeCandidates({
    store: "#200 · JLM · Fiľakovo",
    address: "",
  });
  assert.equal(candidates[0], "Fiľakovo, Slovensko");
  assert.ok(has(candidates, "Filakovo, Slovensko"));
  assert.ok(!candidates.some((item) => item.includes("·")));
});

test("real street is preferred over store label", () => {
  const candidates = geocodeCandidates({
    store: "#200 · JLM · Fiľakovo",
    address: "Farská lúka 1886/64C",
  });
  assert.equal(candidates[0], "Farská lúka 1886/64C, Fiľakovo");
  assert.ok(has(candidates, "Farská lúka 1886/64C"));
  assert.ok(has(candidates, "Fiľakovo, Slovensko"));
  assert.ok(has(candidates, "Filakovo, Slovensko"));
});

test("Balena device_name dump is not used as-is; street + city extracted", () => {
  const candidates = geocodeCandidates({
    store: "#200 · JLM · Fiľakovo",
    address: "200-JLM-PJ435,Fiľakovo,Farská lúka 1886/64C",
  });
  assert.equal(candidates[0], "Farská lúka 1886/64C, Fiľakovo");
  assert.ok(!candidates.some((item) => item.startsWith("200-JLM")));
  assert.ok(!candidates.some((item) => item.includes("·")));
});

test("PJ435 prefix on saved address is stripped", () => {
  const candidates = geocodeCandidates({
    store: "#200 · JLM · Fiľakovo",
    address: "PJ435, Farská lúka 1886/64C",
  });
  assert.equal(candidates[0], "Farská lúka 1886/64C, Fiľakovo");
});

test("code-partner dump with only city falls back to Filakovo", () => {
  const candidates = geocodeCandidates({
    store: "#42 · Massiva · Filakovo",
    address: "42-Massiva, Filakovo",
  });
  assert.equal(candidates[0], "Filakovo, Slovensko");
  assert.ok(has(candidates, "Fiľakovo, Slovensko"));
  assert.ok(!candidates.some((item) => item.includes("Massiva")));
});

test("stopMapsQuery uses first geocode-friendly candidate", () => {
  assert.equal(
    stopMapsQuery({ store: "#42 · Massiva · Filakovo", address: "" }),
    "Filakovo, Slovensko",
  );
});

test("parseDeviceName Filakovo street is not prefixed with PJ435", () => {
  const parsed = parseDeviceName(
    "200-JLM-PJ435,Fiľakovo,Farská lúka 1886/64C",
  );
  assert.equal(parsed.city, "Fiľakovo");
  assert.equal(parsed.address, "Farská lúka 1886/64C");
  assert.equal(parsed.label, "#200 · JLM · Fiľakovo");
});

test("parseDeviceName city-only does not dump full device_name as address", () => {
  const parsed = parseDeviceName("42-Massiva, Filakovo");
  assert.equal(parsed.city, "Filakovo");
  assert.equal(parsed.address, "");
});

test("composeDeviceStopAddress + stopFromDevice for Filakovo device", () => {
  const composed = composeDeviceStopAddress({
    name: "200-JLM-PJ435,Fiľakovo,Farská lúka 1886/64C",
    city: "Fiľakovo",
    address: "Farská lúka 1886/64C",
  });
  assert.equal(composed, "Farská lúka 1886/64C, Fiľakovo");

  const stop = stopFromDevice({
    uuid: "abc",
    code: "200",
    partner: "JLM",
    city: "Fiľakovo",
    name: "200-JLM-PJ435,Fiľakovo,Farská lúka 1886/64C",
    address: "PJ435, Farská lúka 1886/64C",
    phone: "",
  });
  assert.equal(stop.store, "#200 · JLM · Fiľakovo");
  assert.equal(stop.address, "Farská lúka 1886/64C, Fiľakovo");
});

test("stopFromDevice with middot name and empty city still gets Filakovo", () => {
  const stop = stopFromDevice(
    {
      uuid: "x",
      code: "",
      partner: "",
      city: "",
      name: "#42 · Massiva · Filakovo",
      address: "42-Massiva, Filakovo",
      phone: "",
    },
    { store: "#42 · Massiva · Filakovo" },
  );
  assert.equal(stop.address, "Filakovo");
});

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
