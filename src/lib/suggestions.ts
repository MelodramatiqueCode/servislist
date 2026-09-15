import {
  ALERT_LABELS,
  alertPriority,
  detectActiveAlerts,
  isAlertsEnabled,
} from "./alerts";
import { hasHealthAlert } from "./parse-device";
import { ticketCode } from "./format";
import { listDevices, listTickets, listVyjazdy } from "./store";
import type { ServiceDevice, TicketPriority, TicketStatus } from "./types";

export type SuggestionOptionId = "expres" | "planovany";

export type SuggestionOption = {
  id: SuggestionOptionId;
  label: string;
  hint: string;
  scope: "focused" | "combined";
  title: string;
  description: string;
  scheduledAt: string;
  scheduledLabel: string;
  priority: TicketPriority;
};

export type VyjazdSuggestion = {
  key: string;
  store: string;
  address: string;
  contactPhone: string;
  deviceUuid: string;
  deviceName: string;
  ticketId: string;
  reasons: string[];
  priority: TicketPriority;
  storeDeviceCount: number;
  options: SuggestionOption[];
};

const OPEN_TICKET_STATUSES: TicketStatus[] = [
  "otvorene",
  "v_rieseni",
  "caka_diely",
];

const PRIORITY_RANK: Record<TicketPriority, number> = {
  nizka: 0,
  normalna: 1,
  vysoka: 2,
  urgentna: 3,
};

function maxPriority(a: TicketPriority, b: TicketPriority): TicketPriority {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function expressSlot(now: Date) {
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setMinutes(0);
  if (now.getHours() < 15) {
    d.setHours(16);
  } else {
    d.setDate(d.getDate() + 1);
    d.setHours(9);
  }
  return d;
}

function plannedSlot(now: Date) {
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setMinutes(0);
  d.setDate(d.getDate() + 3);
  d.setHours(9);
  return d;
}

function slotLabel(d: Date, now: Date) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTarget = new Date(d);
  startOfTarget.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (startOfTarget.getTime() - startOfToday.getTime()) / 86_400_000,
  );
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diffDays === 0) return `dnes ${hm}`;
  if (diffDays === 1) return `zajtra ${hm}`;
  return new Intl.DateTimeFormat("sk-SK", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function deviceStoreLabel(d: ServiceDevice) {
  return (
    [d.code && `#${d.code}`, d.partner, d.city].filter(Boolean).join(" · ") ||
    d.name
  );
}

function storeKey(d: ServiceDevice) {
  return `${d.partner}|${d.city}`.trim().toLowerCase();
}

type Candidate = {
  key: string;
  device: ServiceDevice | null;
  deviceUuid: string;
  deviceName: string;
  store: string;
  address: string;
  phone: string;
  reasons: string[];
  priority: TicketPriority;
  ticketId: string;
};

function shorten(text: string, max = 60) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function buildDescription(opts: {
  scope: "focused" | "combined";
  candidate: Candidate;
  siblings: ServiceDevice[];
}) {
  const { scope, candidate, siblings } = opts;
  const lines: string[] = [
    scope === "combined"
      ? "Automatický návrh súhrnného výjazdu pre celú predajňu."
      : "Automatický návrh výjazdu na základe otvorených signálov.",
    "",
    `Predajňa / zákazník: ${candidate.store}`,
  ];
  if (candidate.address) lines.push(`Adresa: ${candidate.address}`);
  if (candidate.deviceName) {
    lines.push(
      `Zariadenie: ${candidate.deviceName}${
        candidate.deviceUuid ? ` (${candidate.deviceUuid})` : ""
      }`,
    );
  }
  lines.push("", "Dôvody:");
  for (const reason of candidate.reasons) lines.push(`• ${reason}`);

  if (scope === "combined" && siblings.length > 0) {
    lines.push("", `Zariadenia na predajni s aktívnym alertom (${siblings.length}):`);
    for (const s of siblings) lines.push(`• ${s.name}`);
  }

  return lines.join("\n");
}

function buildOptions(
  candidate: Candidate,
  siblings: ServiceDevice[],
  now: Date,
): SuggestionOption[] {
  const combinedPossible = siblings.length > 1;
  const primaryReason = candidate.reasons[0] ?? "servisný zásah";
  const shortStore = shorten(candidate.store, 40);

  const expres = expressSlot(now);
  const planned = plannedSlot(now);

  const focusedTitle = `Servis: ${shortStore} — ${shorten(primaryReason, 40)}`;
  const focusedDescription = buildDescription({
    scope: "focused",
    candidate,
    siblings,
  });

  const optionA: SuggestionOption = {
    id: "expres",
    label: `Expresný výjazd · ${slotLabel(expres, now)}`,
    hint: combinedPossible
      ? "Len toto zariadenie, čo najskôr"
      : "Vyriešiť čo najskôr",
    scope: "focused",
    title: focusedTitle,
    description: focusedDescription,
    scheduledAt: toLocalInput(expres),
    scheduledLabel: slotLabel(expres, now),
    priority: candidate.priority,
  };

  const optionB: SuggestionOption = combinedPossible
    ? {
        id: "planovany",
        label: `Súhrnný výjazd · ${slotLabel(planned, now)}`,
        hint: `Celá predajňa (${siblings.length} zariadení) naraz`,
        scope: "combined",
        title: `Súhrnný servis predajne: ${shortStore}`,
        description: buildDescription({
          scope: "combined",
          candidate,
          siblings,
        }),
        scheduledAt: toLocalInput(planned),
        scheduledLabel: slotLabel(planned, now),
        priority: candidate.priority,
      }
    : {
        id: "planovany",
        label: `Plánovaný výjazd · ${slotLabel(planned, now)}`,
        hint: "Naplánovať na neskôr",
        scope: "focused",
        title: focusedTitle,
        description: focusedDescription,
        scheduledAt: toLocalInput(planned),
        scheduledLabel: slotLabel(planned, now),
        priority: candidate.priority,
      };

  return [optionA, optionB];
}

export async function listVyjazdSuggestions(opts?: {
  deviceUuid?: string;
  ticketId?: string;
  limit?: number;
}): Promise<VyjazdSuggestion[]> {
  const [devices, tickets, vyjazdy] = await Promise.all([
    listDevices(),
    listTickets(),
    listVyjazdy(),
  ]);

  const activeVyjazdy = vyjazdy.filter(
    (v) => v.status === "naplanovany" || v.status === "prebieha",
  );
  const coveredDeviceUuids = new Set(
    activeVyjazdy.map((v) => v.deviceUuid).filter(Boolean),
  );
  const coveredTicketIds = new Set(
    activeVyjazdy.map((v) => v.ticketId).filter(Boolean),
  );

  const openTickets = tickets.filter((t) =>
    OPEN_TICKET_STATUSES.includes(t.status),
  );

  const deviceByUuid = new Map(devices.map((d) => [d.uuid, d]));

  const alertDevices = devices.filter(
    (d) => hasHealthAlert(d) || (d.isOnline && !d.isConnectedToVpn),
  );
  const siblingsByStore = new Map<string, ServiceDevice[]>();
  for (const d of alertDevices) {
    const key = storeKey(d);
    if (!key || key === "|") continue;
    const arr = siblingsByStore.get(key) ?? [];
    arr.push(d);
    siblingsByStore.set(key, arr);
  }

  const candidates = new Map<string, Candidate>();

  function ensureDeviceCandidate(d: ServiceDevice): Candidate {
    let c = candidates.get(d.uuid);
    if (!c) {
      c = {
        key: d.uuid,
        device: d,
        deviceUuid: d.uuid,
        deviceName: d.name,
        store: deviceStoreLabel(d),
        address: d.address,
        phone: d.phone,
        reasons: [],
        priority: "normalna",
        ticketId: "",
      };
      candidates.set(d.uuid, c);
    }
    return c;
  }

  const seenReasons = new Map<string, Set<string>>();
  function addReason(c: Candidate, reason: string) {
    let set = seenReasons.get(c.key);
    if (!set) {
      set = new Set();
      seenReasons.set(c.key, set);
    }
    if (set.has(reason)) return;
    set.add(reason);
    c.reasons.push(reason);
  }

  if (isAlertsEnabled()) {
    for (const d of alertDevices) {
      if (coveredDeviceUuids.has(d.uuid)) continue;
      const c = ensureDeviceCandidate(d);
      for (const type of detectActiveAlerts(d)) {
        addReason(c, `Alert: ${ALERT_LABELS[type]}`);
        c.priority = maxPriority(c.priority, alertPriority(type));
      }
    }
  }

  for (const t of openTickets) {
    if (coveredTicketIds.has(t.id)) continue;
    if (!t.deviceUuid) continue;
    if (coveredDeviceUuids.has(t.deviceUuid)) continue;

    const device = deviceByUuid.get(t.deviceUuid);
    let c: Candidate;
    if (device) {
      c = ensureDeviceCandidate(device);
    } else {
      c =
        candidates.get(t.deviceUuid) ??
        ({
          key: t.deviceUuid,
          device: null,
          deviceUuid: t.deviceUuid,
          deviceName: t.deviceSerial || t.deviceUuid,
          store: t.customerName,
          address: "",
          phone: t.customerPhone,
          reasons: [],
          priority: "normalna",
          ticketId: "",
        } satisfies Candidate);
      candidates.set(t.deviceUuid, c);
    }
    if (!c.ticketId) c.ticketId = t.id;
    if (!c.store) c.store = t.customerName;
    if (!c.phone) c.phone = t.customerPhone;
    addReason(
      c,
      `${t.source === "auto" ? "Auto ticket" : "Ticket"} ${ticketCode(
        t.number,
      )}: ${shorten(t.title, 60)}`,
    );
    c.priority = maxPriority(c.priority, t.priority);
  }

  for (const t of openTickets) {
    if (t.deviceUuid) continue;
    if (coveredTicketIds.has(t.id)) continue;
    const key = `ticket:${t.id}`;
    const c: Candidate = {
      key,
      device: null,
      deviceUuid: "",
      deviceName: "",
      store: t.customerName || t.deviceSerial || "Zákazník",
      address: "",
      phone: t.customerPhone,
      reasons: [
        `${t.source === "auto" ? "Auto ticket" : "Ticket"} ${ticketCode(
          t.number,
        )}: ${shorten(t.title, 60)}`,
      ],
      priority: t.priority,
      ticketId: t.id,
    };
    candidates.set(key, c);
  }

  let list = [...candidates.values()].filter((c) => c.reasons.length > 0);

  if (opts?.deviceUuid) {
    list = list.filter((c) => c.deviceUuid === opts.deviceUuid);
  }
  if (opts?.ticketId) {
    list = list.filter(
      (c) => c.ticketId === opts.ticketId || c.key === `ticket:${opts.ticketId}`,
    );
  }

  const now = new Date();

  const suggestions: VyjazdSuggestion[] = list.map((c) => {
    const siblings = c.device
      ? (siblingsByStore.get(storeKey(c.device)) ?? [c.device])
      : [];
    return {
      key: c.key,
      store: c.store,
      address: c.address,
      contactPhone: c.phone,
      deviceUuid: c.deviceUuid,
      deviceName: c.deviceName,
      ticketId: c.ticketId,
      reasons: c.reasons,
      priority: c.priority,
      storeDeviceCount: siblings.length,
      options: buildOptions(c, siblings, now),
    };
  });

  suggestions.sort((a, b) => {
    if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) {
      return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    }
    if (a.reasons.length !== b.reasons.length) {
      return b.reasons.length - a.reasons.length;
    }
    return a.store.localeCompare(b.store, "sk");
  });

  const limit = opts?.limit ?? 8;
  return suggestions.slice(0, limit);
}
