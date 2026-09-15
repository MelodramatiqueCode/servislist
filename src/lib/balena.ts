import type { BalenaDeviceRaw } from "./types";

const API_BASE = "https://api.balena-cloud.com/v7";

export type BalenaConfig = {
  token: string;
  fleetSlug: string;
};

export function getBalenaConfig(): BalenaConfig | null {
  const token = process.env.BALENA_API_TOKEN?.trim();
  if (!token) return null;
  return {
    token,
    fleetSlug: process.env.BALENA_FLEET_SLUG?.trim() || "ceo2/massiva",
  };
}

export function isBalenaConfigured() {
  return Boolean(getBalenaConfig());
}

type PineList<T> = { d: T[] };

type BalenaApplication = {
  id: number;
  slug: string;
  app_name: string;
};

type BalenaApiDevice = {
  id: number;
  uuid: string;
  device_name: string;
  status: string | null;
  overall_status: string | null;
  is_online: boolean;
  is_connected_to_vpn: boolean | null;
  api_heartbeat_state: string | null;
  supervisor_version: string | null;
  os_version: string | null;
  last_connectivity_event: string | null;
  last_vpn_event: string | null;
  ip_address: string | null;
  public_address: string | null;
  mac_address: string | null;
  cpu_usage: number | null;
  cpu_temp: number | null;
  memory_usage: number | null;
  memory_total: number | null;
  storage_usage: number | null;
  storage_total: number | null;
  is_undervolted: boolean | null;
  note: string | null;
  is_of__device_type?: Array<{ slug: string }> | { slug: string } | null;
  belongs_to__application?: Array<{ slug: string }> | { slug: string } | null;
};

function expandSlug(
  value:
    | Array<{ slug: string }>
    | { slug: string }
    | null
    | undefined,
): string {
  if (!value) return "";
  if (Array.isArray(value)) return value[0]?.slug ?? "";
  return value.slug ?? "";
}

async function balenaFetch<T>(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const method = init?.method ?? "GET";
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Balena API ${res.status}: ${body.slice(0, 200) || res.statusText}`,
    );
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text.trim()) return undefined as T;
  return JSON.parse(text) as T;
}

function requireBalenaConfig(
  config: BalenaConfig | null = getBalenaConfig(),
): BalenaConfig {
  if (!config?.token) {
    throw new Error("Chýba BALENA_API_TOKEN.");
  }
  return config;
}

export type BalenaDeviceConfigVar = {
  id: number;
  name: string;
  value: string;
};

export async function listDeviceConfigVars(
  deviceId: number,
  config: BalenaConfig = getBalenaConfig()!,
): Promise<BalenaDeviceConfigVar[]> {
  const { token } = requireBalenaConfig(config);
  const filter = encodeURIComponent(`device eq ${deviceId}`);
  const data = await balenaFetch<PineList<BalenaDeviceConfigVar>>(
    `/device_config_variable?$filter=${filter}&$select=id,name,value`,
    token,
  );
  return data?.d ?? [];
}

export async function upsertDeviceConfigVariables(
  deviceId: number,
  entries: Record<string, string>,
  config: BalenaConfig = getBalenaConfig()!,
): Promise<void> {
  const { token } = requireBalenaConfig(config);
  const existing = await listDeviceConfigVars(deviceId, config);

  for (const [name, value] of Object.entries(entries)) {
    const row = existing.find((item) => item.name === name);
    if (row) {
      if (row.value === value) continue;
      await balenaFetch(`/device_config_variable(${row.id})`, token, {
        method: "PATCH",
        body: { value },
      });
    } else {
      await balenaFetch("/device_config_variable", token, {
        method: "POST",
        body: { device: deviceId, name, value },
      });
    }
  }
}

export async function deleteDeviceConfigVariables(
  deviceId: number,
  names: string[],
  config: BalenaConfig = getBalenaConfig()!,
): Promise<void> {
  const { token } = requireBalenaConfig(config);
  const want = new Set(names);
  const existing = await listDeviceConfigVars(deviceId, config);

  for (const row of existing) {
    if (!want.has(row.name)) continue;
    await balenaFetch(`/device_config_variable(${row.id})`, token, {
      method: "DELETE",
    });
  }
}

export async function resolveFleetId(
  token: string,
  fleetSlug: string,
): Promise<number> {
  const encoded = encodeURIComponent(fleetSlug);
  const data = await balenaFetch<PineList<BalenaApplication>>(
    `/application?$filter=slug%20eq%20'${encoded}'&$select=id,slug,app_name`,
    token,
  );
  const app = data.d?.[0];
  if (!app?.id) {
    throw new Error(`Fleet „${fleetSlug}“ sa nenašiel.`);
  }
  return app.id;
}

export async function fetchBalenaFleetDevices(
  config: BalenaConfig = getBalenaConfig()!,
): Promise<BalenaDeviceRaw[]> {
  if (!config?.token) {
    throw new Error("Chýba BALENA_API_TOKEN.");
  }

  const fleetId = await resolveFleetId(config.token, config.fleetSlug);
  const pageSize = 200;
  let skip = 0;
  const all: BalenaDeviceRaw[] = [];

  const select = [
    "id",
    "uuid",
    "device_name",
    "status",
    "overall_status",
    "is_online",
    "is_connected_to_vpn",
    "api_heartbeat_state",
    "supervisor_version",
    "os_version",
    "last_connectivity_event",
    "last_vpn_event",
    "ip_address",
    "public_address",
    "mac_address",
    "cpu_usage",
    "cpu_temp",
    "memory_usage",
    "memory_total",
    "storage_usage",
    "storage_total",
    "is_undervolted",
    "note",
  ].join(",");

  const expand =
    "is_of__device_type($select=slug),belongs_to__application($select=slug)";

  while (true) {
    const filter = encodeURIComponent(
      `belongs_to__application eq ${fleetId}`,
    );
    const path =
      `/device?$filter=${filter}` +
      `&$select=${select}` +
      `&$expand=${expand}` +
      `&$top=${pageSize}` +
      `&$skip=${skip}` +
      `&$orderby=device_name%20asc`;

    const page = await balenaFetch<PineList<BalenaApiDevice>>(
      path,
      config.token,
    );
    const rows = page.d ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const deviceType = expandSlug(row.is_of__device_type) || "unknown";
      const fleet = expandSlug(row.belongs_to__application) || config.fleetSlug;
      all.push({
        id: row.id,
        uuid: row.uuid,
        device_name: row.device_name,
        status: row.status || "unknown",
        overall_status: row.overall_status,
        is_online: Boolean(row.is_online),
        is_connected_to_vpn: row.is_connected_to_vpn,
        api_heartbeat_state: row.api_heartbeat_state,
        supervisor_version: row.supervisor_version || "",
        os_version: row.os_version || "",
        dashboard_url: `https://dashboard.balena-cloud.com/devices/${row.uuid}/summary`,
        fleet,
        device_type: deviceType,
        last_connectivity_event: row.last_connectivity_event,
        last_vpn_event: row.last_vpn_event,
        ip_address: row.ip_address,
        public_address: row.public_address,
        mac_address: row.mac_address,
        cpu_usage: row.cpu_usage,
        cpu_temp: row.cpu_temp,
        memory_usage: row.memory_usage,
        memory_total: row.memory_total,
        storage_usage: row.storage_usage,
        storage_total: row.storage_total,
        is_undervolted: row.is_undervolted,
        note: row.note,
      });
    }

    if (rows.length < pageSize) break;
    skip += pageSize;
  }

  return all;
}
