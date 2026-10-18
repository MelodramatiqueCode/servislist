import { hardwareLabel } from "./parse-device";
import { deviceStoreLabel } from "./vyjazd-stops";
import type {
  ServiceDevice,
  TicketPriority,
  TicketStatus,
  VyjazdStatus,
} from "./types";
import { PRIORITY_LABELS, STATUS_LABELS, VYJAZD_STATUS_LABELS } from "./types";

export type FieldErrors = Record<string, string>;

export const TICKET_STATUSES = Object.keys(STATUS_LABELS) as TicketStatus[];
export const TICKET_PRIORITIES = Object.keys(
  PRIORITY_LABELS,
) as TicketPriority[];
export const VYJAZD_STATUSES = Object.keys(
  VYJAZD_STATUS_LABELS,
) as VyjazdStatus[];

export type TicketCreateFields = {
  title: string;
  description: string;
  deviceType: string;
  deviceSerial: string;
  deviceUuid: string;
  customerName: string;
  customerPhone: string;
  assignedTo: string;
  priority: TicketPriority;
  clientRef: string;
};

export function applyDeviceToTicketFields(
  device: ServiceDevice,
  fields: Partial<TicketCreateFields>,
): Partial<TicketCreateFields> {
  return {
    ...fields,
    deviceType:
      fields.deviceType?.trim() ||
      hardwareLabel(device.deviceType) ||
      fields.deviceType,
    deviceSerial: fields.deviceSerial?.trim() || device.uuid,
    deviceUuid: fields.deviceUuid?.trim() || device.uuid,
    customerName:
      fields.customerName?.trim() ||
      deviceStoreLabel(device) ||
      device.name,
    customerPhone: fields.customerPhone?.trim() || device.phone,
  };
}

/** Same rule as POST /api/v1/tickets → createTicket. */
export const ASSIGNED_TO_DEFAULT = "Nepriradené";

export function normalizeAssignedTo(raw: unknown): string {
  return String(raw ?? "").trim() || ASSIGNED_TO_DEFAULT;
}

export function assignedToChangeNote(
  previous: string,
  next: string,
  botId: string,
) {
  return `Servisák zmenený: ${previous} → ${next} (bot: ${botId})`;
}

export function normalizePriority(raw: unknown): TicketPriority {
  const value = String(raw ?? "").trim();
  if ((TICKET_PRIORITIES as string[]).includes(value)) {
    return value as TicketPriority;
  }
  return "normalna";
}

export function parseTicketStatus(raw: unknown): TicketStatus | null {
  const value = String(raw ?? "").trim();
  if ((TICKET_STATUSES as string[]).includes(value)) {
    return value as TicketStatus;
  }
  return null;
}

export function parseVyjazdStatus(raw: unknown): VyjazdStatus | null {
  const value = String(raw ?? "").trim();
  if ((VYJAZD_STATUSES as string[]).includes(value)) {
    return value as VyjazdStatus;
  }
  return null;
}

export function validateCreateTicket(
  fields: Partial<TicketCreateFields>,
): FieldErrors | null {
  const errors: FieldErrors = {};
  if (!fields.title?.trim()) {
    errors.title = "Vyplň názov ticketu.";
  }
  if (!fields.description?.trim()) {
    errors.description = "Vyplň popis problému.";
  }
  if (!fields.deviceType?.trim()) {
    errors.deviceType = "Vyplň typ zariadenia.";
  }
  if (!fields.customerName?.trim()) {
    errors.customerName =
      "Vyplň predajňu / zákazníka, alebo zadaj deviceUuid / prevádzku.";
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

export function collectTicketCreateFields(input: {
  title?: unknown;
  description?: unknown;
  deviceType?: unknown;
  deviceSerial?: unknown;
  deviceUuid?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  assignedTo?: unknown;
  priority?: unknown;
  clientRef?: unknown;
  prevadzka?: unknown;
}): Partial<TicketCreateFields> {
  const prevadzka = str(input.prevadzka);
  return {
    title: str(input.title),
    description: str(input.description),
    deviceType: str(input.deviceType),
    deviceSerial: str(input.deviceSerial),
    deviceUuid: str(input.deviceUuid),
    customerName: str(input.customerName) || prevadzka,
    customerPhone: str(input.customerPhone),
    assignedTo: normalizeAssignedTo(input.assignedTo),
    priority: normalizePriority(input.priority),
    clientRef: str(input.clientRef),
  };
}

function str(value: unknown) {
  return String(value ?? "").trim();
}
