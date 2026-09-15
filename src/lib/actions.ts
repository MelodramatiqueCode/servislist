"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addTicketNote,
  createTicket,
  createVyjazd,
  deleteVyjazd,
  getDevice,
  mergeVyjazdy,
  refreshVyjazdRoute,
  setVyjazdStopDone,
  updateTicketPriority,
  updateTicketStatus,
  updateVyjazd,
  updateVyjazdStatus,
} from "./store";
import { hardwareLabel } from "./parse-device";
import {
  deleteDeviceConfigVariables,
  isBalenaConfigured,
  upsertDeviceConfigVariables,
} from "./balena";
import {
  COOLING_CONFIG_KEYS,
  coolingConfigEntries,
  coolingProfileForDeviceType,
} from "./cooling";
import type {
  TicketPriority,
  TicketStatus,
  VyjazdStatus,
  VyjazdStop,
} from "./types";
import { parseStopsJson } from "./vyjazd-stops";

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createTicketAction(formData: FormData) {
  const title = str(formData, "title");
  const description = str(formData, "description");
  let deviceType = str(formData, "deviceType");
  let deviceSerial = str(formData, "deviceSerial");
  let customerName = str(formData, "customerName");
  let customerPhone = str(formData, "customerPhone");
  const assignedTo = str(formData, "assignedTo");
  const priority = (str(formData, "priority") || "normalna") as TicketPriority;
  const deviceUuid = str(formData, "deviceUuid");

  if (deviceUuid) {
    const device = await getDevice(deviceUuid);
    if (device) {
      deviceType = deviceType || hardwareLabel(device.deviceType);
      deviceSerial = deviceSerial || device.uuid;
      customerName =
        customerName ||
        [device.code && `#${device.code}`, device.partner, device.city]
          .filter(Boolean)
          .join(" · ") ||
        device.name;
      customerPhone = customerPhone || device.phone;
    }
  }

  if (!title || !description || !deviceType || !customerName) {
    throw new Error(
      "Vyplň povinné polia: názov, popis, typ zariadenia a predajňa/zákazník.",
    );
  }

  const ticket = await createTicket({
    title,
    description,
    deviceType,
    deviceSerial,
    deviceUuid,
    customerName,
    customerPhone,
    assignedTo,
    priority,
  });

  revalidatePath("/");
  revalidatePath("/zariadenia");
  if (deviceUuid) revalidatePath(`/zariadenia/${deviceUuid}`);
  redirect(`/ticket/${ticket.id}`);
}

export async function updateStatusAction(formData: FormData) {
  const id = str(formData, "id");
  const status = str(formData, "status") as TicketStatus;
  if (!id || !status) return;

  await updateTicketStatus(id, status);
  revalidatePath("/");
  revalidatePath(`/ticket/${id}`);
}

export async function updatePriorityAction(formData: FormData) {
  const id = str(formData, "id");
  const priority = str(formData, "priority") as TicketPriority;
  if (!id || !priority) return;

  await updateTicketPriority(id, priority);
  revalidatePath("/");
  revalidatePath(`/ticket/${id}`);
}

export async function addNoteAction(formData: FormData) {
  const id = str(formData, "id");
  const text = str(formData, "text");
  const author = str(formData, "author") || "Servisák";
  if (!id || !text) return;

  await addTicketNote(id, text, author);
  revalidatePath("/");
  revalidatePath(`/ticket/${id}`);
}

const VYJAZD_STATUSES: VyjazdStatus[] = [
  "naplanovany",
  "prebieha",
  "hotovy",
  "zruseny",
];

function vyjazdStatus(formData: FormData): VyjazdStatus {
  const raw = str(formData, "status") as VyjazdStatus;
  return VYJAZD_STATUSES.includes(raw) ? raw : "naplanovany";
}

function parseStops(formData: FormData): VyjazdStop[] {
  const raw = str(formData, "stopsJson");
  if (!raw) return [];
  return parseStopsJson(raw);
}

async function enrichFromDevice(deviceUuid: string) {
  if (!deviceUuid) return null;
  return getDevice(deviceUuid);
}

export async function createVyjazdAction(formData: FormData) {
  const title = str(formData, "title");
  let store = str(formData, "store");
  let address = str(formData, "address");
  let contactPhone = str(formData, "contactPhone");
  const technician = str(formData, "technician");
  const scheduledAt = str(formData, "scheduledAt");
  const priority = (str(formData, "priority") || "normalna") as TicketPriority;
  const status = vyjazdStatus(formData);
  const description = str(formData, "description");
  let deviceUuid = str(formData, "deviceUuid");
  let ticketId = str(formData, "ticketId");
  const stops = parseStops(formData);

  if (stops.length > 0) {
    store = store || stops[0].store;
    address = address || stops[0].address || "";
    contactPhone = contactPhone || stops[0].contactPhone || "";
    deviceUuid = deviceUuid || stops[0].deviceUuid || "";
    ticketId = ticketId || stops[0].ticketId || "";
  }

  const device = await enrichFromDevice(deviceUuid);
  if (device) {
    store =
      store ||
      [device.code && `#${device.code}`, device.partner, device.city]
        .filter(Boolean)
        .join(" · ") ||
      device.name;
    address = address || device.address;
    contactPhone = contactPhone || device.phone;
  }

  if (!title || !(store || stops.some((s) => s.store))) {
    throw new Error("Vyplň povinné polia: názov výjazdu a aspoň jednu prevádzku.");
  }

  const vyjazd = await createVyjazd({
    title,
    store,
    address,
    contactPhone,
    technician,
    scheduledAt,
    status,
    priority,
    description,
    deviceUuid,
    ticketId,
    stops,
    originLabel: str(formData, "originLabel"),
    originAddress: str(formData, "originAddress"),
  });

  revalidatePath("/vyjazdy");
  if (deviceUuid) revalidatePath(`/zariadenia/${deviceUuid}`);
  for (const stop of stops) {
    if (stop.deviceUuid) revalidatePath(`/zariadenia/${stop.deviceUuid}`);
  }
  redirect(`/vyjazdy/${vyjazd.id}`);
}

export async function updateVyjazdAction(formData: FormData) {
  const id = str(formData, "id");
  if (!id) return;

  const title = str(formData, "title");
  const store = str(formData, "store");
  const stops = parseStops(formData);
  if (!title || !(store || stops.some((s) => s.store))) {
    throw new Error("Vyplň povinné polia: názov výjazdu a aspoň jednu prevádzku.");
  }

  await updateVyjazd(
    id,
    {
      title,
      store,
      address: str(formData, "address"),
      contactPhone: str(formData, "contactPhone"),
      technician: str(formData, "technician") || "Nepriradené",
      scheduledAt: str(formData, "scheduledAt"),
      priority: (str(formData, "priority") || "normalna") as TicketPriority,
      description: str(formData, "description"),
      result: str(formData, "result"),
      deviceUuid: str(formData, "deviceUuid"),
      ticketId: str(formData, "ticketId"),
      stops,
      originLabel: str(formData, "originLabel"),
      originAddress: str(formData, "originAddress"),
    },
    { syncStatusFromStops: true },
  );

  revalidatePath("/vyjazdy");
  revalidatePath(`/vyjazdy/${id}`);
  redirect(`/vyjazdy/${id}?saved=1`);
}

export async function recalcVyjazdRouteAction(formData: FormData) {
  const id = str(formData, "id");
  if (!id) return;

  await refreshVyjazdRoute(id);
  revalidatePath("/vyjazdy");
  revalidatePath(`/vyjazdy/${id}`);
  redirect(`/vyjazdy/${id}?routed=1`);
}

export async function updateVyjazdStatusAction(formData: FormData) {
  const id = str(formData, "id");
  const status = vyjazdStatus(formData);
  if (!id) return;

  await updateVyjazdStatus(id, status);
  revalidatePath("/vyjazdy");
  revalidatePath(`/vyjazdy/${id}`);
}

export async function toggleVyjazdStopDoneAction(formData: FormData) {
  const id = str(formData, "id");
  const stopId = str(formData, "stopId");
  const done = str(formData, "done") === "1";
  if (!id || !stopId) return;

  const vyjazd = await setVyjazdStopDone(id, stopId, done);
  revalidatePath("/vyjazdy");
  revalidatePath(`/vyjazdy/${id}`);
  if (vyjazd) {
    for (const stop of vyjazd.stops) {
      if (stop.deviceUuid) revalidatePath(`/zariadenia/${stop.deviceUuid}`);
    }
  }
}

export async function mergeVyjazdAction(formData: FormData) {
  const primaryId = str(formData, "primaryId") || str(formData, "id");
  const secondaryId = str(formData, "secondaryId");
  if (!primaryId || !secondaryId) {
    throw new Error("Vyber výjazd, ktorý sa má spojiť.");
  }

  const merged = await mergeVyjazdy(primaryId, secondaryId);
  revalidatePath("/vyjazdy");
  revalidatePath(`/vyjazdy/${primaryId}`);
  revalidatePath(`/vyjazdy/${secondaryId}`);
  for (const stop of merged.stops) {
    if (stop.deviceUuid) revalidatePath(`/zariadenia/${stop.deviceUuid}`);
  }
  redirect(`/vyjazdy/${primaryId}?merged=1`);
}

export async function deleteVyjazdAction(formData: FormData) {
  const id = str(formData, "id");
  if (!id) return;

  await deleteVyjazd(id);
  revalidatePath("/vyjazdy");
  redirect("/vyjazdy");
}

export type CoolingActionState = {
  ok?: boolean;
  error?: string;
  mode?: "on" | "off";
};

export async function setCoolingModeAction(
  _prev: CoolingActionState,
  formData: FormData,
): Promise<CoolingActionState> {
  const uuid = str(formData, "uuid");
  const intent = str(formData, "intent");

  if (!uuid || (intent !== "on" && intent !== "off")) {
    return { ok: false, error: "Neplatná požiadavka na chladiaci režim." };
  }

  if (!isBalenaConfigured()) {
    return { ok: false, error: "Chýba BALENA_API_TOKEN." };
  }

  const device = await getDevice(uuid);
  if (!device) {
    return { ok: false, error: "Zariadenie sa nenašlo." };
  }

  const profile = coolingProfileForDeviceType(device.deviceType);
  if (!profile) {
    return {
      ok: false,
      error: "Chladiaci režim je len pre Raspberry Pi 3 a Pi 4.",
    };
  }

  if (!device.isOnline) {
    return {
      ok: false,
      error: "Zariadenie je offline — chladiaci režim sa dá zapnúť až keď je online.",
    };
  }

  try {
    if (intent === "on") {
      await upsertDeviceConfigVariables(
        device.balenaId,
        coolingConfigEntries(profile),
      );
    } else {
      await deleteDeviceConfigVariables(device.balenaId, [...COOLING_CONFIG_KEYS]);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Balena API požiadavka zlyhala.";
    return { ok: false, error: message };
  }

  revalidatePath(`/zariadenia/${uuid}`);
  revalidatePath("/zariadenia");
  return { ok: true, mode: intent };
}
