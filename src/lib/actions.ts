"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addTicketNote,
  createTicket,
  createVyjazd,
  deleteVyjazd,
  getDevice,
  getTicket,
  mergeVyjazdy,
  refreshVyjazdRoute,
  setVyjazdStopDone,
  updateTicketPriority,
  updateTicketStatus,
  updateVyjazd,
  updateVyjazdStatus,
  confirmPrevadzkaProposal,
  createPrevadzkaWithJob,
  linkDeviceToPrevadzka,
  rejectPrevadzkaProposal,
} from "./store";
import {
  addManualVykaz,
  resolveProfileSuggestion,
  updatePrevadzkaProfile,
} from "./prevadzka-store";
import {
  hydrateOpeningHours,
  hydrateProfile,
  parseJobType,
} from "./prevadzka-profile";
import {
  addMaterialItem,
  deleteMaterialItem,
  updateMaterialItem,
} from "./material-store";
import { parseMaterialList, parseMaterialStatus } from "./material";
import { parseVykazType } from "./vykaz-prace";
import { isTicketArchived } from "./ticket-archive";
import {
  applyDeviceToTicketFields,
  normalizePriority,
  validateCreateTicket,
} from "./ticket-input";
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
  let fields = {
    title: str(formData, "title"),
    description: str(formData, "description"),
    deviceType: str(formData, "deviceType"),
    deviceSerial: str(formData, "deviceSerial"),
    deviceUuid: str(formData, "deviceUuid"),
    customerName: str(formData, "customerName"),
    customerPhone: str(formData, "customerPhone"),
    assignedTo: str(formData, "assignedTo"),
    priority: normalizePriority(str(formData, "priority")),
    clientRef: "",
  };

  if (fields.deviceUuid) {
    const device = await getDevice(fields.deviceUuid);
    if (device) {
      fields = {
        ...fields,
        ...applyDeviceToTicketFields(device, fields),
        priority: fields.priority,
        clientRef: "",
      };
    }
  }

  const errors = validateCreateTicket(fields);
  if (errors) {
    throw new Error(
      "Vyplň povinné polia: názov, popis, typ zariadenia a predajňa/zákazník.",
    );
  }

  const ticket = await createTicket({
    title: fields.title ?? "",
    description: fields.description ?? "",
    deviceType: fields.deviceType ?? "",
    deviceSerial: fields.deviceSerial ?? "",
    deviceUuid: fields.deviceUuid ?? "",
    customerName: fields.customerName ?? "",
    customerPhone: fields.customerPhone ?? "",
    assignedTo: fields.assignedTo ?? "",
    priority: fields.priority,
  });

  revalidatePath("/");
  revalidatePath("/zariadenia");
  if (fields.deviceUuid) revalidatePath(`/zariadenia/${fields.deviceUuid}`);
  redirect(`/ticket/${ticket.id}`);
}

async function rejectIfArchived(id: string) {
  const ticket = await getTicket(id);
  if (ticket && isTicketArchived(ticket)) {
    throw new Error("Archivovaný ticket je len na čítanie.");
  }
}

export async function updateStatusAction(formData: FormData) {
  const id = str(formData, "id");
  const status = str(formData, "status") as TicketStatus;
  if (!id || !status) return;
  await rejectIfArchived(id);

  await updateTicketStatus(id, status);
  revalidatePath("/");
  revalidatePath(`/ticket/${id}`);
}

export async function updatePriorityAction(formData: FormData) {
  const id = str(formData, "id");
  const priority = str(formData, "priority") as TicketPriority;
  if (!id || !priority) return;
  await rejectIfArchived(id);

  await updateTicketPriority(id, priority);
  revalidatePath("/");
  revalidatePath(`/ticket/${id}`);
}

export async function addNoteAction(formData: FormData) {
  const id = str(formData, "id");
  const text = str(formData, "text");
  const author = str(formData, "author") || "Servisák";
  if (!id || !text) return;
  await rejectIfArchived(id);

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

function parseJsonField(formData: FormData, key: string): unknown {
  const raw = str(formData, key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function createPrevadzkaAction(formData: FormData) {
  const jobType = parseJobType(str(formData, "jobType"));
  if (!jobType) {
    throw new Error("Vyber typ zákazky.");
  }
  const hours = parseJsonField(formData, "openingHoursJson");
  const profile = parseJsonField(formData, "profileJson");
  const material = parseMaterialList(parseJsonField(formData, "materialJson"));
  const result = await createPrevadzkaWithJob({
    name: str(formData, "name"),
    chain: str(formData, "chain"),
    code: str(formData, "code"),
    storeType: str(formData, "storeType"),
    city: str(formData, "city"),
    address: str(formData, "address"),
    gpsLat: str(formData, "gpsLat"),
    gpsLng: str(formData, "gpsLng"),
    phone: str(formData, "phone"),
    openingHours: hours ? hydrateOpeningHours(hours) : undefined,
    profile: profile ? hydrateProfile(profile) : undefined,
    jobType,
    status: "active",
    author: str(formData, "author") || "Servis",
    description: str(formData, "description"),
    material,
    assignedTo: str(formData, "assignedTo"),
  });
  revalidatePath("/prevadzky");
  revalidatePath("/");
  redirect(`/prevadzky/${result.store.id}`);
}

export async function updatePrevadzkaAction(formData: FormData) {
  const id = str(formData, "id");
  if (!id) return;
  const hours = parseJsonField(formData, "openingHoursJson");
  const profileRaw = parseJsonField(formData, "profileJson");
  const extra: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("profile_")) {
      extra[key.slice("profile_".length)] = String(value);
    }
  }
  const profile =
    profileRaw || Object.keys(extra).length
      ? hydrateProfile({
          ...(profileRaw && typeof profileRaw === "object" ? profileRaw : {}),
          ...extra,
        })
      : undefined;
  await updatePrevadzkaProfile(
    id,
    {
      name: str(formData, "name") || undefined,
      chain: str(formData, "chain") || undefined,
      code: str(formData, "code") || undefined,
      storeType: str(formData, "storeType") || undefined,
      city: str(formData, "city") || undefined,
      address: str(formData, "address") || undefined,
      gpsLat: str(formData, "gpsLat") || undefined,
      gpsLng: str(formData, "gpsLng") || undefined,
      phone: str(formData, "phone") || undefined,
      openingHours: hours ? hydrateOpeningHours(hours) : undefined,
      profile,
    },
    str(formData, "author") || "Servis",
  );
  revalidatePath("/prevadzky");
  revalidatePath(`/prevadzky/${id}`);
  redirect(`/prevadzky/${id}`);
}

export async function resolveSuggestionAction(formData: FormData) {
  const id = str(formData, "suggestionId");
  const storeId = str(formData, "prevadzkaId");
  const action = str(formData, "action") === "rejected" ? "rejected" : "accepted";
  if (!id) return;
  await resolveProfileSuggestion(id, action, str(formData, "author") || "Martin");
  revalidatePath("/");
  revalidatePath("/prevadzky");
  if (storeId) revalidatePath(`/prevadzky/${storeId}`);
}

export async function confirmPrevadzkaAction(formData: FormData) {
  const id = str(formData, "id");
  if (!id) return;
  await confirmPrevadzkaProposal(id, str(formData, "author") || "Martin");
  revalidatePath("/");
  revalidatePath("/prevadzky");
  revalidatePath(`/prevadzky/${id}`);
}

export async function rejectPrevadzkaAction(formData: FormData) {
  const id = str(formData, "id");
  if (!id) return;
  await rejectPrevadzkaProposal(id, str(formData, "author") || "Martin");
  revalidatePath("/prevadzky");
  revalidatePath(`/prevadzky/${id}`);
  redirect("/prevadzky");
}

export async function addVykazAction(formData: FormData) {
  const prevadzkaId = str(formData, "prevadzkaId");
  const description = str(formData, "description");
  if (!prevadzkaId || !description) return;
  const durationRaw = str(formData, "durationMin");
  await addManualVykaz({
    prevadzkaId,
    date: str(formData, "date") || new Date().toISOString(),
    type: parseVykazType(str(formData, "type")) ?? "servis",
    author: str(formData, "author") || "Servis",
    description,
    durationMin: durationRaw ? Number(durationRaw) : null,
    ticketId: str(formData, "ticketId"),
    vyjazdId: str(formData, "vyjazdId"),
  });
  revalidatePath(`/prevadzky/${prevadzkaId}`);
}

export async function linkDeviceAction(formData: FormData) {
  const prevadzkaId = str(formData, "prevadzkaId");
  const deviceUuid = str(formData, "deviceUuid");
  if (!prevadzkaId || !deviceUuid) return;
  await linkDeviceToPrevadzka(
    prevadzkaId,
    deviceUuid,
    str(formData, "author") || "Servis",
  );
  revalidatePath("/prevadzky");
  revalidatePath(`/prevadzky/${prevadzkaId}`);
  revalidatePath(`/zariadenia/${deviceUuid}`);
}

export async function addMaterialAction(formData: FormData) {
  const ticketId = str(formData, "ticketId");
  const prevadzkaId = str(formData, "prevadzkaId");
  const item = str(formData, "item");
  if (!ticketId || !prevadzkaId || !item) return;
  await addMaterialItem({
    ticketId,
    prevadzkaId,
    item,
    quantity: Number(str(formData, "quantity") || 1),
    unit: str(formData, "unit") || "ks",
    unitPrice: str(formData, "unitPrice")
      ? Number(str(formData, "unitPrice"))
      : null,
    note: str(formData, "note"),
    status: parseMaterialStatus(str(formData, "status")) ?? "planovane",
  });
  revalidatePath(`/ticket/${ticketId}`);
  if (prevadzkaId) revalidatePath(`/prevadzky/${prevadzkaId}`);
}

export async function updateMaterialAction(formData: FormData) {
  const id = str(formData, "id");
  const ticketId = str(formData, "ticketId");
  const prevadzkaId = str(formData, "prevadzkaId");
  if (!id) return;
  await updateMaterialItem(id, {
    item: str(formData, "item") || undefined,
    quantity: str(formData, "quantity")
      ? Number(str(formData, "quantity"))
      : undefined,
    unit: str(formData, "unit") || undefined,
    unitPrice: str(formData, "unitPrice")
      ? Number(str(formData, "unitPrice"))
      : undefined,
    note: str(formData, "note"),
    status: parseMaterialStatus(str(formData, "status")) ?? undefined,
  });
  if (ticketId) revalidatePath(`/ticket/${ticketId}`);
  if (prevadzkaId) revalidatePath(`/prevadzky/${prevadzkaId}`);
}

export async function deleteMaterialAction(formData: FormData) {
  const id = str(formData, "id");
  const ticketId = str(formData, "ticketId");
  const prevadzkaId = str(formData, "prevadzkaId");
  if (!id) return;
  await deleteMaterialItem(id);
  if (ticketId) revalidatePath(`/ticket/${ticketId}`);
  if (prevadzkaId) revalidatePath(`/prevadzky/${prevadzkaId}`);
}

export async function createPolozkaAction(formData: FormData) {
  const nazov = str(formData, "nazov");
  const kod = str(formData, "kod");
  if (!nazov || !kod) return;
  const { createPolozka } = await import("./sklad-store");
  await createPolozka({
    nazov,
    kod,
    kategoria: str(formData, "kategoria"),
    jednotka: str(formData, "jednotka"),
    minStav: Number(str(formData, "minStav") || 0),
    poznamka: str(formData, "poznamka"),
  });
  revalidatePath("/sklad");
  redirect("/sklad");
}

export async function createPrijemAction(formData: FormData) {
  const { createDodaciList } = await import("./sklad-store");
  const { parseKategoria, parseJednotka } = await import("./sklad");
  let riadky: Array<Record<string, unknown>> = [];
  try {
    const parsed = JSON.parse(str(formData, "riadkyJson") || "[]");
    if (Array.isArray(parsed)) riadky = parsed;
  } catch {
    riadky = [];
  }
  const file = formData.get("subor");
  let upload: { name: string; mime: string; bytes: Buffer } | undefined;
  if (file instanceof File && file.size > 0) {
    upload = {
      name: file.name,
      mime: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    };
  }
  await createDodaciList({
    dodavatel: str(formData, "dodavatel"),
    cisloDl: str(formData, "cisloDl"),
    datum: str(formData, "datum") || new Date().toISOString(),
    vytvoril: str(formData, "vytvoril") || "Martin",
    zdroj: "web",
    riadky: riadky.map((row) => ({
      polozkaId: String(row.polozkaId ?? ""),
      kod: String(row.kod ?? ""),
      nazov: String(row.nazov ?? ""),
      kategoria: parseKategoria(String(row.kategoria ?? "")) ?? "Iné",
      jednotka: parseJednotka(String(row.jednotka ?? "ks")),
      minStav: Number(row.minStav ?? 0) || 0,
      mnozstvo: Number(row.mnozstvo ?? 0) || 0,
      poznamka: String(row.poznamka ?? ""),
      nova: Boolean(row.nova),
    })),
    file: upload,
  });
  revalidatePath("/sklad");
  revalidatePath("/");
  redirect("/sklad");
}

export async function resolveDlAction(formData: FormData) {
  const { resolveDodaciList } = await import("./sklad-store");
  const id = str(formData, "id");
  if (!id) return;
  const action = str(formData, "action") === "rejected" ? "rejected" : "accepted";
  await resolveDodaciList(id, action, str(formData, "author") || "Martin");
  revalidatePath("/");
  revalidatePath("/sklad");
  revalidatePath(`/sklad/prijem/${id}`);
}

export async function korekciaAction(formData: FormData) {
  const { addPohyb } = await import("./sklad-store");
  const polozkaId = str(formData, "polozkaId");
  const qty = Number(str(formData, "mnozstvo") || 0);
  if (!polozkaId || !qty) return;
  await addPohyb({
    polozkaId,
    typ: "korekcia",
    mnozstvo: qty,
    kto: str(formData, "kto") || "Martin",
  });
  revalidatePath("/sklad");
  revalidatePath(`/sklad/polozky/${polozkaId}`);
  revalidatePath("/sklad/pohyby");
}

export async function kontrolaLoginAction(formData: FormData) {
  const { attemptKontrolaLogin } = await import("./kontrola-session");
  const result = await attemptKontrolaLogin(str(formData, "password"));
  if (result.ok) {
    revalidatePath("/", "layout");
    redirect("/kontrola");
  }
  if (result.reason === "limit") redirect("/kontrola?e=limit");
  if (result.reason === "unset") redirect("/kontrola");
  redirect("/kontrola?e=1");
}

export async function kontrolaLogoutAction() {
  const { clearKontrolaSession } = await import("./kontrola-session");
  await clearKontrolaSession();
  revalidatePath("/", "layout");
  redirect("/kontrola");
}

export async function resolveNavrhAction(formData: FormData) {
  const { requireKontrolaSession } = await import("./kontrola-session");
  await requireKontrolaSession();
  const { getNavrh, resolveNavrh } = await import("./kontrola-store");
  const id = str(formData, "id");
  if (!id) return;
  const action = str(formData, "action") === "rejected" ? "rejected" : "accepted";
  const author = str(formData, "author") || "Martin";
  const current = await getNavrh(id);
  if (!current || current.stav !== "cakajuci") return;
  if (action === "accepted") {
    if (current.kind === "ticket") {
      const p = current.payload;
      await createTicket(
        {
          title: String(p.title ?? "Návrh ticketu"),
          description: String(p.description ?? ""),
          deviceType: String(p.deviceType ?? ""),
          deviceSerial: String(p.deviceSerial ?? ""),
          deviceUuid: String(p.deviceUuid ?? ""),
          customerName: String(p.customerName ?? ""),
          customerPhone: String(p.customerPhone ?? ""),
          assignedTo: String(p.assignedTo ?? author),
          priority: normalizePriority(String(p.priority ?? "normalna")),
          clientRef: String(p.clientRef ?? "") || undefined,
        },
        { author, note: String(p.note ?? "Schválený návrh bota.") },
      );
    } else {
      const p = current.payload;
      await createVyjazd({
        title: String(p.title ?? "Návrh výjazdu"),
        store: String(p.store ?? ""),
        address: String(p.address ?? ""),
        contactPhone: String(p.contactPhone ?? ""),
        technician: String(p.technician ?? ""),
        scheduledAt: String(p.scheduledAt ?? ""),
        ticketId: String(p.ticketId ?? ""),
        deviceUuid: String(p.deviceUuid ?? ""),
        description: String(p.description ?? ""),
      });
    }
  }
  await resolveNavrh(id, action, author);
  revalidatePath("/");
  revalidatePath("/kontrola");
  revalidatePath("/vyjazdy");
}
