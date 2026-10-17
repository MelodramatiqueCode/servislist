import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  KEEP_VYJAZD_CODE,
  KEEP_VYJAZD_ID_PREFIX,
  KEEP_VYJAZD_NUMBER,
  PURGE_OPEN_VYJAZDY_CODES,
  PURGE_OPEN_VYJAZDY_IDS,
  purgeOpenVyjazdyAuditPopis,
  shouldPurgeOpenVyjazd,
} from "../src/lib/vyjazd-purge";

describe("vyjazd purge", () => {
  test("berie presne 10 naplánovaných id a nesahe na V-0015", () => {
    assert.equal(PURGE_OPEN_VYJAZDY_IDS.length, 10);
    assert.equal(PURGE_OPEN_VYJAZDY_CODES.length, 10);
    assert.equal(KEEP_VYJAZD_NUMBER, 15);
    assert.equal(KEEP_VYJAZD_CODE, "V-0015");

    for (const id of PURGE_OPEN_VYJAZDY_IDS) {
      assert.equal(
        shouldPurgeOpenVyjazd({ id, number: 7, status: "naplanovany" }),
        true,
      );
      assert.equal(
        shouldPurgeOpenVyjazd({ id, number: 7, status: "hotovy" }),
        false,
      );
    }

    assert.equal(
      shouldPurgeOpenVyjazd({
        id: `${KEEP_VYJAZD_ID_PREFIX}deadbeef`,
        number: KEEP_VYJAZD_NUMBER,
        status: "hotovy",
      }),
      false,
    );
    assert.equal(
      shouldPurgeOpenVyjazd({
        id: PURGE_OPEN_VYJAZDY_IDS[0],
        number: KEEP_VYJAZD_NUMBER,
        status: "naplanovany",
      }),
      false,
    );
    assert.equal(
      shouldPurgeOpenVyjazd({
        id: "not-on-the-list",
        number: 99,
        status: "naplanovany",
      }),
      false,
    );
  });

  test("audit popis menuje kódy a autora Martina cez bota", () => {
    const popis = purgeOpenVyjazdyAuditPopis([...PURGE_OPEN_VYJAZDY_CODES]);
    assert.match(popis, /Martin/);
    assert.match(popis, /Servislist bot/);
    assert.match(popis, /V-0007/);
    assert.match(popis, /V-0017/);
    assert.match(popis, /V-0015 ostáva/);
  });
});
