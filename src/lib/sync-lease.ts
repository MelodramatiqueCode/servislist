import { promises as fs } from "fs";
import path from "path";
import { ensureSchema, getSql, isDatabaseConfigured } from "./db";
import {
  BALENA_SYNC_LEASE_KEY,
  BALENA_SYNC_LEASE_MS,
} from "./balena-sync-policy";

type Lease = {
  holder: string;
  expiresAt: string;
};

function dataDir() {
  return (
    process.env.SERVISLIST_DATA_DIR?.trim() ||
    path.join(process.cwd(), "data")
  );
}

function leaseFile() {
  return path.join(dataDir(), "balena-sync-lease.json");
}

function nowMs() {
  return Date.now();
}

function parseLease(raw: string): Lease | null {
  try {
    const parsed = JSON.parse(raw) as Lease;
    if (!parsed?.holder || !parsed?.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isExpired(lease: Lease | null, now = nowMs()) {
  if (!lease) return true;
  const t = new Date(lease.expiresAt).getTime();
  return Number.isNaN(t) || t <= now;
}

async function readFileLease(): Promise<Lease | null> {
  try {
    return parseLease(await fs.readFile(leaseFile(), "utf8"));
  } catch {
    return null;
  }
}

async function writeFileLease(lease: Lease | null) {
  await fs.mkdir(dataDir(), { recursive: true });
  if (!lease) {
    await fs.rm(leaseFile(), { force: true });
    return;
  }
  await fs.writeFile(leaseFile(), JSON.stringify(lease), "utf8");
}

export async function acquireSyncLease(
  holder: string,
  ttlMs = BALENA_SYNC_LEASE_MS,
): Promise<boolean> {
  const lease: Lease = {
    holder,
    expiresAt: new Date(nowMs() + ttlMs).toISOString(),
  };
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const sql = getSql();
    const payload = JSON.stringify(lease);
    const rows = await sql`
      INSERT INTO app_meta (key, value)
      VALUES (${BALENA_SYNC_LEASE_KEY}, ${payload})
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value
      WHERE COALESCE(app_meta.value, '') = ''
         OR COALESCE((app_meta.value::jsonb->>'expiresAt'), '') = ''
         OR (app_meta.value::jsonb->>'expiresAt')::timestamptz <= NOW()
      RETURNING key
    `;
    return rows.length > 0;
  }
  const current = await readFileLease();
  if (!isExpired(current)) return false;
  await writeFileLease(lease);
  return true;
}

export async function releaseSyncLease(holder: string) {
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const sql = getSql();
    await sql`
      DELETE FROM app_meta
      WHERE key = ${BALENA_SYNC_LEASE_KEY}
        AND value::jsonb->>'holder' = ${holder}
    `;
    return;
  }
  const current = await readFileLease();
  if (current?.holder === holder) await writeFileLease(null);
}
