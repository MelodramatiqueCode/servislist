import { isDiskFull, hardwareLabel } from "./parse-device";
import { getAlertConfig } from "./alert-config";
import type { ServiceDevice, TicketAlertType, TicketPriority } from "./types";

export { isAlertAutoCloseEnabled, isAlertsEnabled } from "./alert-config";

export const ALERT_TYPES = [
  "offline",
  "undervolt",
  "hot",
  "disk",
  "vpn_down",
] as const;

export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_LABELS: Record<AlertType, string> = {
  offline: "Offline",
  undervolt: "Undervolt",
  hot: "Horúce CPU",
  disk: "Disk plný",
  vpn_down: "Bez VPN",
};

export function isAlertActive(device: ServiceDevice, type: AlertType): boolean {
  const config = getAlertConfig();
  switch (type) {
    case "offline":
      return !device.isOnline;
    case "undervolt":
      return device.isUndervolted;
    case "hot":
      return device.cpuTemp != null && device.cpuTemp >= config.hotOpenC;
    case "disk":
      return isDiskFull(device);
    case "vpn_down":
      return device.isOnline && !device.isConnectedToVpn;
    default:
      return false;
  }
}

export function detectActiveAlerts(device: ServiceDevice): AlertType[] {
  return ALERT_TYPES.filter((type) => isAlertActive(device, type));
}

export function alertPriority(type: AlertType): TicketPriority {
  switch (type) {
    case "hot":
      return "urgentna";
    case "offline":
    case "undervolt":
    case "disk":
      return "vysoka";
    case "vpn_down":
      return "normalna";
    default:
      return "normalna";
  }
}

export function deviceCustomerLabel(device: ServiceDevice) {
  return (
    [device.code && `#${device.code}`, device.partner, device.city]
      .filter(Boolean)
      .join(" · ") || device.name
  );
}

function metricLines(device: ServiceDevice) {
  const lines: string[] = [
    `Online: ${device.isOnline ? "áno" : "nie"}`,
    `VPN: ${device.isConnectedToVpn ? "áno" : "nie"}`,
    `Undervolt: ${device.isUndervolted ? "áno" : "nie"}`,
  ];
  if (device.cpuTemp != null) lines.push(`CPU teplota: ${Math.round(device.cpuTemp)} °C`);
  if (device.cpuUsage != null) lines.push(`CPU záťaž: ${Math.round(device.cpuUsage)} %`);
  if (
    device.storageUsage != null &&
    device.storageTotal != null &&
    device.storageTotal > 0
  ) {
    const pct = Math.round((device.storageUsage / device.storageTotal) * 100);
    lines.push(`Disk: ${pct} %`);
  }
  if (device.lastConnectivityEvent) {
    lines.push(`Posledná konektivita: ${device.lastConnectivityEvent}`);
  }
  if (device.ipAddress) lines.push(`IP: ${device.ipAddress}`);
  return lines.join("\n");
}

export function buildAlertTicket(device: ServiceDevice, type: AlertType) {
  const label = ALERT_LABELS[type];
  const shortName =
    [device.code && `#${device.code}`, device.city || device.partner]
      .filter(Boolean)
      .join(" ") || device.name;

  return {
    title: `${label}: ${shortName}`,
    description: [
      `Automatický alert z Balena syncu: ${label}.`,
      "",
      `Zariadenie: ${device.name}`,
      `UUID: ${device.uuid}`,
      device.dashboardUrl ? `Balena: ${device.dashboardUrl}` : "",
      "",
      "Stav pri detekcii:",
      metricLines(device),
    ]
      .filter((line) => line !== "")
      .join("\n"),
    deviceType: hardwareLabel(device.deviceType) || "Raspberry Pi (Balena)",
    deviceSerial: device.uuid,
    deviceUuid: device.uuid,
    customerName: deviceCustomerLabel(device),
    customerPhone: device.phone || "",
    assignedTo: "Automat",
    priority: alertPriority(type),
    source: "auto" as const,
    alertType: type,
  };
}

export function activationNote(type: AlertType, device: ServiceDevice) {
  return [
    `Nový alert „${ALERT_LABELS[type]}“ (priorita: ${alertPriority(type)}).`,
    "",
    "Stav pri detekcii:",
    metricLines(device),
  ].join("\n");
}

export function recoveryNote(type: AlertType, device: ServiceDevice) {
  const bits = [
    `Alert „${ALERT_LABELS[type]}“ sa vyriešil (zariadenie je OK podľa syncu).`,
    device.isOnline ? "Online: áno" : "Online: nie",
    device.isUndervolted ? "Undervolt: áno" : "Undervolt: nie",
  ];
  if (device.cpuTemp != null) bits.push(`CPU: ${Math.round(device.cpuTemp)} °C`);
  return bits.join(" · ");
}

export const TICKET_ALERT_LABELS: Record<TicketAlertType, string> = {
  ...ALERT_LABELS,
  mass_offline: "Hromadný výpadok",
  flap: "Opakovaný výpadok",
};

function shortDevice(device: ServiceDevice) {
  return (
    [device.code && `#${device.code}`, device.city || device.partner]
      .filter(Boolean)
      .join(" ") || device.name
  );
}

export function buildMassOfflineTicket(devices: ServiceDevice[], startedAt: string) {
  const lines = devices.slice(0, 40).map((d) => `- ${shortDevice(d)} · ${d.uuid}`);
  const extra =
    devices.length > 40 ? `\n- … a ďalších ${devices.length - 40}` : "";
  return {
    title: `Hromadný výpadok: ${devices.length} zariadení offline`,
    description: [
      `Hromadný offline v krátkom okne (od ${startedAt}).`,
      "Namiesto ticketu na každé zariadenie je jeden incident.",
      "",
      "Zasiahnuté zariadenia:",
      ...lines,
      extra,
    ]
      .filter(Boolean)
      .join("\n"),
    deviceType: "Raspberry Pi (Balena)",
    deviceSerial: "",
    deviceUuid: "",
    customerName: "Hromadný výpadok",
    customerPhone: "",
    assignedTo: "Automat",
    priority: "urgentna" as TicketPriority,
    source: "auto" as const,
    alertType: "mass_offline" as const,
  };
}

export function buildFlapTicket(
  device: ServiceDevice,
  count: number,
  windowDays: number,
) {
  return {
    title: `Opakovaný výpadok: ${shortDevice(device)}`,
    description: [
      `Zariadenie malo ${count} krátkych offline epizód za ${windowDays} dní.`,
      "Jednotlivé výpadky ostali v histórii zariadenia; tento ticket je súhrn opakovaného flapu.",
      "",
      `Zariadenie: ${device.name}`,
      `UUID: ${device.uuid}`,
    ].join("\n"),
    deviceType: hardwareLabel(device.deviceType) || "Raspberry Pi (Balena)",
    deviceSerial: device.uuid,
    deviceUuid: device.uuid,
    customerName: deviceCustomerLabel(device),
    customerPhone: device.phone || "",
    assignedTo: "Automat",
    priority: "vysoka" as TicketPriority,
    source: "auto" as const,
    alertType: "flap" as const,
  };
}
