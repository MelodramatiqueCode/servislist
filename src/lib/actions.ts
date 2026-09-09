"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addTicketNote,
  createTicket,
  getDevice,
  updateTicketPriority,
  updateTicketStatus,
} from "./store";
import { hardwareLabel } from "./parse-device";
import type { TicketPriority, TicketStatus } from "./types";

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
