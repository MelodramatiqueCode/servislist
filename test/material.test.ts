import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatMaterialSummary,
  materialTemplate,
  materialTotal,
  type MaterialItem,
} from "../src/lib/material";

function item(partial: Partial<MaterialItem>): MaterialItem {
  return {
    id: "m1",
    ticketId: "t1",
    prevadzkaId: "s1",
    item: "SD karta",
    quantity: 1,
    unit: "ks",
    unitPrice: null,
    note: "",
    status: "planovane",
    createdAt: "2026-10-17T00:00:00.000Z",
    ...partial,
  };
}

describe("material", () => {
  test("templates differ by job type", () => {
    const montaz = materialTemplate("montaz_ozvucenia");
    const start = materialTemplate("spustenie_zariadenia");
    assert.ok(montaz.some((r) => /repro/i.test(r.item)));
    assert.ok(montaz.length > start.length);
    assert.ok(start.every((r) => r.item));
    assert.ok(montaz.some((r) => r.item === "RPi 4"));
    assert.ok(montaz.some((r) => r.item === "Zdroj USB-C (RPi 4)"));
    assert.ok(start.some((r) => r.item === "RPi 4"));
    assert.ok(start.some((r) => r.item === "Zdroj USB-C (RPi 4)"));
    assert.ok(!montaz.some((r) => /raspberry pi$/i.test(r.item)));
    assert.ok(!start.some((r) => r.item === "Napájací zdroj"));
  });

  test("total only when prices exist; summary prefers used items", () => {
    const items = [
      item({ id: "a", item: "Pi", quantity: 1, unitPrice: 80, status: "pouzite" }),
      item({ id: "b", item: "SD", quantity: 2, unitPrice: 10, status: "planovane" }),
      item({ id: "c", item: "Kábel", quantity: 5 }),
    ];
    assert.equal(materialTotal(items), 100);
    assert.equal(formatMaterialSummary(items), "1 ks Pi");
    assert.equal(
      formatMaterialSummary(items.filter((i) => i.status === "planovane")),
      "2 ks SD, 5 ks Kábel",
    );
    assert.equal(materialTotal([item({ unitPrice: null })]), null);
  });
});
