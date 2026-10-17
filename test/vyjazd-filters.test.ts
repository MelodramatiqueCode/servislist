import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { vyjazdIsOverdue } from "../src/lib/store";

describe("vyjazd filters", () => {
  test("vyjazdIsOverdue platí len pre aktívne výjazdy po termíne", () => {
    assert.equal(vyjazdIsOverdue("naplanovany", "2000-01-01T00:00:00.000Z"), true);
    assert.equal(vyjazdIsOverdue("prebieha", "2000-01-01T00:00:00.000Z"), true);
    assert.equal(vyjazdIsOverdue("hotovy", "2000-01-01T00:00:00.000Z"), false);
    assert.equal(vyjazdIsOverdue("zruseny", "2000-01-01T00:00:00.000Z"), false);
    assert.equal(vyjazdIsOverdue("naplanovany", "2099-01-01T00:00:00.000Z"), false);
    assert.equal(vyjazdIsOverdue("naplanovany", ""), false);
  });
});
