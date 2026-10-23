import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DELETE_TEST_TICKET_3400,
  DELETE_TEST_TICKET_3402,
  isDeletedTicketId,
  shouldDeleteOct23TestTicket,
  shouldDeleteTestTicket,
} from "../src/lib/ticket-delete";

const id3392 = "32f4b8f0-c0ed-4ffa-834c-4e53e2aa113e";

describe("delete test ticket T-3392", () => {
  test("matches only exact id + number + [TEST] title", () => {
    assert.equal(shouldDeleteTestTicket({ id: id3392, number: 3392, title: "[TEST] Nejde rádio – CBA Verex Kuzmányho" }), true);
    assert.equal(shouldDeleteTestTicket({ id: id3392, number: 3391, title: "[TEST] x" }), false);
    assert.equal(shouldDeleteTestTicket({ id: id3392, number: 3392, title: "Nejde rádio" }), false);
    assert.equal(shouldDeleteTestTicket({ id: "other", number: 3392, title: "[TEST] x" }), false);
  });
  test("tombstones only deleted test ids", () => {
    assert.equal(isDeletedTicketId(id3392), true);
    assert.equal(isDeletedTicketId(DELETE_TEST_TICKET_3400.id), true);
    assert.equal(isDeletedTicketId(DELETE_TEST_TICKET_3402.id), true);
    assert.equal(isDeletedTicketId("02610142-d076-4f22-9e5c-91eb02031399"), false);
  });
});

describe("delete test tickets T-3400 and T-3402", () => {
  test("matches T-3400 only on exact id + number + title + JLM Liptovský Mikuláš", () => {
    assert.equal(
      shouldDeleteOct23TestTicket(DELETE_TEST_TICKET_3400, {
        id: DELETE_TEST_TICKET_3400.id,
        number: 3400,
        title: "TEST zápisu hotline (zmazať)",
        customerName: "#289 · JLM · Liptovský Mikuláš",
      }),
      true,
    );
    assert.equal(
      shouldDeleteOct23TestTicket(DELETE_TEST_TICKET_3400, {
        id: DELETE_TEST_TICKET_3400.id,
        number: 3400,
        title: "TEST zápisu hotline (zmazať)",
        customerName: "JLM Liptovský Mikuláš, Tempo",
      }),
      true,
    );
    assert.equal(
      shouldDeleteOct23TestTicket(DELETE_TEST_TICKET_3400, {
        id: DELETE_TEST_TICKET_3400.id,
        number: 3401,
        title: "TEST zápisu hotline (zmazať)",
        customerName: "JLM Liptovský Mikuláš",
      }),
      false,
    );
    assert.equal(
      shouldDeleteOct23TestTicket(DELETE_TEST_TICKET_3400, {
        id: DELETE_TEST_TICKET_3400.id,
        number: 3400,
        title: "iný text",
        customerName: "JLM Liptovský Mikuláš",
      }),
      false,
    );
    assert.equal(
      shouldDeleteOct23TestTicket(DELETE_TEST_TICKET_3400, {
        id: "other",
        number: 3400,
        title: "TEST zápisu hotline (zmazať)",
        customerName: "JLM Liptovský Mikuláš",
      }),
      false,
    );
    assert.equal(
      shouldDeleteOct23TestTicket(DELETE_TEST_TICKET_3400, {
        id: DELETE_TEST_TICKET_3400.id,
        number: 3400,
        title: "TEST zápisu hotline (zmazať)",
        customerName: "CBA Bratislava",
      }),
      false,
    );
  });

  test("matches T-3402 only on exact id + number + title + JLM Liptovský Mikuláš", () => {
    assert.equal(
      shouldDeleteOct23TestTicket(DELETE_TEST_TICKET_3402, {
        id: DELETE_TEST_TICKET_3402.id,
        number: 3402,
        title: "Nehrá hudba - JLM Liptovský Mikuláš, Tempo",
        customerName: "JLM Liptovský Mikuláš, Tempo",
      }),
      true,
    );
    assert.equal(
      shouldDeleteOct23TestTicket(DELETE_TEST_TICKET_3402, {
        id: DELETE_TEST_TICKET_3402.id,
        number: 3402,
        title: "Nehrá hudba - JLM Liptovský Mikuláš, Tempo",
        customerName: "",
      }),
      true,
    );
    assert.equal(
      shouldDeleteOct23TestTicket(DELETE_TEST_TICKET_3402, {
        id: DELETE_TEST_TICKET_3402.id,
        number: 3402,
        title: "Nehrá hudba",
        customerName: "JLM Liptovský Mikuláš, Tempo",
      }),
      false,
    );
    assert.equal(
      shouldDeleteOct23TestTicket(DELETE_TEST_TICKET_3402, {
        id: DELETE_TEST_TICKET_3400.id,
        number: 3402,
        title: "Nehrá hudba - JLM Liptovský Mikuláš, Tempo",
        customerName: "JLM Liptovský Mikuláš, Tempo",
      }),
      false,
    );
  });

  test("does not match the other ticket's spec", () => {
    assert.equal(
      shouldDeleteOct23TestTicket(DELETE_TEST_TICKET_3400, {
        id: DELETE_TEST_TICKET_3402.id,
        number: 3402,
        title: "Nehrá hudba - JLM Liptovský Mikuláš, Tempo",
        customerName: "JLM Liptovský Mikuláš, Tempo",
      }),
      false,
    );
  });
});
