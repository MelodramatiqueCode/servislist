import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ALERT_OFFLINE_THRESHOLD_HOURS,
  ALERT_WEEKEND_HOLD_MONDAY_HOUR,
  defaultAlertConfig,
} from "../src/lib/alert-config";
import {
  isInWeekendOfflineWindow,
  isWeekendHoldActive,
  meetsOfflineThreshold,
  weekendHoldUntil,
  wouldOpenOfflineTicketExist,
} from "../src/lib/alert-offline";

const TZ = "Europe/Bratislava";
const MONDAY_HOUR = ALERT_WEEKEND_HOLD_MONDAY_HOUR;

describe("offline threshold + weekend hold", () => {
  test("config constants are 12 h and Monday 07:00", () => {
    assert.equal(ALERT_OFFLINE_THRESHOLD_HOURS, 12);
    assert.equal(ALERT_WEEKEND_HOLD_MONDAY_HOUR, 7);
    const config = defaultAlertConfig();
    assert.equal(config.offlineThresholdHours, 12);
    assert.equal(config.weekendHoldMondayHour, 7);
  });

  test("Saturday 00:00 – Monday 07:00 Bratislava is the weekend window", () => {
    assert.equal(
      isInWeekendOfflineWindow(new Date("2026-09-11T21:59:00.000Z"), TZ, MONDAY_HOUR),
      false,
    ); // Fri 23:59 CEST
    assert.equal(
      isInWeekendOfflineWindow(new Date("2026-09-11T22:00:00.000Z"), TZ, MONDAY_HOUR),
      true,
    ); // Sat 00:00 CEST
    assert.equal(
      isInWeekendOfflineWindow(new Date("2026-09-13T18:00:00.000Z"), TZ, MONDAY_HOUR),
      true,
    ); // Sun 20:00 CEST
    assert.equal(
      isInWeekendOfflineWindow(new Date("2026-09-14T04:59:00.000Z"), TZ, MONDAY_HOUR),
      true,
    ); // Mon 06:59 CEST
    assert.equal(
      isInWeekendOfflineWindow(new Date("2026-09-14T05:00:00.000Z"), TZ, MONDAY_HOUR),
      false,
    ); // Mon 07:00 CEST
  });

  test("hold lasts until Monday 07:00 for a Saturday last-seen", () => {
    const lastSeen = new Date("2026-09-12T08:00:00.000Z"); // Sat 10:00 CEST
    const until = weekendHoldUntil(lastSeen, TZ, MONDAY_HOUR);
    assert.ok(until);
    const monday7 = new Date("2026-09-14T05:00:00.000Z").getTime();
    assert.ok(Math.abs(until!.getTime() - monday7) < 60_000);
    assert.equal(
      isWeekendHoldActive(lastSeen, new Date("2026-09-14T04:59:00.000Z"), TZ, MONDAY_HOUR),
      true,
    );
    assert.equal(
      isWeekendHoldActive(lastSeen, new Date("2026-09-14T05:00:00.000Z"), TZ, MONDAY_HOUR),
      false,
    );
  });

  test("Friday night last-seen is not a weekend hold", () => {
    const fridayNight = new Date("2026-09-11T20:00:00.000Z"); // Fri 22:00 CEST
    assert.equal(weekendHoldUntil(fridayNight, TZ, MONDAY_HOUR), null);
    assert.equal(
      isWeekendHoldActive(fridayNight, new Date("2026-09-12T08:00:00.000Z"), TZ, MONDAY_HOUR),
      false,
    );
    assert.equal(
      meetsOfflineThreshold(fridayNight, new Date("2026-09-12T08:00:00.000Z"), 12),
      true,
    );
  });

  test("open ticket created after 15 min would not exist under 12 h", () => {
    const lastSeen = "2026-09-14T08:00:00.000Z";
    const created = "2026-09-14T08:16:00.000Z";
    assert.equal(
      wouldOpenOfflineTicketExist(
        {
          createdAt: created,
          description: `Posledná konektivita: ${lastSeen}`,
        },
        { isOnline: false, lastConnectivityEvent: lastSeen },
        defaultAlertConfig(),
      ),
      false,
    );
    assert.equal(
      wouldOpenOfflineTicketExist(
        {
          createdAt: "2026-09-14T20:05:00.000Z",
          description: `Posledná konektivita: ${lastSeen}`,
        },
        { isOnline: false, lastConnectivityEvent: lastSeen },
        defaultAlertConfig(),
      ),
      true,
    );
  });

  test("Saturday-created ticket would not exist under weekend hold", () => {
    const lastSeen = "2026-09-12T08:00:00.000Z";
    assert.equal(
      wouldOpenOfflineTicketExist(
        {
          createdAt: "2026-09-12T10:00:00.000Z",
          description: `Posledná konektivita: ${lastSeen}`,
        },
        { isOnline: false, lastConnectivityEvent: lastSeen },
        defaultAlertConfig(),
      ),
      false,
    );
  });
});
