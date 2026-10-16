import { estimateFromSeptemberSummary, estimateFromTickets } from "../src/lib/alert-estimate";
import { isDatabaseConfigured } from "../src/lib/db";

async function main() {
  const summary = estimateFromSeptemberSummary();
  console.log("September súhrn (10.–28. 9. 2026):");
  console.log(JSON.stringify(summary, null, 2));

  if (!isDatabaseConfigured()) {
    console.log("\nDATABASE_URL nie je nastavené — replay na živých ticketoch preskočený.");
    return;
  }

  const { dbReadTicketStore } = await import("../src/lib/db");
  const store = await dbReadTicketStore();
  const replay = estimateFromTickets(store.tickets, undefined, {
    from: "2026-09-10T00:00:00.000Z",
    to: "2026-09-28T23:59:59.999Z",
  });
  console.log("\nReplay z databázy:");
  console.log(JSON.stringify(replay, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
