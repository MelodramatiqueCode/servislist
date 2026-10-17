import type { PrevadzkaRecord } from "./prevadzka-profile";
import { storeLabel } from "./prevadzka-store";
import type { ServiceDevice, Ticket } from "./types";
import { ticketCode } from "./format";

export type SearchHit = {
  kind: "ticket" | "store" | "device" | "command";
  id: string;
  href: string;
  title: string;
  hint: string;
};

export const SEARCH_COMMANDS: SearchHit[] = [
  {
    kind: "command",
    id: "cmd-ticket",
    href: "/novy",
    title: "Nový ticket",
    hint: "nový ticket · nový problém",
  },
  {
    kind: "command",
    id: "cmd-store",
    href: "/prevadzky/nova",
    title: "Nová prevádzka",
    hint: "nová prevádzka · nová predajňa",
  },
  {
    kind: "command",
    id: "cmd-vyjazd",
    href: "/vyjazdy/novy",
    title: "Naplánovať výjazd",
    hint: "výjazd · výjazd zajtra",
  },
  {
    kind: "command",
    id: "cmd-sklad",
    href: "/sklad",
    title: "Sklad",
    hint: "sklad · položky · nízky stav",
  },
  {
    kind: "command",
    id: "cmd-prijem",
    href: "/sklad/prijem",
    title: "Nový príjem",
    hint: "príjem · dodací list · nový príjem",
  },
  {
    kind: "command",
    id: "cmd-polozka",
    href: "/sklad/nova",
    title: "Nová položka",
    hint: "nová položka · katalóg",
  },
];

function score(hay: string, q: string) {
  const text = hay.toLowerCase();
  if (!q) return 1;
  if (text === q) return 100;
  if (text.startsWith(q)) return 80;
  if (text.includes(q)) return 50;
  return 0;
}

export function searchTickets(tickets: Ticket[], q: string, limit = 6): SearchHit[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  return tickets
    .map((t) => {
      const hay = [
        ticketCode(t.number),
        `t-${t.number}`,
        t.title,
        t.customerName,
        t.deviceSerial,
        t.deviceUuid,
        t.description,
      ].join(" ");
      return { ticket: t, n: score(hay.toLowerCase(), query) };
    })
    .filter((row) => row.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map(({ ticket }) => ({
      kind: "ticket" as const,
      id: ticket.id,
      href: `/ticket/${ticket.id}`,
      title: `${ticketCode(ticket.number)} ${ticket.customerName || ticket.title}`,
      hint: ticket.title,
    }));
}

export function searchStores(
  stores: PrevadzkaRecord[],
  q: string,
  limit = 6,
): SearchHit[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  return stores
    .filter((s) => s.status !== "rejected")
    .map((s) => {
      const hay = [storeLabel(s), s.name, s.city, s.address, s.code, s.chain].join(
        " ",
      );
      return { store: s, n: score(hay.toLowerCase(), query) };
    })
    .filter((row) => row.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map(({ store }) => ({
      kind: "store" as const,
      id: store.id,
      href: `/prevadzky/${store.id}`,
      title: storeLabel(store),
      hint: [store.address, store.city].filter(Boolean).join(", "),
    }));
}

export function searchDevices(
  devices: ServiceDevice[],
  q: string,
  limit = 6,
): SearchHit[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  return devices
    .map((d) => {
      const hay = [d.name, d.code, d.city, d.partner, d.uuid, d.address].join(" ");
      return { device: d, n: score(hay.toLowerCase(), query) };
    })
    .filter((row) => row.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map(({ device }) => ({
      kind: "device" as const,
      id: device.uuid,
      href: `/zariadenia/${device.uuid}`,
      title: device.code ? `#${device.code} ${device.name}` : device.name,
      hint: [device.city, device.partner].filter(Boolean).join(" · "),
    }));
}

export function searchCommands(q: string): SearchHit[] {
  const query = q.trim().toLowerCase();
  if (!query) return SEARCH_COMMANDS;
  return SEARCH_COMMANDS.filter((cmd) =>
    `${cmd.title} ${cmd.hint}`.toLowerCase().includes(query),
  );
}

export function searchCatalog(input: {
  q: string;
  tickets: Ticket[];
  stores: PrevadzkaRecord[];
  devices: ServiceDevice[];
}) {
  const q = input.q.trim();
  return {
    commands: searchCommands(q),
    tickets: searchTickets(input.tickets, q),
    stores: searchStores(input.stores, q),
    devices: searchDevices(input.devices, q),
  };
}
