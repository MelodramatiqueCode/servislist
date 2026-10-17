import { createHmac, createHash, timingSafeEqual } from "crypto";
import { safeEqualHex } from "./bot-auth";

export const KONTROLA_COOKIE = "sl_kontrola";
export const KONTROLA_SESSION_DAYS = 30;
const SESSION_MS = KONTROLA_SESSION_DAYS * 24 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCK_MS = 2 * 60 * 1000;

type FailState = { n: number; lockedUntil: number };

const failures = new Map<string, FailState>();

export function getKontrolaPassword() {
  return process.env.KONTROLA_PASSWORD?.trim() || "";
}

export function isKontrolaConfigured() {
  return Boolean(getKontrolaPassword());
}

export function hashUtf8(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function verifyKontrolaPassword(input: string, expected = getKontrolaPassword()) {
  if (!expected) return false;
  return safeEqualHex(hashUtf8(input), hashUtf8(expected));
}

export function signKontrolaToken(
  password = getKontrolaPassword(),
  now = Date.now(),
) {
  if (!password) return "";
  const exp = now + SESSION_MS;
  const payload = `v1.${exp}`;
  const sig = createHmac("sha256", password).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyKontrolaToken(
  token: string,
  password = getKontrolaPassword(),
  now = Date.now(),
) {
  if (!password || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  const sig = parts[2] ?? "";
  if (!Number.isFinite(exp) || exp <= now) return false;
  const expected = createHmac("sha256", password)
    .update(`v1.${exp}`)
    .digest("hex");
  if (expected.length !== sig.length) {
    try {
      const a = Buffer.from(expected, "hex");
      const b = Buffer.alloc(a.length);
      timingSafeEqual(a, b);
    } catch {
      /* ignore */
    }
    return false;
  }
  return safeEqualHex(expected, sig);
}

export function kontrolaCookieOptions() {
  return {
    httpOnly: true as const,
    secure:
      process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL),
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(SESSION_MS / 1000),
  };
}

export function loginBackoff(key: string, now = Date.now()) {
  const row = failures.get(key);
  if (!row) return { blocked: false, delayMs: 400, attempts: 0 };
  if (row.lockedUntil > now) {
    return { blocked: true, delayMs: Math.min(row.lockedUntil - now, LOCK_MS), attempts: row.n };
  }
  return {
    blocked: false,
    delayMs: Math.min(400 + row.n * 250, 2000),
    attempts: row.n,
  };
}

export function recordLoginFailure(key: string, now = Date.now()) {
  const row = failures.get(key) ?? { n: 0, lockedUntil: 0 };
  row.n += 1;
  if (row.n >= MAX_FAILURES) row.lockedUntil = now + LOCK_MS;
  failures.set(key, row);
  return loginBackoff(key, now);
}

export function clearLoginFailures(key: string) {
  failures.delete(key);
}

export function resetLoginLimiter() {
  failures.clear();
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
