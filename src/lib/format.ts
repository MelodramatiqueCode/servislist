import type { TicketPriority, TicketStatus } from "@/lib/types";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/types";

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function ticketCode(number: number) {
  return `#${String(number).padStart(4, "0")}`;
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

export { PRIORITY_LABELS, STATUS_LABELS };
