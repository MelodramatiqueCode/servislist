import { cookies, headers } from "next/headers";
import {
  KONTROLA_COOKIE,
  clearLoginFailures,
  getKontrolaPassword,
  isKontrolaConfigured,
  kontrolaCookieOptions,
  loginBackoff,
  recordLoginFailure,
  signKontrolaToken,
  sleep,
  verifyKontrolaPassword,
  verifyKontrolaToken,
} from "./kontrola-auth";

export { isKontrolaConfigured };

export async function isKontrolaUnlocked() {
  const password = getKontrolaPassword();
  if (!password) return false;
  const jar = await cookies();
  return verifyKontrolaToken(jar.get(KONTROLA_COOKIE)?.value ?? "", password);
}

export async function requireKontrolaSession() {
  if (!(await isKontrolaUnlocked())) {
    throw new Error("Kontrola je zamknutá.");
  }
}

export async function kontrolaLoginKey() {
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip")?.trim() ||
    "local";
  return `kontrola:${ip}`;
}

export async function establishKontrolaSession() {
  const password = getKontrolaPassword();
  if (!password) return false;
  const jar = await cookies();
  jar.set(KONTROLA_COOKIE, signKontrolaToken(password), kontrolaCookieOptions());
  return true;
}

export async function clearKontrolaSession() {
  const jar = await cookies();
  jar.set(KONTROLA_COOKIE, "", { ...kontrolaCookieOptions(), maxAge: 0 });
}

export async function attemptKontrolaLogin(password: string) {
  if (!isKontrolaConfigured()) {
    return { ok: false as const, reason: "unset" as const };
  }
  const key = await kontrolaLoginKey();
  const backoff = loginBackoff(key);
  if (backoff.blocked) {
    await sleep(Math.min(backoff.delayMs, 1500));
    return { ok: false as const, reason: "limit" as const };
  }
  if (!verifyKontrolaPassword(password)) {
    const next = recordLoginFailure(key);
    await sleep(next.delayMs);
    return { ok: false as const, reason: "bad" as const };
  }
  clearLoginFailures(key);
  await establishKontrolaSession();
  return { ok: true as const };
}
