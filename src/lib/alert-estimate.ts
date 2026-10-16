import type { AlertConfig } from "./alert-config";
import { defaultAlertConfig } from "./alert-config";
import { isWithinStoreHours } from "./alert-hours";
import { clusterOfflineWaves } from "./alert-policy";

export type EstimateTicket = {
  source?: string;
  alertType?: string;
  deviceUuid?: string;
  customerName?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  status: string;
};

export type NoiseEstimate = {
  inputAuto: number;
  keptUndervolt: number;
  keptDiskVpn: number;
  offlineInput: number;
  offlineShort: number;
  offlineOutsideHours: number;
  offlineMassClusters: number;
  offlineMassTickets: number;
  offlineStandalone: number;
  hotInput: number;
  hotCollapsed: number;
  flapTickets: number;
  estimatedTickets: number;
  suppressed: number;
};

function durationMinutes(ticket: EstimateTicket) {
  const a = new Date(ticket.createdAt).getTime();
  const b = new Date(ticket.updatedAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return (b - a) / 60_000;
}

function isOfflineTicket(ticket: EstimateTicket) {
  return (
    ticket.alertType === "offline" ||
    (ticket.title ?? "").toLowerCase().startsWith("offline")
  );
}

function isHotTicket(ticket: EstimateTicket) {
  return (
    ticket.alertType === "hot" ||
    (ticket.title ?? "").toLowerCase().includes("horúce")
  );
}

/**
 * Spätný odhad: koľko auto-ticketov by vzniklo pri nových pravidlách,
 * keby sme mali len históriu ticketov (bez sync snapshotov).
 */
export function estimateFromTickets(
  tickets: EstimateTicket[],
  config: AlertConfig = defaultAlertConfig(),
  range?: { from: string; to: string },
): NoiseEstimate {
  const from = range ? new Date(range.from).getTime() : -Infinity;
  const to = range ? new Date(range.to).getTime() : Infinity;

  const auto = tickets.filter((t) => {
    if ((t.source ?? "auto") !== "auto") return false;
    const created = new Date(t.createdAt).getTime();
    return !Number.isNaN(created) && created >= from && created <= to;
  });

  const undervolt = auto.filter((t) => t.alertType === "undervolt");
  const diskVpn = auto.filter(
    (t) => t.alertType === "disk" || t.alertType === "vpn_down",
  );
  const offline = auto.filter(isOfflineTicket);
  const hot = auto.filter(isHotTicket);

  const waves = clusterOfflineWaves(
    offline,
    config.massWindowMinutes,
    config.massMinDevices,
  );
  const massIds = new Set(
    waves.flat().map((t) => `${t.createdAt}:${t.deviceUuid}:${t.title}`),
  );

  let offlineShort = 0;
  let offlineOutsideHours = 0;
  let offlineStandalone = 0;

  for (const ticket of offline) {
    const key = `${ticket.createdAt}:${ticket.deviceUuid}:${ticket.title}`;
    if (massIds.has(key)) continue;

    const created = new Date(ticket.createdAt);
    const outside = !isWithinStoreHours(
      created,
      {
        uuid: ticket.deviceUuid,
        name: ticket.customerName,
      },
      config,
    );
    const short =
      ticket.status === "hotove" &&
      durationMinutes(ticket) < config.offlineGraceMinutes;

    if (outside) {
      offlineOutsideHours += 1;
      continue;
    }
    if (short) {
      offlineShort += 1;
      continue;
    }
    offlineStandalone += 1;
  }

  const hotByDevice = new Map<string, EstimateTicket[]>();
  for (const ticket of hot) {
    const key = ticket.deviceUuid || ticket.customerName || ticket.title || "x";
    const list = hotByDevice.get(key) ?? [];
    list.push(ticket);
    hotByDevice.set(key, list);
  }
  let hotCollapsed = 0;
  for (const list of hotByDevice.values()) {
    const sorted = [...list].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    let bursts = 0;
    let last = -Infinity;
    for (const ticket of sorted) {
      const t = new Date(ticket.createdAt).getTime();
      if (t - last > config.hotMinMinutes * 60_000) bursts += 1;
      last = t;
    }
    hotCollapsed += Math.max(1, bursts);
  }

  const shortsByDevice = new Map<string, number>();
  for (const ticket of offline) {
    const key = `${ticket.createdAt}:${ticket.deviceUuid}:${ticket.title}`;
    if (massIds.has(key)) continue;
    const created = new Date(ticket.createdAt);
    const outside = !isWithinStoreHours(
      created,
      {
        uuid: ticket.deviceUuid,
        name: ticket.customerName,
      },
      config,
    );
    if (outside) continue;
    if (
      ticket.status === "hotove" &&
      durationMinutes(ticket) < config.offlineGraceMinutes
    ) {
      const dkey = ticket.deviceUuid || ticket.customerName || "x";
      shortsByDevice.set(dkey, (shortsByDevice.get(dkey) ?? 0) + 1);
    }
  }
  let flapTickets = 0;
  for (const count of shortsByDevice.values()) {
    if (count >= config.flapMinCount) flapTickets += 1;
  }

  const estimatedTickets =
    undervolt.length +
    diskVpn.length +
    waves.length +
    offlineStandalone +
    hotCollapsed +
    flapTickets;

  return {
    inputAuto: auto.length,
    keptUndervolt: undervolt.length,
    keptDiskVpn: diskVpn.length,
    offlineInput: offline.length,
    offlineShort,
    offlineOutsideHours,
    offlineMassClusters: waves.length,
    offlineMassTickets: waves.length,
    offlineStandalone,
    hotInput: hot.length,
    hotCollapsed,
    flapTickets,
    estimatedTickets,
    suppressed: Math.max(0, auto.length - estimatedTickets),
  };
}

/** Odhad zo septembrových súhrnných čísel (10.–28. 9.), keď nie je dump ticketov. */
export function estimateFromSeptemberSummary() {
  const auto = 1477;
  const massWaveTickets = 641;
  const massWaves = 5;
  const hotFilakovo = 262;
  const undervoltKeep = auto - massWaveTickets - hotFilakovo;
  // zvyšok 574 zahŕňa undervolt (ostáva), disk/vpn, nočné offline a iné short
  // konzervatívne: 40 % zvyšku ostane (undervolt + dlhé offline + disk),
  // zvyšok padne do histórie / hodín.
  const remainingKeep = Math.round(574 * 0.35);
  const hotKeep = 2; // hysterézia zloží flap #200 na 1–2 tickety
  const flapKeep = 3; // zopár zariadení s opakovaným dennným flapom
  const estimated = massWaves + remainingKeep + hotKeep + flapKeep;
  return {
    period: "2026-09-10 až 2026-09-28",
    inputAuto: auto,
    massWaveTickets,
    massWaves,
    hotFilakovo,
    estimatedTickets: estimated,
    suppressed: auto - estimated,
    notes: [
      `${massWaveTickets} offline z 5 vĺn → ${massWaves} incident ticketov (grace 15 min + mass).`,
      `${hotFilakovo} Horúce CPU na #200 JLM Fiľakovo → ~${hotKeep} ticketov (open ${82} °C / close ${75} °C / ${10} min).`,
      `Nočné offline (#264, #114) mimo 07:00–21:00 → len história.`,
      `Undervolt ostáva okamžitý ticket.`,
      `Krátke epizódy (medián 5 min) → device events; flap ticket len pri ≥5 za 7 dní.`,
    ],
  };
}
