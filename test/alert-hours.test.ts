import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { defaultAlertConfig, parseHoursSpec } from "../src/lib/alert-config";
import { isWithinHoursSpec, isWithinStoreHours, zonedClock } from "../src/lib/alert-hours";

describe("alert hours", () => {
  test("07:00–21:00 v Europe/Bratislava", () => {
    const config = defaultAlertConfig();
    const device = { code: "264", partner: "COOP", city: "Nitra" };
    const mondayMorning = new Date("2026-09-14T08:00:00.000Z"); // 10:00 CEST
    const mondayNight = new Date("2026-09-14T20:30:00.000Z"); // 22:30 CEST
    assert.equal(isWithinStoreHours(mondayMorning, device, config), true);
    assert.equal(isWithinStoreHours(mondayNight, device, config), false);
  });

  test("override na prevádzku", () => {
    const config = defaultAlertConfig();
    config.hoursOverrides["#114"] = parseHoursSpec("off", config.storeHours);
    const night = new Date("2026-09-14T20:30:00.000Z");
    assert.equal(
      isWithinStoreHours(night, { code: "114" }, config),
      true,
    );
  });

  test("cez polnoc", () => {
    const spec = parseHoursSpec("21:00-07:00", {
      startMinutes: 0,
      endMinutes: 0,
      always: false,
    });
    assert.equal(isWithinHoursSpec(spec, 22 * 60, 1, [0, 1, 2, 3, 4, 5, 6]), true);
    assert.equal(isWithinHoursSpec(spec, 10 * 60, 1, [0, 1, 2, 3, 4, 5, 6]), false);
  });

  test("zonedClock používa timezónu", () => {
    const clock = zonedClock(new Date("2026-09-14T08:00:00.000Z"), "Europe/Bratislava");
    assert.equal(clock.day, 1);
    assert.equal(clock.minute, 10 * 60);
  });
});
