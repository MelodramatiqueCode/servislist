import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  inDateRange,
  localDateKey,
  localMonthRange,
  parseTicketRef,
  parseVyjazdRef,
} from "../src/lib/refs";

describe("refs", () => {
  test("parsuje číslo a kód ticketu", () => {
    assert.deepEqual(parseTicketRef("12"), { number: 12 });
    assert.deepEqual(parseTicketRef("#0012"), { number: 12 });
    assert.deepEqual(parseTicketRef(" 0012 "), { number: 12 });
    assert.deepEqual(parseTicketRef("abc-uuid"), { id: "abc-uuid" });
  });

  test("parsuje číslo a kód výjazdu", () => {
    assert.deepEqual(parseVyjazdRef("3"), { number: 3 });
    assert.deepEqual(parseVyjazdRef("V-0003"), { number: 3 });
    assert.deepEqual(parseVyjazdRef("v_12"), { number: 12 });
    assert.deepEqual(parseVyjazdRef("vyjazd-uuid"), { id: "vyjazd-uuid" });
  });

  test("filtruje dátumový rozsah vrátane dňa YYYY-MM-DD", () => {
    assert.equal(
      inDateRange("2026-10-16T12:00:00.000Z", "2026-10-16", "2026-10-16"),
      true,
    );
    assert.equal(
      inDateRange("2026-10-15T23:00:00.000Z", "2026-10-16", "2026-10-16"),
      false,
    );
    assert.equal(inDateRange("2026-10-16T12:00:00.000Z", "2026-10-17"), false);
  });

  test("localDateKey a localMonthRange používajú lokálny kalendár", () => {
    assert.equal(localDateKey(new Date(2026, 9, 17)), "2026-10-17");
    assert.deepEqual(localMonthRange(new Date(2026, 9, 17)), {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    assert.deepEqual(localMonthRange(new Date(2024, 1, 15)), {
      from: "2024-02-01",
      to: "2024-02-29",
    });
  });
});
