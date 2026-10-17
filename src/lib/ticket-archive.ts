import { randomUUID } from "crypto";
import type { Ticket, TicketNote } from "./types";

export type ArchivedFilter = "hide" | "only" | "all";

export const ARCHIVE_NOTE_TEXT =
  "Archivované pred nasadením nových pravidiel auto-ticketov (Balena). Ticket ostáva, nie je zmazaný.";

/** Jednorazová in-app migrácia — všetky auto tickety pred týmto ISO (`<`, nie `<=`). */
export const LEGACY_AUTO_ARCHIVE_CUTOFF = "2026-10-16T23:59:59.000Z";

/** `app_meta` kľúč. Prítomnosť = migrácia už prebehla; value = počet archivovaných. */
export const LEGACY_AUTO_ARCHIVE_META_KEY = "archive_auto_before_2026-10-16";

export const REDEPLOY_OFFLINE_ARCHIVE_NOTE_TEXT =
  "Archivované: duplicitný Offline ticket vytvorený pri redeployi 17. 10. 2026 (zariadenie bolo offline už predtým, pôvodný ticket je v archíve). Ticket ostáva, nie je zmazaný.";

/** `app_meta` kľúč jednorazovej archivácie 14 Offline ticketov z 2026-10-17T05:15:24Z. */
export const REDEPLOY_OFFLINE_ARCHIVE_META_KEY = "archive_auto_offline_2026-10-17";

/** Presne týchto 14 auto ticketov (source = auto) — nič iné sa nearchivuje. */
export const REDEPLOY_OFFLINE_ARCHIVE_IDS: readonly string[] = [
  "02610142-d076-4f22-9e5c-91eb02031399",
  "e1e10910-3432-441a-9231-85d209f2a2ae",
  "2364d920-f08a-487e-9195-e7ae36d6597d",
  "9181b19d-2362-4f66-af8c-57be0dae2559",
  "70267eca-f97f-4587-9990-2df7edb810f2",
  "888f5517-38ba-4077-8115-1374b14a26c9",
  "2a06a385-f709-45cc-82f5-43313ffc72ee",
  "04028114-023e-4ab6-a4a3-8e70fd4564b4",
  "3d835dbd-b59b-4bd3-a5c7-63354b891a41",
  "5443a6e7-fe0d-4200-b852-acdc407f64d5",
  "47d5bb3d-3c0d-49be-a867-07d79a127775",
  "cedc6278-8b18-4340-8126-95c052cf1cf3",
  "ab08db29-0610-4131-800a-b2ac3939c90a",
  "05b398f0-1e99-4f66-bd15-ce910a22bb86",
];

export function mergeLegacyArchiveCounts(existing: string, incoming: string) {
  const a = Number.parseInt(existing, 10);
  const b = Number.parseInt(incoming, 10);
  const aOk = Number.isFinite(a) && String(a) === existing.trim();
  const bOk = Number.isFinite(b) && String(b) === incoming.trim();
  if (aOk && bOk) return String(Math.max(a, b));
  if (bOk) return incoming.trim();
  if (aOk) return existing.trim();
  return incoming.trim() || existing.trim();
}

export function isTicketArchived(ticket: { archivedAt?: string | null }) {
  return Boolean(ticket.archivedAt);
}

export function parseArchivedQuery(raw: string | undefined | null): ArchivedFilter {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value || value === "0" || value === "false" || value === "hide" || value === "bez") {
    return "hide";
  }
  if (value === "only" || value === "archiv" || value === "archív") {
    return "only";
  }
  if (value === "1" || value === "true" || value === "all" || value === "vsetky") {
    return "all";
  }
  return "hide";
}

export function matchesArchivedFilter(ticket: Ticket, filter: ArchivedFilter) {
  const archived = isTicketArchived(ticket);
  if (filter === "all") return true;
  if (filter === "only") return archived;
  return !archived;
}

export function isLegacyAutoTicket(ticket: Ticket, before: Date) {
  if ((ticket.source ?? "manual") !== "auto") return false;
  const created = new Date(ticket.createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return created < before.getTime();
}

export function selectLegacyAutoTickets(tickets: Ticket[], before: Date) {
  return tickets.filter(
    (ticket) => isLegacyAutoTicket(ticket, before) && !isTicketArchived(ticket),
  );
}

export function archiveTicket(
  ticket: Ticket,
  archivedAt: string,
  author = "Automat",
): Ticket {
  if (isTicketArchived(ticket)) return ticket;
  const hasNote = ticket.notes.some((note) => note.text === ARCHIVE_NOTE_TEXT);
  const notes: TicketNote[] = hasNote
    ? ticket.notes
    : [
        ...ticket.notes,
        {
          id: randomUUID(),
          text: ARCHIVE_NOTE_TEXT,
          author,
          createdAt: archivedAt,
        },
      ];
  return {
    ...ticket,
    archivedAt,
    notes,
    updatedAt: archivedAt,
  };
}

export function archiveLegacyAutoTickets(
  tickets: Ticket[],
  before: Date,
  archivedAt = new Date().toISOString(),
) {
  let archived = 0;
  const next = tickets.map((ticket) => {
    if (!isLegacyAutoTicket(ticket, before) || isTicketArchived(ticket)) {
      return ticket;
    }
    archived += 1;
    return archiveTicket(ticket, archivedAt);
  });
  return { tickets: next, archived, skipped: tickets.length - archived };
}
