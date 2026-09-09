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
    // "code-partner-...,City address" or "code...,City"
    const second = parts[1];
    const cityMatch = second.match(/^([^0-9]+?)(?:\s+\d|$)/);
    if (cityMatch && second.includes(" ")) {
      city = cityMatch[1].trim();
      address = second.slice(city.length).trim();
    } else {
      city = second;
    }
  } else if (rest) {
    // single segment leftovers after code
    address = rest;
  }

  if (!address && rest && parts.length <= 1) {
    address = rest;
  } else if (rest && !address.includes(rest) && parts.length >= 2) {
    // keep store label in address prefix when useful
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
    isOnline: Boolean(raw.is_online),
    supervisorVersion: raw.supervisor_version,
    osVersion: raw.os_version,
    dashboardUrl: raw.dashboard_url,
    fleet: raw.fleet,
    deviceType: raw.device_type,
    importedAt,
  };
}

export function hardwareLabel(deviceType: string) {
  if (deviceType.includes("raspberrypi4")) return "Raspberry Pi 4";
  if (deviceType.includes("raspberrypi3")) return "Raspberry Pi 3";
  return deviceType;
}
