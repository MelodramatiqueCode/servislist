import type { BalenaDeviceRaw, ServiceDevice } from "./types";

const PHONE_RE =
  /(?:tel\.?\s*č\.?\s*:?\s*|tel\.?\s*:?\s*|č\.?\s*vedúca\s*)([+\d][\d\s/.-]{6,})/gi;
const LOOSE_PHONE_RE = /(?:\+|0)\d[\d\s/-]{7,}/g;

function cleanPhone(raw: string) {
  return raw.replace(/\s+/g, " ").replace(/[.,;]+$/g, "").trim();
}

function extractPhones(name: string): { phones: string[]; cleaned: string } {
  const phones: string[] = [];
  let cleaned = name;

  cleaned = cleaned.replace(PHONE_RE, (_, p1: string) => {
    phones.push(cleanPhone(p1));
    return "";
  });

  if (phones.length === 0) {
    const loose = name.match(LOOSE_PHONE_RE) ?? [];
    for (const p of loose) {
      const c = cleanPhone(p);
      if (c.replace(/\D/g, "").length >= 9) {
        phones.push(c);
        cleaned = cleaned.replace(p, "");
      }
    }
  }

  cleaned = cleaned
    .replace(/\s{2,}/g, " ")
    .replace(/[,\s;-]+$/g, "")
    .replace(/,\s*,/g, ",")
    .trim();

  return { phones: [...new Set(phones)], cleaned };
}

function parseCodeParts(head: string) {
  const trimmed = head.trim();
  const m = trimmed.match(
    /^(\d+)\s*[-_]\s*([A-Za-zÁ-ž0-9]+)\s*[-_]?\s*(.*)$/u,
  );
  if (!m) {
    return { code: trimmed, partner: "", rest: "" };
  }
  return {
    code: m[1],
    partner: m[2],
    rest: (m[3] || "").trim(),
  };
}

export function parseDeviceName(deviceName: string) {
  const { phones, cleaned } = extractPhones(deviceName);
  const parts = cleaned
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const head = parts[0] ?? cleaned;
  const { code, partner, rest } = parseCodeParts(head);

  let city = "";
  let address = "";

  if (parts.length >= 3) {
    city = parts[1];
    address = parts.slice(2).join(", ");
  } else if (parts.length === 2) {
    const second = parts[1];
    const cityMatch = second.match(/^([^0-9]+?)(?:\s+\d|$)/);
    if (cityMatch && second.includes(" ")) {
      city = cityMatch[1].trim();
      address = second.slice(city.length).trim();
    } else {
      city = second;
    }
  } else if (rest) {
    address = rest;
  }

  if (!address && rest && parts.length <= 1) {
    address = rest;
  } else if (rest && !address.includes(rest) && parts.length >= 2) {
    address = address ? `${rest}, ${address}` : rest;
  }

  const labelParts = [code && `#${code}`, partner, city || head]
    .filter(Boolean)
    .join(" · ");

  return {
    code,
    partner,
    city,
    address: address || rest || cleaned,
    phone: phones[0] ?? "",
    label: labelParts || cleaned,
  };
}

function numOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeBalenaDevice(
  raw: BalenaDeviceRaw,
  importedAt = new Date().toISOString(),
): ServiceDevice {
  const parsed = parseDeviceName(raw.device_name);
  return {
    uuid: raw.uuid,
    balenaId: raw.id,
    name: raw.device_name.trim(),
    code: parsed.code,
    partner: parsed.partner,
    city: parsed.city,
    address: parsed.address,
    phone: parsed.phone,
    status: raw.status,
    overallStatus: raw.overall_status || raw.status || "",
    isOnline: Boolean(raw.is_online),
    isConnectedToVpn: Boolean(raw.is_connected_to_vpn),
    apiHeartbeat: raw.api_heartbeat_state || "",
    supervisorVersion: raw.supervisor_version,
    osVersion: raw.os_version,
    dashboardUrl: raw.dashboard_url,
    fleet: raw.fleet,
    deviceType: raw.device_type,
    importedAt,
    lastConnectivityEvent: raw.last_connectivity_event || "",
    lastVpnEvent: raw.last_vpn_event || "",
    ipAddress: raw.ip_address || "",
    publicAddress: raw.public_address || "",
    macAddress: raw.mac_address || "",
    cpuUsage: numOrNull(raw.cpu_usage),
    cpuTemp: numOrNull(raw.cpu_temp),
    memoryUsage: numOrNull(raw.memory_usage),
    memoryTotal: numOrNull(raw.memory_total),
    storageUsage: numOrNull(raw.storage_usage),
    storageTotal: numOrNull(raw.storage_total),
    isUndervolted: Boolean(raw.is_undervolted),
    note: raw.note || "",
  };
}

export function hardwareLabel(deviceType: string) {
  if (deviceType.includes("raspberrypi4")) return "Raspberry Pi 4";
  if (deviceType.includes("raspberrypi3")) return "Raspberry Pi 3";
  return deviceType;
}

export function formatBytesMb(value: number | null | undefined) {
  if (value == null) return "—";
  if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`;
  return `${Math.round(value)} MB`;
}

export function formatPercent(
  used: number | null | undefined,
  total: number | null | undefined,
) {
  if (used == null || total == null || total <= 0) return "—";
  return `${Math.round((used / total) * 100)} %`;
}

export function memoryLabel(device: ServiceDevice) {
  if (device.memoryUsage == null || device.memoryTotal == null) return "—";
  return `${formatBytesMb(device.memoryUsage)} / ${formatBytesMb(device.memoryTotal)} (${formatPercent(device.memoryUsage, device.memoryTotal)})`;
}

export function storageLabel(device: ServiceDevice) {
  if (device.storageUsage == null || device.storageTotal == null) return "—";
  return `${formatBytesMb(device.storageUsage)} / ${formatBytesMb(device.storageTotal)} (${formatPercent(device.storageUsage, device.storageTotal)})`;
}

export function hasHealthAlert(device: ServiceDevice) {
  return (
    !device.isOnline ||
    device.isUndervolted ||
    (device.cpuTemp != null && device.cpuTemp >= 80) ||
    (device.storageUsage != null &&
      device.storageTotal != null &&
      device.storageTotal > 0 &&
      device.storageUsage / device.storageTotal >= 0.9)
  );
}
