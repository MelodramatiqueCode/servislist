import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { defaultAlertConfig } from "../src/lib/alert-config";
import { isWithinStoreHours } from "../src/lib/alert-hours";
import { hoursForDay, setPrevadzkaHoursCache } from "../src/lib/prevadzka-hours";

describe("prevadzka hours feed alert-hours", () => {
  test("store hours override default when set", () => {
    setPrevadzkaHoursCache([
      {
        keys: ["214", "#214", "coop|nitra"],
        hours: {
          monFri: "10:00-12:00",
          saturday: "zatvorené",
          sunday: "",
          holidays: "",
        },
      },
    ]);
    const config = defaultAlertConfig();
    const insideStore = new Date("2026-09-14T08:30:00.000Z"); // 10:30 CEST
    const beforeStore = new Date("2026-09-14T07:00:00.000Z"); // 09:00 CEST
    const afterStore = new Date("2026-09-14T10:00:00.000Z"); // 12:00 CEST
    assert.equal(
      isWithinStoreHours(insideStore, { code: "214" }, config),
      true,
    );
    assert.equal(
      isWithinStoreHours(beforeStore, { code: "214" }, config),
      false,
    );
    assert.equal(
      isWithinStoreHours(afterStore, { code: "214" }, config),
      false,
    );
    const saturday = new Date("2026-09-19T10:00:00.000Z");
    assert.equal(
      isWithinStoreHours(saturday, { code: "214" }, config),
      false,
    );
    setPrevadzkaHoursCache([]);
    assert.equal(
      isWithinStoreHours(afterStore, { code: "214" }, config),
      true,
    );
  });

  test("hoursForDay treats closed labels", () => {
    const spec = hoursForDay(
      { monFri: "", saturday: "off", sunday: "closed", holidays: "" },
      6,
    );
    assert.deepEqual(spec, { closed: true });
  });
});
