"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addTicketNote,
  createTicket,
  createVyjazd,
  deleteVyjazd,
  getDevice,
  updateTicketPriority,
  updateTicketStatus,
  updateVyjazd,
  updateVyjazdStatus,
} from "./store";
import { hardwareLabel } from "./parse-device";
import type {
  TicketPriority,
  TicketStatus,
  VyjazdStatus,
} from "./types";

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
  const deviceUuid = str(formData, "deviceUuid");
  const ticketId = str(formData, "ticketId");

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

  if (!title || !store) {
    throw new Error("Vyplň povinné polia: názov výjazdu a predajňu/zákazníka.");
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
  });

  revalidatePath("/vyjazdy");
  if (deviceUuid) revalidatePath(`/zariadenia/${deviceUuid}`);
  redirect(`/vyjazdy/${vyjazd.id}`);
}

export async function updateVyjazdAction(formData: FormData) {
  const id = str(formData, "id");
  if (!id) return;

  const title = str(formData, "title");
  const store = str(formData, "store");
  if (!title || !store) {
    throw new Error("Vyplň povinné polia: názov výjazdu a predajňu/zákazníka.");
  }

  await updateVyjazd(id, {
    title,
    store,
    address: str(formData, "address"),
    contactPhone: str(formData, "contactPhone"),
    technician: str(formData, "technician") || "Nepriradené",
    scheduledAt: str(formData, "scheduledAt"),
    status: vyjazdStatus(formData),
    priority: (str(formData, "priority") || "normalna") as TicketPriority,
    description: str(formData, "description"),
    result: str(formData, "result"),
    deviceUuid: str(formData, "deviceUuid"),
    ticketId: str(formData, "ticketId"),
  });

  revalidatePath("/vyjazdy");
  revalidatePath(`/vyjazdy/${id}`);
  redirect(`/vyjazdy/${id}?saved=1`);
}

export async function updateVyjazdStatusAction(formData: FormData) {
  const id = str(formData, "id");
  const status = vyjazdStatus(formData);
  if (!id) return;

  await updateVyjazdStatus(id, status);
  revalidatePath("/vyjazdy");
  revalidatePath(`/vyjazdy/${id}`);
}

export async function deleteVyjazdAction(formData: FormData) {
  const id = str(formData, "id");
  if (!id) return;

  await deleteVyjazd(id);
  revalidatePath("/vyjazdy");
  redirect("/vyjazdy");
}
