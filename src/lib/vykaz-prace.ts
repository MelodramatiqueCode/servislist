import type { Ticket, Vyjazd } from "./types";

export const VYKAZ_TYPES = [
  "montaz",
  "spustenie",
  "servis",
  "oprava",
  "vymena_hw",
  "demontaz",
  "ine",
] as const;

export type VykazType = (typeof VYKAZ_TYPES)[number];

export const VYKAZ_TYPE_LABELS: Record<VykazType, string> = {
  montaz: "Montáž",
  spustenie: "Spustenie",
  servis: "Servis",
  oprava: "Oprava",
  vymena_hw: "Výmena HW",
  demontaz: "Demontáž",
  ine: "Iné",
};

export type VykazEntry = {
  id: string;
  prevadzkaId: string;
  date: string;
  type: VykazType;
  author: string;
  description: string;
  durationMin: number | null;
  ticketId: string;
  vyjazdId: string;
  source: "auto" | "manual";
  createdAt: string;
};

export function parseVykazType(raw: string | undefined | null): VykazType | null {
  const value = (raw ?? "").trim().toLowerCase();
  if ((VYKAZ_TYPES as readonly string[]).includes(value)) return value as VykazType;
  return null;
}

export function inferVykazType(text: string): VykazType {
  const t = text.toLowerCase();
  if (/demont/.test(t)) return "demontaz";
  if (/spusten/.test(t)) return "spustenie";
  if (/mont[aá]ž|inštal|instal/.test(t)) return "montaz";
  if (/v[yý]men|zdroj|sd kart|repro|zosil/.test(t)) return "vymena_hw";
  if (/oprav/.test(t)) return "oprava";
  if (/servis/.test(t)) return "servis";
  return "servis";
}

function lastUsefulNote(ticket: Ticket) {
  const notes = [...(ticket.notes ?? [])].reverse();
  const hit = notes.find((n) => n.text.trim() && !n.text.startsWith("Stav zmenený"));
  return hit?.text.trim() || ticket.description.trim();
}

export function autoVykazFromTicket(
  ticket: Ticket,
  prevadzkaId: string,
): VykazEntry {
  const date = ticket.updatedAt || ticket.createdAt;
  const hay = `${ticket.title} ${ticket.description}`;
  return {
    id: `auto-ticket-${ticket.id}`,
    prevadzkaId,
    date,
    type: inferVykazType(hay),
    author: ticket.assignedTo || "Servis",
    description: lastUsefulNote(ticket) || ticket.title,
    durationMin: null,
    ticketId: ticket.id,
    vyjazdId: "",
    source: "auto",
    createdAt: date,
  };
}

export function autoVykazFromVyjazd(
  vyjazd: Vyjazd,
  prevadzkaId: string,
): VykazEntry {
  const date = vyjazd.scheduledAt || vyjazd.updatedAt || vyjazd.createdAt;
  const hay = `${vyjazd.title} ${vyjazd.description} ${vyjazd.result}`;
  return {
    id: `auto-vyjazd-${vyjazd.id}`,
    prevadzkaId,
    date,
    type: inferVykazType(hay),
    author: vyjazd.technician || "Servis",
    description: (vyjazd.result || vyjazd.description || vyjazd.title).trim(),
    durationMin: null,
    ticketId: vyjazd.ticketId || "",
    vyjazdId: vyjazd.id,
    source: "auto",
    createdAt: vyjazd.createdAt,
  };
}

export function mergeVykazEntries(
  manual: VykazEntry[],
  auto: VykazEntry[],
): VykazEntry[] {
  const seenTickets = new Set(
    manual.map((e) => e.ticketId).filter(Boolean),
  );
  const seenVyjazdy = new Set(
    manual.map((e) => e.vyjazdId).filter(Boolean),
  );
  const extra = auto.filter((e) => {
    if (e.ticketId && seenTickets.has(e.ticketId)) return false;
    if (e.vyjazdId && seenVyjazdy.has(e.vyjazdId)) return false;
    return true;
  });
  return [...manual, ...extra].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export function filterVykaz(entries: VykazEntry[], type?: string) {
  const parsed = parseVykazType(type);
  if (!parsed) return entries;
  return entries.filter((e) => e.type === parsed);
}
