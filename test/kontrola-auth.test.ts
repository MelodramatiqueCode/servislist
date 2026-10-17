import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, test } from "node:test";
import {
  clearLoginFailures,
  getKontrolaPassword,
  getKontrolaPasswordHash,
  getKontrolaSecret,
  hashUtf8,
  isKontrolaConfigured,
  loginBackoff,
  recordLoginFailure,
  resetLoginLimiter,
  signKontrolaToken,
  verifyKontrolaPassword,
  verifyKontrolaToken,
} from "../src/lib/kontrola-auth";
import { searchCommands } from "../src/lib/search";

const PLAIN = "tajne-heslo-martin";
const HASH = hashUtf8(PLAIN);

const previousPassword = process.env.KONTROLA_PASSWORD;
const previousHash = process.env.KONTROLA_PASSWORD_SHA256;

function restoreEnv(password?: string, hash?: string) {
  if (password === undefined) delete process.env.KONTROLA_PASSWORD;
  else process.env.KONTROLA_PASSWORD = password;
  if (hash === undefined) delete process.env.KONTROLA_PASSWORD_SHA256;
  else process.env.KONTROLA_PASSWORD_SHA256 = hash;
}

describe("kontrola auth", () => {
  before(() => {
    restoreEnv(PLAIN);
    resetLoginLimiter();
  });

  after(() => {
    restoreEnv(previousPassword, previousHash);
    resetLoginLimiter();
  });

  beforeEach(() => {
    restoreEnv(PLAIN);
    resetLoginLimiter();
  });

  test("unset password denies access", () => {
    restoreEnv();
    assert.equal(isKontrolaConfigured(), false);
    assert.equal(getKontrolaPassword(), "");
    assert.equal(getKontrolaPasswordHash(), "");
    assert.equal(getKontrolaSecret(), "");
    assert.equal(verifyKontrolaPassword("x"), false);
    assert.equal(signKontrolaToken(), "");
    assert.equal(verifyKontrolaToken("v1.1.abc"), false);
  });

  test("configured when either env var is set", () => {
    restoreEnv();
    assert.equal(isKontrolaConfigured(), false);
    restoreEnv(PLAIN);
    assert.equal(isKontrolaConfigured(), true);
    restoreEnv(undefined, HASH);
    assert.equal(isKontrolaConfigured(), true);
    restoreEnv("[REDACTED]", HASH);
    assert.equal(isKontrolaConfigured(), true);
  });

  test("password compare is constant-time and exact", () => {
    assert.equal(verifyKontrolaPassword(PLAIN), true);
    assert.equal(verifyKontrolaPassword("tajne-heslo-MartiN"), false);
    assert.equal(verifyKontrolaPassword(""), false);
  });

  test("SHA-256 env is preferred and ignores mangled plaintext", () => {
    restoreEnv("[REDACTED]", `  ${HASH.toUpperCase()}  `);
    assert.equal(getKontrolaPasswordHash(), HASH);
    assert.equal(getKontrolaSecret(), HASH);
    assert.equal(verifyKontrolaPassword(PLAIN), true);
    assert.equal(verifyKontrolaPassword("[REDACTED]"), false);
    assert.equal(verifyKontrolaPassword("ine"), false);
  });

  test("HMAC uses the hash as key when SHA-256 env is set", () => {
    restoreEnv("[REDACTED]", HASH);
    const now = Date.parse("2026-10-17T08:00:00.000Z");
    const token = signKontrolaToken(undefined, now);
    assert.match(token, /^v1\.\d+\.[0-9a-f]+$/);
    assert.equal(verifyKontrolaToken(token, HASH, now), true);
    assert.equal(verifyKontrolaToken(token, PLAIN, now), false);
    assert.equal(verifyKontrolaToken(token, "[REDACTED]", now), false);
  });

  test("plaintext password stays as fallback when hash is missing", () => {
    restoreEnv(PLAIN);
    assert.equal(getKontrolaSecret(), PLAIN);
    assert.equal(verifyKontrolaPassword(PLAIN), true);
    const now = Date.parse("2026-10-17T08:00:00.000Z");
    const token = signKontrolaToken(PLAIN, now);
    assert.equal(verifyKontrolaToken(token, PLAIN, now), true);
  });

  test("HMAC token lasts 30 days and rejects tampers", () => {
    const now = Date.parse("2026-10-17T08:00:00.000Z");
    const token = signKontrolaToken(PLAIN, now);
    assert.match(token, /^v1\.\d+\.[0-9a-f]+$/);
    assert.equal(verifyKontrolaToken(token, PLAIN, now), true);
    assert.equal(
      verifyKontrolaToken(token, PLAIN, now + 29 * 24 * 3600_000),
      true,
    );
    assert.equal(
      verifyKontrolaToken(token, PLAIN, now + 31 * 24 * 3600_000),
      false,
    );
    assert.equal(verifyKontrolaToken(token + "0", PLAIN, now), false);
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

  test("login form POSTs urlencoded password to /kontrola/login", () => {
    const src = readFileSync(
      new URL("../src/components/kontrola-login.tsx", import.meta.url),
      "utf8",
    );
    assert.match(src, /method="post"/);
    assert.match(src, /action="\/kontrola\/login"/);
    assert.match(src, /application\/x-www-form-urlencoded/);
    assert.match(src, /name="password"/);
    assert.match(src, /Nesprávne heslo/);
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
