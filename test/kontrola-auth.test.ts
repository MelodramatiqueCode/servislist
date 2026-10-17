import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  clearLoginFailures,
  getKontrolaPassword,
  isKontrolaConfigured,
  loginBackoff,
  recordLoginFailure,
  resetLoginLimiter,
  signKontrolaToken,
  verifyKontrolaPassword,
  verifyKontrolaToken,
} from "../src/lib/kontrola-auth";
import { searchCommands } from "../src/lib/search";

const previous = process.env.KONTROLA_PASSWORD;

describe("kontrola auth", () => {
  before(() => {
    process.env.KONTROLA_PASSWORD = "tajne-heslo-martin";
    resetLoginLimiter();
  });

  after(() => {
    if (previous === undefined) delete process.env.KONTROLA_PASSWORD;
    else process.env.KONTROLA_PASSWORD = previous;
    resetLoginLimiter();
  });

  test("unset password denies access", () => {
    const keep = process.env.KONTROLA_PASSWORD;
    delete process.env.KONTROLA_PASSWORD;
    assert.equal(isKontrolaConfigured(), false);
    assert.equal(getKontrolaPassword(), "");
    assert.equal(verifyKontrolaPassword("x"), false);
    assert.equal(signKontrolaToken(), "");
    assert.equal(verifyKontrolaToken("v1.1.abc"), false);
    process.env.KONTROLA_PASSWORD = keep;
  });

  test("password compare is constant-time and exact", () => {
    assert.equal(verifyKontrolaPassword("tajne-heslo-martin"), true);
    assert.equal(verifyKontrolaPassword("tajne-heslo-MartiN"), false);
    assert.equal(verifyKontrolaPassword(""), false);
  });

  test("HMAC token lasts 30 days and rejects tampers", () => {
    const now = Date.parse("2026-10-17T08:00:00.000Z");
    const token = signKontrolaToken("tajne-heslo-martin", now);
    assert.match(token, /^v1\.\d+\.[0-9a-f]+$/);
    assert.equal(verifyKontrolaToken(token, "tajne-heslo-martin", now), true);
    assert.equal(
      verifyKontrolaToken(token, "tajne-heslo-martin", now + 29 * 24 * 3600_000),
      true,
    );
    assert.equal(
      verifyKontrolaToken(token, "tajne-heslo-martin", now + 31 * 24 * 3600_000),
      false,
    );
    assert.equal(verifyKontrolaToken(token + "0", "tajne-heslo-martin", now), false);
    assert.equal(verifyKontrolaToken(token, "ine-heslo", now), false);
  });

  test("failed logins back off and then lock", () => {
    const key = "test-ip";
    clearLoginFailures(key);
    assert.equal(loginBackoff(key).blocked, false);
    let last = loginBackoff(key);
    for (let i = 0; i < 5; i += 1) {
      last = recordLoginFailure(key, 1_000);
    }
    assert.equal(last.blocked, true);
    assert.ok(last.delayMs > 0);
    clearLoginFailures(key);
    assert.equal(loginBackoff(key).blocked, false);
  });

  test("⌘K hides Kontrola until unlocked", () => {
    assert.equal(
      searchCommands("kontrola").some((h) => h.href === "/kontrola"),
      false,
    );
    assert.equal(
      searchCommands("kontrola", { includeKontrola: true }).some(
        (h) => h.href === "/kontrola",
      ),
      true,
    );
  });
});
