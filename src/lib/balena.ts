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
  is_online: boolean;
  supervisor_version: string | null;
  os_version: string | null;
  last_connectivity_event: string | null;
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
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Balena API ${res.status}: ${body.slice(0, 200) || res.statusText}`,
    );
  }

  return res.json() as Promise<T>;
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
    "is_online",
    "supervisor_version",
    "os_version",
    "last_connectivity_event",
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
        is_online: Boolean(row.is_online),
        supervisor_version: row.supervisor_version || "",
        os_version: row.os_version || "",
        dashboard_url: `https://dashboard.balena-cloud.com/devices/${row.uuid}/summary`,
        fleet,
        device_type: deviceType,
      });
    }

    if (rows.length < pageSize) break;
    skip += pageSize;
  }

  return all;
}
