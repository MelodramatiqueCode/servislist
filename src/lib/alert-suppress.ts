import type { AlertType } from "./alerts";
import type { DeviceEvent, ServiceDevice, Ticket } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Balena default názvy (adjective-noun, malé písmená ASCII, bez čísla) a
 * Demo / Demo2. Zámerne konzervatívne — reálne predajne majú číslo alebo
 * sieť v názve (napr. „STB-bory“, „JGA-Šintava“ sem nespadnú).
 */
const BALENA_DEFAULT_NAME = /^[a-z]+-[a-z]+$/;
const DEMO_NAME = /^demo\d*$/i;

export function isTestDeviceName(name: string) {
  const value = (name ?? "").trim();
  if (!value) return false;
  return BALENA_DEFAULT_NAME.test(value) || DEMO_NAME.test(value);
}

/** `ALERT_IGNORE_DEVICES` — čiarkou / novým riadkom oddelené UUID, názvy alebo kódy. */
export function parseIgnoreList(raw: string | undefined | null): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/[,\n;]/)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function isIgnoredDevice(device: ServiceDevice, ignoreList: string[]) {
  if (ignoreList.length === 0) return false;
  const uuid = (device.uuid ?? "").trim().toLowerCase();
  const keys = [uuid, device.name, device.code]
    .map((v) => (v ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (keys.some((key) => ignoreList.includes(key))) return true;
  // skrátené UUID (aspoň 7 znakov), ako ho ukazuje Balena dashboard
  return Boolean(uuid) && ignoreList.some((item) => item.length >= 7 && uuid.startsWith(item));
}

/** Testovacie zariadenie = nikdy žiadne auto tickety. */
export function isTestDevice(device: ServiceDevice, ignoreList: string[] = []) {
  return isTestDeviceName(device.name) || isIgnoredDevice(device, ignoreList);
}

/** Počet dní offline podľa Balena `last_connectivity_event`; null ak online / neznáme. */
export function offlineDays(device: ServiceDevice, now: Date): number | null {
  if (device.isOnline) return null;
  const raw = device.lastConnectivityEvent;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (now.getTime() - t) / DAY_MS);
}

export function isLongOffline(device: ServiceDevice, now: Date, thresholdDays: number) {
  const days = offlineDays(device, now);
  return days != null && days > thresholdDays;
}

const RECOVERY_OUTCOMES = new Set(["short", "recovered", "outside_hours"]);

/**
 * Archivovaný auto ticket = incident je vybavený. Nový ticket sa smie vytvoriť
 * len ak zariadenie medzitým prokázateľne obnovilo stav (Balena konektivita po
 * vytvorení ticketu, alebo ukončená epizóda v histórii zariadenia) a znovu padlo.
 */
export function findHandledArchivedTicket(
  tickets: Ticket[],
  device: ServiceDevice,
  type: AlertType,
  events: DeviceEvent[],
): Ticket | undefined {
  const archived = tickets
    .filter(
      (t) =>
        t.source === "auto" &&
        Boolean(t.archivedAt) &&
        t.deviceUuid === device.uuid &&
        t.alertType === type,
    )
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  const latest = archived[0];
  if (!latest) return undefined;
  const createdMs = new Date(latest.createdAt).getTime();
  if (Number.isNaN(createdMs)) return undefined;

  if (type === "offline" && device.lastConnectivityEvent) {
    const lastConn = new Date(device.lastConnectivityEvent).getTime();
    if (!Number.isNaN(lastConn) && lastConn > createdMs) return undefined;
  }

  const recoveredSince = events.some((event) => {
    if (event.deviceUuid !== device.uuid || event.alertType !== type) return false;
    if (!event.endedAt || !RECOVERY_OUTCOMES.has(event.outcome)) return false;
    const ended = new Date(event.endedAt).getTime();
    return !Number.isNaN(ended) && ended > createdMs;
  });
  if (recoveredSince) return undefined;
  return latest;
}
