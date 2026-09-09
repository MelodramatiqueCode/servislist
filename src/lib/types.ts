export type TicketStatus =
  | "otvorene"
  | "v_rieseni"
  | "caka_diely"
  | "hotove";

export type TicketPriority = "nizka" | "normalna" | "vysoka" | "urgentna";

export type TicketNote = {
  id: string;
  text: string;
  author: string;
  createdAt: string;
};

export type Ticket = {
  id: string;
  number: number;
  title: string;
  description: string;
  deviceType: string;
  deviceSerial: string;
  customerName: string;
  customerPhone: string;
  assignedTo: string;
  status: TicketStatus;
  priority: TicketPriority;
  notes: TicketNote[];
  createdAt: string;
  updatedAt: string;
};

export type CreateTicketInput = {
  title: string;
  description: string;
  deviceType: string;
  deviceSerial: string;
  customerName: string;
  customerPhone: string;
  assignedTo: string;
  priority: TicketPriority;
};

export type TicketStore = {
  nextNumber: number;
  tickets: Ticket[];
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  otvorene: "Otvorené",
  v_rieseni: "V riešení",
  caka_diely: "Čaká diely",
  hotove: "Hotové",
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  nizka: "Nízka",
  normalna: "Normálna",
  vysoka: "Vysoká",
  urgentna: "Urgentná",
};

export const DEVICE_TYPES = [
  "Notebook",
  "PC / stolný počítač",
  "Telefón",
  "Tablet",
  "Tlačiareň",
  "Monitor",
  "Sieťové zariadenie",
  "Iné",
] as const;
