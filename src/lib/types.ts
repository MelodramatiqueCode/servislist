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

export type BalenaDeviceRaw = {
  id: number;
  uuid: string;
  device_name: string;
  status: string;
  is_online: boolean;
  supervisor_version: string;
  os_version: string;
  dashboard_url: string;
  fleet: string;
  device_type: string;
  last_connectivity_event?: string | null;
  last_vpn_event?: string | null;
  is_connected_to_vpn?: boolean | null;
  api_heartbeat_state?: string | null;
  overall_status?: string | null;
  ip_address?: string | null;
  public_address?: string | null;
  mac_address?: string | null;
  cpu_usage?: number | null;
  cpu_temp?: number | null;
  memory_usage?: number | null;
  memory_total?: number | null;
  storage_usage?: number | null;
  storage_total?: number | null;
  is_undervolted?: boolean | null;
  note?: string | null;
};

export type ServiceDevice = {
  uuid: string;
  balenaId: number;
  name: string;
  code: string;
  partner: string;
  city: string;
  address: string;
  phone: string;
  status: string;
  overallStatus: string;
  isOnline: boolean;
  isConnectedToVpn: boolean;
  apiHeartbeat: string;
  supervisorVersion: string;
  osVersion: string;
  dashboardUrl: string;
  fleet: string;
  deviceType: string;
  importedAt: string;
  lastSyncedAt?: string;
  lastConnectivityEvent: string;
  lastVpnEvent: string;
  ipAddress: string;
  publicAddress: string;
  macAddress: string;
  cpuUsage: number | null;
  cpuTemp: number | null;
  memoryUsage: number | null;
  memoryTotal: number | null;
  storageUsage: number | null;
  storageTotal: number | null;
  isUndervolted: boolean;
  note: string;
};

export type Ticket = {
  id: string;
  number: number;
  title: string;
  description: string;
  deviceType: string;
  deviceSerial: string;
  deviceUuid: string;
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
  deviceUuid?: string;
  customerName: string;
  customerPhone: string;
  assignedTo: string;
  priority: TicketPriority;
};

export type TicketStore = {
  nextNumber: number;
  tickets: Ticket[];
};

export type DeviceStore = {
  importedAt: string;
  syncedAt?: string;
  lastSyncError?: string;
  devices: ServiceDevice[];
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
  "Raspberry Pi (Balena)",
  "Notebook",
  "PC / stolný počítač",
  "Telefón",
  "Tablet",
  "Tlačiareň",
  "Monitor",
  "Sieťové zariadenie",
  "Iné",
] as const;
