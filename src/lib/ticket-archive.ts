import { randomUUID } from "crypto";
import type { Ticket, TicketNote } from "./types";

export type ArchivedFilter = "hide" | "only" | "all";

export const ARCHIVE_NOTE_TEXT =
  "Archivované pred nasadením nových pravidiel auto-ticketov (Balena). Ticket ostáva, nie je zmazaný.";

/** Jednorazová in-app migrácia — všetky auto tickety pred týmto ISO (`<`, nie `<=`). */
export const LEGACY_AUTO_ARCHIVE_CUTOFF = "2026-10-16T23:59:59.000Z";

/** `app_meta` kľúč. Prítomnosť = migrácia už prebehla; value = počet archivovaných. */
export const LEGACY_AUTO_ARCHIVE_META_KEY = "archive_auto_before_2026-10-16";

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
