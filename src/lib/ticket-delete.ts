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

/** Tieto id sa už nikdy nesmú zapísať späť (napr. z teplej cache inej inštancie). */
export const DELETED_TICKET_IDS: readonly string[] = [DELETE_TEST_TICKET.id];

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
