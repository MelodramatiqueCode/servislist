"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addTicketNote,
  createTicket,
  updateTicketPriority,
  updateTicketStatus,
} from "./store";
import type { TicketPriority, TicketStatus } from "./types";

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createTicketAction(formData: FormData) {
  const title = str(formData, "title");
  const description = str(formData, "description");
  const deviceType = str(formData, "deviceType");
  const deviceSerial = str(formData, "deviceSerial");
  const customerName = str(formData, "customerName");
  const customerPhone = str(formData, "customerPhone");
  const assignedTo = str(formData, "assignedTo");
  const priority = (str(formData, "priority") || "normalna") as TicketPriority;

  if (!title || !description || !deviceType || !customerName) {
    throw new Error("Vyplň povinné polia: názov, popis, typ zariadenia a zákazník.");
  }

  const ticket = await createTicket({
    title,
    description,
    deviceType,
    deviceSerial,
    customerName,
    customerPhone,
    assignedTo,
    priority,
  });

  revalidatePath("/");
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
