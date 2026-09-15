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
import {
  deviceStoreLabel,
  prevadzkaKey,
  prevadzkyCountLabel,
  stopCoverageKey,
} from "./vyjazd-stops";

export type SuggestionOptionId = "expres" | "planovany";

export type SuggestionStop = {
  store: string;
  address: string;
  contactPhone: string;
  deviceUuid: string;
  ticketId: string;
};

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
  stops: SuggestionStop[];
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
  stopCount: number;
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

const MAX_ROUTE_STOPS = 6;

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

function sameNorm(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase() && a.trim() !== "";
}

function uniqueNonEmpty(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

type Candidate = {
  key: string;
  device: ServiceDevice | null;
  deviceUuid: string;
  deviceName: string;
  store: string;
  address: string;
  phone: string;
  city: string;
  partner: string;
  reasons: string[];
  priority: TicketPriority;
  ticketId: string;
};

type PrevadzkaBucket = {
  key: string;
  store: string;
  address: string;
  phone: string;
  city: string;
  partner: string;
  candidates: Candidate[];
  reasons: string[];
  priority: TicketPriority;
};

function shorten(text: string, max = 60) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function bucketKeyFor(c: Candidate) {
  if (c.device) {
    const key = prevadzkaKey(c.device);
    if (key) return key;
  }
  const store = c.store.trim().toLowerCase();
  const address = c.address.trim().toLowerCase();
  if (store || address) return `${store}|${address}`;
  return c.key;
}

function coverageKeyFor(bucket: PrevadzkaBucket) {
  return stopCoverageKey({
    store: bucket.store,
    address: bucket.address,
    deviceUuid: bucket.candidates[0]?.deviceUuid ?? "",
  });
}

function primaryCandidate(bucket: PrevadzkaBucket): Candidate {
  return [...bucket.candidates].sort((a, b) => {
    if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) {
      return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    }
    if (a.reasons.length !== b.reasons.length) {
      return b.reasons.length - a.reasons.length;
    }
    return a.deviceName.localeCompare(b.deviceName, "sk");
  })[0];
}

function stopFromCandidate(c: Candidate): SuggestionStop {
  return {
    store: c.store,
    address: c.address,
    contactPhone: c.phone,
    deviceUuid: c.deviceUuid,
    ticketId: c.ticketId,
  };
}

function stopFromBucket(bucket: PrevadzkaBucket): SuggestionStop {
  return stopFromCandidate(primaryCandidate(bucket));
}

function relatedRoute(
  origin: PrevadzkaBucket,
  all: PrevadzkaBucket[],
): PrevadzkaBucket[] {
  const related = all.filter((p) => {
    if (p.key === origin.key) return false;
    const samePartner = sameNorm(origin.partner, p.partner);
    const sameCity = sameNorm(origin.city, p.city);
    return samePartner || sameCity;
  });

  related.sort((a, b) => {
    const aSameCity = sameNorm(a.city, origin.city) ? 0 : 1;
    const bSameCity = sameNorm(b.city, origin.city) ? 0 : 1;
    if (aSameCity !== bSameCity) return aSameCity - bSameCity;
    if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) {
      return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    }
    return a.store.localeCompare(b.store, "sk");
  });

  return [origin, ...related].slice(0, MAX_ROUTE_STOPS);
}

function routeTitle(route: PrevadzkaBucket[]) {
  const n = prevadzkyCountLabel(route.length);
  const partners = uniqueNonEmpty(route.map((p) => p.partner));
  const cities = uniqueNonEmpty(route.map((p) => p.city));
  if (partners.length === 1) return `Trasa ${partners[0]} — ${n}`;
  if (cities.length === 1) return `Trasa ${cities[0]} — ${n}`;
  return `Servisná trasa — ${n}`;
}

function routeHint(route: PrevadzkaBucket[]) {
  const partners = uniqueNonEmpty(route.map((p) => p.partner));
  const cities = uniqueNonEmpty(route.map((p) => p.city));
  if (partners.length === 1) {
    return `Jeden výjazd cez prevádzky ${partners[0]}`;
  }
  if (cities.length === 1) {
    return `Jeden výjazd v meste ${cities[0]}`;
  }
  return `Jeden výjazd cez ${prevadzkyCountLabel(route.length)}`;
}

function buildFocusedDescription(candidate: Candidate, siblings: ServiceDevice[]) {
  const lines: string[] = [
    "Automatický návrh výjazdu na základe otvorených signálov.",
    "",
    `Prevádzka: ${candidate.store}`,
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
  if (siblings.length > 1) {
    lines.push(
      "",
      `Ďalšie zariadenia na prevádzke s alertom (${siblings.length - 1}):`,
    );
    for (const s of siblings) {
      if (s.uuid === candidate.deviceUuid) continue;
      lines.push(`• ${s.name}`);
    }
  }
  return lines.join("\n");
}

function buildStoreDescription(bucket: PrevadzkaBucket) {
  const lines: string[] = [
    "Automatický návrh súhrnného výjazdu pre celú prevádzku.",
    "",
    `Prevádzka: ${bucket.store}`,
  ];
  if (bucket.address) lines.push(`Adresa: ${bucket.address}`);
  lines.push("", "Dôvody:");
  for (const reason of bucket.reasons) lines.push(`• ${reason}`);
  const devices = bucket.candidates.filter((c) => c.deviceName);
  if (devices.length > 0) {
    lines.push("", `Zariadenia na prevádzke (${devices.length}):`);
    for (const c of devices) lines.push(`• ${c.deviceName}`);
  }
  return lines.join("\n");
}

function buildRouteDescription(route: PrevadzkaBucket[]) {
  const lines: string[] = [
    "Automatický návrh trasy výjazdu cez viac prevádzok.",
    "",
    `Trasa (${prevadzkyCountLabel(route.length)}):`,
  ];
  route.forEach((bucket, index) => {
    lines.push(
      `${index + 1}. ${bucket.store}${bucket.address ? ` — ${bucket.address}` : ""}`,
    );
    for (const reason of bucket.reasons.slice(0, 3)) {
      lines.push(`   • ${reason}`);
    }
  });
  return lines.join("\n");
}

function buildOptions(
  bucket: PrevadzkaBucket,
  route: PrevadzkaBucket[],
  now: Date,
): SuggestionOption[] {
  const candidate = primaryCandidate(bucket);
  const siblings = bucket.candidates
    .map((c) => c.device)
    .filter((d): d is ServiceDevice => Boolean(d));
  const multiDevice = siblings.length > 1;
  const multiStop = route.length > 1;
  const primaryReason = candidate.reasons[0] ?? "servisný zásah";
  const shortStore = shorten(candidate.store, 40);
  const focusedStop = stopFromCandidate(candidate);

  const expres = expressSlot(now);
  const planned = plannedSlot(now);

  const focusedTitle = `Servis: ${shortStore} — ${shorten(primaryReason, 40)}`;
  const focusedDescription = buildFocusedDescription(candidate, siblings);

  const optionA: SuggestionOption = {
    id: "expres",
    label: `Expresný výjazd · ${slotLabel(expres, now)}`,
    hint: multiStop || multiDevice
      ? "Len táto prevádzka, čo najskôr"
      : "Vyriešiť čo najskôr",
    scope: "focused",
    title: focusedTitle,
    description: focusedDescription,
    scheduledAt: toLocalInput(expres),
    scheduledLabel: slotLabel(expres, now),
    priority: candidate.priority,
    stops: [focusedStop],
  };

  const optionB: SuggestionOption = multiStop
    ? {
        id: "planovany",
        label: `Trasa · ${prevadzkyCountLabel(route.length)} · ${slotLabel(planned, now)}`,
        hint: routeHint(route),
        scope: "combined",
        title: routeTitle(route),
        description: buildRouteDescription(route),
        scheduledAt: toLocalInput(planned),
        scheduledLabel: slotLabel(planned, now),
        priority: route.reduce(
          (best, p) => maxPriority(best, p.priority),
          candidate.priority,
        ),
        stops: route.map(stopFromBucket),
      }
    : multiDevice
      ? {
          id: "planovany",
          label: `Súhrnný výjazd · ${slotLabel(planned, now)}`,
          hint: `Celá prevádzka (${siblings.length} zariadení) naraz`,
          scope: "combined",
          title: `Súhrnný servis prevádzky: ${shortStore}`,
          description: buildStoreDescription(bucket),
          scheduledAt: toLocalInput(planned),
          scheduledLabel: slotLabel(planned, now),
          priority: bucket.priority,
          stops: [stopFromBucket(bucket)],
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
          stops: [focusedStop],
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
  const coveredDeviceUuids = new Set<string>();
  const coveredTicketIds = new Set<string>();
  const coveredStores = new Set<string>();

  for (const v of activeVyjazdy) {
    if (v.deviceUuid) coveredDeviceUuids.add(v.deviceUuid);
    if (v.ticketId) coveredTicketIds.add(v.ticketId);
    const storeKey = stopCoverageKey(v);
    if (storeKey) coveredStores.add(storeKey);
    for (const stop of v.stops ?? []) {
      if (stop.deviceUuid) coveredDeviceUuids.add(stop.deviceUuid);
      if (stop.ticketId) coveredTicketIds.add(stop.ticketId);
      const key = stopCoverageKey(stop);
      if (key) coveredStores.add(key);
    }
  }

  const openTickets = tickets.filter((t) =>
    OPEN_TICKET_STATUSES.includes(t.status),
  );

  const deviceByUuid = new Map(devices.map((d) => [d.uuid, d]));

  const alertDevices = devices.filter(
    (d) => hasHealthAlert(d) || (d.isOnline && !d.isConnectedToVpn),
  );

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
        city: d.city,
        partner: d.partner,
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
          city: "",
          partner: "",
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
      city: "",
      partner: "",
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

  const list = [...candidates.values()].filter((c) => c.reasons.length > 0);

  const bucketsByKey = new Map<string, PrevadzkaBucket>();
  for (const c of list) {
    const key = bucketKeyFor(c);
    let bucket = bucketsByKey.get(key);
    if (!bucket) {
      bucket = {
        key,
        store: c.store,
        address: c.address,
        phone: c.phone,
        city: c.city,
        partner: c.partner,
        candidates: [],
        reasons: [],
        priority: c.priority,
      };
      bucketsByKey.set(key, bucket);
    }
    bucket.candidates.push(c);
    bucket.priority = maxPriority(bucket.priority, c.priority);
    if (!bucket.store) bucket.store = c.store;
    if (!bucket.address) bucket.address = c.address;
    if (!bucket.phone) bucket.phone = c.phone;
    if (!bucket.city) bucket.city = c.city;
    if (!bucket.partner) bucket.partner = c.partner;
    for (const reason of c.reasons) {
      if (!bucket.reasons.includes(reason)) bucket.reasons.push(reason);
    }
  }

  const uncoveredBuckets = [...bucketsByKey.values()].filter((bucket) => {
    if (bucket.candidates.some((c) => c.deviceUuid && coveredDeviceUuids.has(c.deviceUuid))) {
      return false;
    }
    if (bucket.candidates.some((c) => c.ticketId && coveredTicketIds.has(c.ticketId))) {
      return false;
    }
    const key = coverageKeyFor(bucket);
    if (key && coveredStores.has(key)) return false;
    return true;
  });

  let displayBuckets = uncoveredBuckets;
  if (opts?.deviceUuid) {
    displayBuckets = displayBuckets.filter((bucket) =>
      bucket.candidates.some((c) => c.deviceUuid === opts.deviceUuid),
    );
  }
  if (opts?.ticketId) {
    displayBuckets = displayBuckets.filter(
      (bucket) =>
        bucket.candidates.some((c) => c.ticketId === opts.ticketId) ||
        bucket.candidates.some((c) => c.key === `ticket:${opts.ticketId}`),
    );
  }

  const now = new Date();
  const suggestions: VyjazdSuggestion[] = displayBuckets.map((bucket) => {
    const candidate = primaryCandidate(bucket);
    const route = relatedRoute(bucket, uncoveredBuckets);
    const siblings = bucket.candidates.filter((c) => c.deviceUuid);
    return {
      key: bucket.key,
      store: bucket.store,
      address: bucket.address,
      contactPhone: bucket.phone,
      deviceUuid: candidate.deviceUuid,
      deviceName: candidate.deviceName,
      ticketId: candidate.ticketId,
      reasons: bucket.reasons,
      priority: bucket.priority,
      storeDeviceCount: siblings.length,
      stopCount: route.length,
      options: buildOptions(bucket, route, now),
    };
  });

  suggestions.sort((a, b) => {
    if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) {
      return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    }
    if (a.stopCount !== b.stopCount) return b.stopCount - a.stopCount;
    if (a.reasons.length !== b.reasons.length) {
      return b.reasons.length - a.reasons.length;
    }
    return a.store.localeCompare(b.store, "sk");
  });

  const limit = opts?.limit ?? 8;
  return suggestions.slice(0, limit);
}
