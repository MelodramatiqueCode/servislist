import { ensureSchema, getSql, isDatabaseConfigured } from "./db";
import { planStoreMerges } from "./device-lifecycle";
import {
  appendPrevadzkaHistory,
  listAllPrevadzkaDeviceUuids,
  listStoredPrevadzky,
  storeLabel,
} from "./prevadzka-store";
import type { ServiceDevice } from "./types";

async function absorbStoreDb(keeperId: string, absorbId: string) {
  await ensureSchema();
  const sql = getSql();
  await sql.transaction((txn) => [
    txn`
      INSERT INTO prevadzka_devices (prevadzka_id, device_uuid)
      SELECT ${keeperId}, device_uuid
      FROM prevadzka_devices
      WHERE prevadzka_id = ${absorbId}
      ON CONFLICT (prevadzka_id, device_uuid) DO NOTHING
    `,
    txn`DELETE FROM prevadzka_devices WHERE prevadzka_id = ${absorbId}`,
    txn`UPDATE tickets SET prevadzka_id = ${keeperId} WHERE prevadzka_id = ${absorbId}`,
    txn`UPDATE prevadzka_history SET prevadzka_id = ${keeperId} WHERE prevadzka_id = ${absorbId}`,
    txn`UPDATE vykaz_prace SET prevadzka_id = ${keeperId} WHERE prevadzka_id = ${absorbId}`,
    txn`UPDATE material SET prevadzka_id = ${keeperId} WHERE prevadzka_id = ${absorbId}`,
    txn`UPDATE sklad_pohyby SET prevadzka_id = ${keeperId} WHERE prevadzka_id = ${absorbId}`,
    txn`UPDATE profile_suggestions SET prevadzka_id = ${keeperId} WHERE prevadzka_id = ${absorbId}`,
    txn`
      UPDATE prevadzky
      SET status = 'rejected', updated_at = NOW()
      WHERE id = ${absorbId}
    `,
  ]);
}

/**
 * Duplicitné prevádzky vzniknuté z predpony Nova/Nová/Nové zlúč do pôvodnej.
 * História, výkaz, materiál a tickety sa presunú; duplicita ostane ako rejected.
 */
export async function mergePrefixDuplicateStores(devices: ServiceDevice[]) {
  const [stores, linkMap] = await Promise.all([
    listStoredPrevadzky(),
    listAllPrevadzkaDeviceUuids(),
  ]);
  const plans = planStoreMerges(stores, linkMap, devices);
  if (!plans.length) return { merged: 0 };

  let merged = 0;
  for (const plan of plans) {
    const keeper = stores.find((s) => s.id === plan.keeperId);
    if (!keeper) continue;
    for (const absorbId of plan.absorbIds) {
      const absorb = stores.find((s) => s.id === absorbId);
      if (!absorb) continue;
      if (isDatabaseConfigured()) {
        await absorbStoreDb(keeper.id, absorb.id);
      }
      await appendPrevadzkaHistory(
        keeper.id,
        "automatika",
        `Pribratá duplicitná prevádzka ${storeLabel(absorb)} (predpona Nova/Nová). História ostala.`,
      );
      await appendPrevadzkaHistory(
        absorb.id,
        "automatika",
        `Zlúčená do ${storeLabel(keeper)} — historia presunutá, záznam ostáva ako archív.`,
      );
      merged += 1;
    }
  }
  return { merged };
}
