import type {
  TicketPriority,
  TicketStatus,
  VyjazdStatus,
} from "@/lib/types";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  VYJAZD_STATUS_LABELS,
} from "@/lib/types";

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDateTime(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("sk-SK", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ticketCode(number: number) {
  return `#${String(number).padStart(4, "0")}`;
}

export function vyjazdCode(number: number) {
  return `V-${String(number).padStart(4, "0")}`;
}

export function statusClass(status: TicketStatus) {
  switch (status) {
    case "otvorene":
      return "status-otvorene";
    case "v_rieseni":
      return "status-v-rieseni";
    case "caka_diely":
      return "status-caka";
    case "hotove":
      return "status-hotove";
  }
}

export function priorityClass(priority: TicketPriority) {
  switch (priority) {
    case "nizka":
      return "prio-nizka";
    case "normalna":
      return "prio-normalna";
    case "vysoka":
      return "prio-vysoka";
    case "urgentna":
      return "prio-urgentna";
  }
}

export function vyjazdStatusClass(status: VyjazdStatus) {
  switch (status) {
    case "naplanovany":
      return "status-otvorene";
    case "prebieha":
      return "status-v-rieseni";
    case "hotovy":
      return "status-hotove";
    case "zruseny":
      return "status-zruseny";
  }
}

export { PRIORITY_LABELS, STATUS_LABELS, VYJAZD_STATUS_LABELS };
