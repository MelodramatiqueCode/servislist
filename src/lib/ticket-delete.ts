/**
 * Jednorazové úplné zmazanie skúšobného ticketu T-3392 — výslovný pokyn
 * Martina 19. 10. 2026 („Vymaž úplne, odstráň“). Výnimka z pravidla
 * „archivovať, nemazať“ len pre tento jeden ticket.
 */
export const DELETE_TEST_TICKET_META_KEY = "delete_test_ticket_3392_2026-10-19";

export const DELETE_TEST_TICKET = {
  id: "32f4b8f0-c0ed-4ffa-834c-4e53e2aa113e",
  number: 3392,
  titlePrefix: "[TEST]",
} as const;

/**
 * Jednorazové úplné zmazanie skúšobných ticketov T-3400 a T-3402 —
 * pokyn Martina 23. 10. 2026. Len tieto dve čísla a ich závislé záznamy.
 */
export const DELETE_TEST_TICKETS_OCT23_META_KEY =
  "delete_test_tickets_3400_3402_2026-10-23_v2";

export const DELETE_TEST_TICKET_3400 = {
  id: "6a5c54c1-2977-475a-aff1-ea2fa8aedae6",
  number: 3400,
  title: "TEST zápisu hotline (zmazať)",
  storeHint: "Liptovský Mikuláš",
} as const;

export const DELETE_TEST_TICKET_3402 = {
  id: "4033c7fe-22e0-4bc6-bb26-34e2f50df624",
  number: 3402,
  title: "Nehrá hudba - JLM Liptovský Mikuláš, Tempo",
  storeHint: "Liptovský Mikuláš",
} as const;

export const DELETE_TEST_TICKETS_OCT23 = [
  DELETE_TEST_TICKET_3400,
  DELETE_TEST_TICKET_3402,
] as const;

export type DeleteTestTicketOct23Spec =
  (typeof DELETE_TEST_TICKETS_OCT23)[number];

/**
 * Jednorazové úplné zmazanie ticketu T-3404 — pokyn Martina 23. 10. 2026.
 * Guard je len UUID; text názvu / prevádzky sa na zhodu nepoužíva.
 */
export const DELETE_TEST_TICKET_3404_META_KEY =
  "delete_test_ticket_3404_2026-10-23";

export const DELETE_TEST_TICKET_3404 = {
  id: "53119c16-a236-479c-87e1-786928b45b8c",
  number: 3404,
} as const;

export function shouldDeleteTicket3404(row: { id: string }) {
  return row.id === DELETE_TEST_TICKET_3404.id;
}

/** Tieto id sa už nikdy nesmú zapísať späť (napr. z teplej cache inej inštancie). */
export const DELETED_TICKET_IDS: readonly string[] = [
  DELETE_TEST_TICKET.id,
  DELETE_TEST_TICKET_3400.id,
  DELETE_TEST_TICKET_3402.id,
  DELETE_TEST_TICKET_3404.id,
];

export function isDeletedTicketId(id: string) {
  return DELETED_TICKET_IDS.includes(id);
}

export function shouldDeleteTestTicket(row: {
  id: string;
  number: number;
  title: string;
}) {
  return (
    row.id === DELETE_TEST_TICKET.id &&
    row.number === DELETE_TEST_TICKET.number &&
    row.title.startsWith(DELETE_TEST_TICKET.titlePrefix)
  );
}

function storeHaystack(row: { title: string; customerName: string }) {
  return `${row.customerName} ${row.title}`
    .replace(/[·•]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Presné id + číslo + text a mesto Liptovský Mikuláš v customer_name alebo
 * názve. T-3400 má customer_name „PJ188 Liptovský Mikuláš Tempo“, nie
 * „JLM Liptovský Mikuláš“. Inak nemazať.
 */
export function shouldDeleteOct23TestTicket(
  spec: DeleteTestTicketOct23Spec,
  row: { id: string; number: number; title: string; customerName: string },
) {
  if (
    row.id !== spec.id ||
    row.number !== spec.number ||
    row.title !== spec.title
  ) {
    return false;
  }
  return storeHaystack(row).includes(spec.storeHint);
}
