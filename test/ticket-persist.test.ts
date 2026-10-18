import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ticketsNeedingWrite } from "../src/lib/db";
import { afterResponse } from "../src/lib/after-response";

describe("ticket persist", () => {
  test("writes only new or updated tickets", () => {
    const existing = [
      { id: "a", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", updatedAt: new Date("2026-01-02T00:00:00.000Z") },
    ];
    const next = [
      { id: "a", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", updatedAt: "2026-01-03T00:00:00.000Z" },
      { id: "c", updatedAt: "2026-01-04T00:00:00.000Z" },
    ];
    assert.deepEqual(
      ticketsNeedingWrite(existing, next).map((t) => t.id),
      ["b", "c"],
    );
  });

  test("same timestamp in Date vs ISO is a no-op", () => {
    const iso = "2026-10-18T22:00:00.000Z";
    const dirty = ticketsNeedingWrite(
      [{ id: "t", updatedAt: new Date(iso) }],
      [{ id: "t", updatedAt: iso }],
    );
    assert.equal(dirty.length, 0);
  });

  test("4000-ticket store dirties one row in well under 50ms", () => {
    const existing = Array.from({ length: 4000 }, (_, i) => ({
      id: `t${i}`,
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    const next = existing.map((row, i) => ({
      id: row.id,
      updatedAt: i === 7 ? "2026-01-02T00:00:00.000Z" : row.updatedAt,
    }));
    const started = Date.now();
    const dirty = ticketsNeedingWrite(existing, next);
    const ms = Date.now() - started;
    assert.deepEqual(
      dirty.map((t) => t.id),
      ["t7"],
    );
    assert.ok(ms < 50, `dirty filter took ${ms}ms`);
  });

  test("afterResponse still completes work outside Vercel", async () => {
    let done = false;
    await afterResponse(async () => {
      done = true;
    });
    assert.equal(done, true);
  });
});
