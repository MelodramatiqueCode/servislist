import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isDeletedTicketId, shouldDeleteTestTicket } from "../src/lib/ticket-delete";

const id = "32f4b8f0-c0ed-4ffa-834c-4e53e2aa113e";

describe("delete test ticket T-3392", () => {
  test("matches only exact id + number + [TEST] title", () => {
    assert.equal(shouldDeleteTestTicket({ id, number: 3392, title: "[TEST] Nejde rádio – CBA Verex Kuzmányho" }), true);
    assert.equal(shouldDeleteTestTicket({ id, number: 3391, title: "[TEST] x" }), false);
    assert.equal(shouldDeleteTestTicket({ id, number: 3392, title: "Nejde rádio" }), false);
    assert.equal(shouldDeleteTestTicket({ id: "other", number: 3392, title: "[TEST] x" }), false);
  });
  test("tombstones only that id", () => {
    assert.equal(isDeletedTicketId(id), true);
    assert.equal(isDeletedTicketId("02610142-d076-4f22-9e5c-91eb02031399"), false);
  });
});
