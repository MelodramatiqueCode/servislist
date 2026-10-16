import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { defaultAlertConfig } from "../src/lib/alert-config";
import {
  estimateFromSeptemberSummary,
  estimateFromTickets,
} from "../src/lib/alert-estimate";

describe("alert estimate", () => {
  test("zo septembrového súhrnu klesne rádovo o 90 %", () => {
    const summary = estimateFromSeptemberSummary();
    assert.equal(summary.inputAuto, 1477);
    assert.ok(summary.estimatedTickets < 250);
    assert.ok(summary.suppressed > 1200);
  });

  test("replay ticketov: mass + short + hot flap", () => {
    const config = defaultAlertConfig();
    const wave = Array.from({ length: 20 }, (_, i) => ({
      source: "auto",
      alertType: "offline",
      deviceUuid: `w${i}`,
      createdAt: "2026-09-12T08:01:00.000Z",
      updatedAt: "2026-09-12T08:06:00.000Z",
      status: "hotove",
    }));
    const shorts = Array.from({ length: 6 }, (_, i) => ({
      source: "auto",
      alertType: "offline",
      deviceUuid: "night-1",
      createdAt: `2026-09-1${i + 1}T08:00:00.000Z`,
      updatedAt: `2026-09-1${i + 1}T08:04:00.000Z`,
      status: "hotove",
    }));
    const hots = Array.from({ length: 10 }, (_, i) => ({
      source: "auto",
      alertType: "hot",
      deviceUuid: "u200",
      createdAt: `2026-09-15T10:${String(i).padStart(2, "0")}:00.000Z`,
      updatedAt: `2026-09-15T10:${String(i).padStart(2, "0")}:30.000Z`,
      status: "hotove",
    }));
    const under = {
      source: "auto",
      alertType: "undervolt",
      deviceUuid: "u9",
      createdAt: "2026-09-16T10:00:00.000Z",
      updatedAt: "2026-09-20T10:00:00.000Z",
      status: "otvorene",
    };

    const estimate = estimateFromTickets(
      [...wave, ...shorts, ...hots, under],
      config,
    );
    assert.equal(estimate.keptUndervolt, 1);
    assert.equal(estimate.offlineMassTickets, 1);
    assert.ok(estimate.offlineShort >= 5);
    assert.equal(estimate.hotCollapsed, 1);
    assert.equal(estimate.flapTickets, 1);
    assert.ok(estimate.estimatedTickets < 10);
  });
});
