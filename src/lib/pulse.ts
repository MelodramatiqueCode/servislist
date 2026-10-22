import { ASSIGNED_TO_DEFAULT } from "./ticket-input";
import type { Ticket, TicketPriority, TicketStatus, Vyjazd } from "./types";
import { vyjazdTicketIds } from "./vyjazd-stops";

export const PULSE_ACCENT = "#ff4d1a";

const SOURCE_BOT_LABELS = {
  servis: "Servis bot",
  hotline: "Hotline bot",
  elevenlabs: "ElevenLabs hotline",
} as const;

export function ticketProgress(status: TicketStatus) {
  switch (status) {
    case "otvorene":
      return 10;
    case "v_rieseni":
      return 45;
    case "caka_diely":
      return 70;
    case "hotove":
      return 100;
  }
}

export function ticketStripeClass(priority: TicketPriority) {
  switch (priority) {
    case "urgentna":
    case "vysoka":
      return "p-vysoka";
    case "nizka":
      return "p-nizka";
    default:
      return "p-normalna";
  }
}

export function ticketSourceLabel(ticket: Pick<Ticket, "source" | "assignedTo" | "notes">) {
  if ((ticket.source ?? "manual") !== "auto") return "manuálne";
  const hay = [
    ticket.assignedTo,
    ...(ticket.notes ?? []).map((n) => n.author),
  ]
    .join(" ")
    .toLowerCase();
  if (hay.includes("elevenlabs")) return SOURCE_BOT_LABELS.elevenlabs;
  if (hay.includes("hotline")) return SOURCE_BOT_LABELS.hotline;
  return SOURCE_BOT_LABELS.servis;
}

export function isBotSource(label: string) {
  return (
    label === SOURCE_BOT_LABELS.servis ||
    label === SOURCE_BOT_LABELS.hotline ||
    label === SOURCE_BOT_LABELS.elevenlabs
  );
}

export function ticketAssigneeLabel(assignedTo: string | undefined) {
  const name = String(assignedTo ?? "").trim();
  if (!name || name === ASSIGNED_TO_DEFAULT) {
    return { label: "nepridelené", assigned: false };
  }
  return { label: name, assigned: true };
}

export function relativeAge(iso: string, now = new Date()) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 0) return "teraz";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "teraz";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 d";
  return `${days} d`;
}

export function isSameLocalDay(iso: string, now = new Date()) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return false;
  return (
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate()
  );
}

export function formatDayShort(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sk-SK", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
  }).format(date);
}

export function plannedVyjazdForTicket(ticketId: string, vyjazdy: Vyjazd[]) {
  return (
    vyjazdy.find(
      (v) =>
        (v.status === "naplanovany" || v.status === "prebieha") &&
        vyjazdTicketIds(v).has(ticketId),
    ) ?? null
  );
}

export function sparkPolyline(
  values: number[],
  width = 90,
  height = 28,
) {
  const max = Math.max(...values, 1);
  if (values.length === 0) {
    return { points: "", lastX: width, lastY: height / 2 };
  }
  const step = values.length === 1 ? 0 : width / (values.length - 1);
  const points = values
    .map((value, i) => {
      const x = i * step;
      const y = height - 4 - (value / max) * (height - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = values[values.length - 1] ?? 0;
  return {
    points,
    lastX: (values.length - 1) * step,
    lastY: height - 4 - (last / max) * (height - 8),
  };
}

export function outageCountsByDay(
  startedAtList: string[],
  days = 7,
  now = new Date(),
) {
  const counts = Array.from({ length: days }, () => 0);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  for (const iso of startedAtList) {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) continue;
    const day = new Date(at);
    day.setHours(0, 0, 0, 0);
    const idx = Math.round((day.getTime() - start.getTime()) / 86400000);
    if (idx >= 0 && idx < days) counts[idx] += 1;
  }
  return counts;
}

export const OUTAGE_ALERTS = new Set([
  "offline",
  "mass_offline",
  "flap",
]);
