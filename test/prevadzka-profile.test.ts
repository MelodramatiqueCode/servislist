import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  applyStorePatch,
  emptyOpeningHours,
  emptyProfile,
  formatOpeningHours,
  openingHoursSet,
  profileCompleteness,
  summarizeSuggestionPatch,
  type PrevadzkaRecord,
} from "../src/lib/prevadzka-profile";

function store(partial: Partial<PrevadzkaRecord> = {}): PrevadzkaRecord {
  return {
    id: "s1",
    storeKey: "coop|nitra|hlavna",
    code: "",
    chain: "",
    storeType: "",
    name: "",
    city: "",
    address: "",
    gpsLat: "",
    gpsLng: "",
    phone: "",
    openingHours: emptyOpeningHours(),
    profile: emptyProfile(),
    status: "active",
    jobType: "",
    createdAt: "2026-10-17T00:00:00.000Z",
    updatedAt: "2026-10-17T00:00:00.000Z",
    ...partial,
  };
}

describe("prevadzka profile", () => {
  test("completeness counts missing fields", () => {
    const empty = profileCompleteness(store());
    assert.equal(empty.percent, 0);
    assert.equal(empty.missing.length, empty.total);

    const filled = profileCompleteness(
      store({
        chain: "COOP",
        code: "214",
        storeType: "Supermarket",
        address: "Hlavná 1",
        gpsLat: "48.3",
        gpsLng: "18.0",
        openingHours: {
          monFri: "7:00-20:00",
          saturday: "",
          sunday: "",
          holidays: "",
        },
        profile: {
          ...emptyProfile(),
          contacts: [
            {
              id: "c1",
              role: "Vedúca",
              name: "Jana",
              phone: "0900",
              email: "",
              callBeforeVisit: true,
              note: "",
            },
          ],
          areaM2: "400",
          amplifier: "Apart",
          speakersTotal: "8",
          buttons: [
            { id: "b1", number: "1", fn: "Mute", placement: "", gpio: "17" },
          ],
          visitWhen: "ráno",
          techNote: "rebrík",
        },
      }),
    );
    assert.equal(filled.percent, 100);
    assert.equal(filled.missing.length, 0);
  });

  test("applyStorePatch merges profile and hours", () => {
    const next = applyStorePatch(store({ chain: "COOP" }), {
      code: "12",
      openingHours: {
        monFri: "8-16",
        saturday: "",
        sunday: "zatvorené",
        holidays: "",
      },
      profile: { speakersTotal: "10" },
    });
    assert.equal(next.chain, "COOP");
    assert.equal(next.code, "12");
    assert.equal(next.profile.speakersTotal, "10");
    assert.equal(next.openingHours.monFri, "8-16");
    assert.equal(openingHoursSet(next.openingHours), true);
    assert.match(formatOpeningHours(next.openingHours), /Po–Pi/);
  });

  test("summarizeSuggestionPatch", () => {
    assert.equal(
      summarizeSuggestionPatch({ chain: "Terno", profile: { amplifier: "X" } }),
      "reťazec Terno, zosilňovač X",
    );
  });
});
