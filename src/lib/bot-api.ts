import { revalidatePath } from "next/cache";
import { serializeDevice, serializePrevadzkaProfile, serializeTicket, serializeVyjazd, serializeVyjazdSummary } from "./api-serialize";
import { ApiError, asRecord, queryString } from "./api-http";
import type { BotActor } from "./bot-auth";
import {
  addTicketNote,
  createTicket,
  getDevice,
  getTicketByClientRef,
  getTicketByRef,
  getVyjazdByRef,
  linkTicketToVyjazd,
  createPrevadzkaWithJob,
  devicesForPrevadzka,
  getPrevadzkaProfile,
  listDevices,
  listPrevadzkaProfiles,
  listTickets,
  listVyjazdy,
  updateTicketPriority,
  updateTicketStatus,
} from "./store";
import {
  addManualVykaz,
  createProfileSuggestion,
  listMergedVykaz,
  listPrevadzkaDeviceUuids,
} from "./prevadzka-store";
import { hydrateOpeningHours, hydrateProfile, parseJobType } from "./prevadzka-profile";
import { listMaterial, addMaterialItem, updateMaterialItem, deleteMaterialItem, getMaterialItem, serializeMaterial } from "./material-store";
import { parseMaterialList, parseMaterialStatus } from "./material";
import { parseVykazType } from "./vykaz-prace";
import { loadPrevadzkaDetail, serializeVykaz } from "./prevadzka-view";
import { findDevicesForPrevadzka } from "./prevadzky";
import {
  applyDeviceToTicketFields,
  collectTicketCreateFields,
  normalizePriority,
  parseTicketStatus,
  TICKET_PRIORITIES,
  validateCreateTicket,
} from "./ticket-input";
import { parseArchivedQuery } from "./ticket-archive";
import type { Ticket, TicketSource, VyjazdStatus } from "./types";
import { VYJAZD_STATUS_LABELS } from "./types";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // testy a skripty mimo Next.js request kontextu
  }
}

function revalidateTicketPaths(ticket: Ticket) {
  safeRevalidate("/");
  safeRevalidate(`/ticket/${ticket.id}`);
  if (ticket.deviceUuid) {
    safeRevalidate(`/zariadenia/${ticket.deviceUuid}`);
  }
}

function revalidateVyjazdPaths(vyjazdId: string) {
  safeRevalidate("/vyjazdy");
  safeRevalidate(`/vyjazdy/${vyjazdId}`);
}

async function resolveTicketOrThrow(ref: string) {
  const ticket = await getTicketByRef(ref);
  if (!ticket) {
    throw new ApiError(404, "not_found", `Ticket „${ref}“ sa nenašiel.`);
  }
  return ticket;
}

async function resolveVyjazdOrThrow(ref: string) {
  const vyjazd = await getVyjazdByRef(ref);
  if (!vyjazd) {
    throw new ApiError(404, "not_found", `Výjazd „${ref}“ sa nenašiel.`);
  }
  return vyjazd;
}

async function ticketPayload(ticket: Ticket) {
  const [vyjazdy, material] = await Promise.all([
    listVyjazdy({ ticketId: ticket.id }),
    listMaterial({ ticketId: ticket.id }),
  ]);
  return {
    ticket: serializeTicket(ticket),
    vyjazdy: vyjazdy.map(serializeVyjazdSummary),
    material: material.map(serializeMaterial),
  };
}

export async function botListTickets(url: URL) {
  const statusRaw = queryString(url, "status") || "vsetky";
  const status =
    statusRaw === "aktivne" ||
    statusRaw === "vsetky" ||
    parseTicketStatus(statusRaw)
      ? (statusRaw as "vsetky" | "aktivne" | NonNullable<
          ReturnType<typeof parseTicketStatus>
        >)
      : null;
  if (!status) {
    throw new ApiError(
      400,
      "validation_error",
      "Neplatný status. Použi otvorene, v_rieseni, caka_diely, hotove, aktivne alebo vsetky.",
    );
  }

  const sourceRaw = queryString(url, "source") || "vsetky";
  if (sourceRaw !== "vsetky" && sourceRaw !== "manual" && sourceRaw !== "auto") {
    throw new ApiError(
      400,
      "validation_error",
      "Neplatný source. Použi manual, auto alebo vsetky.",
    );
  }

  const dateFieldRaw = queryString(url, "dateField", "poleDatumu");
  const dateField =
    dateFieldRaw === "createdAt" || dateFieldRaw === "vytvorene"
      ? "createdAt"
      : "updatedAt";

  const archived = parseArchivedQuery(
    queryString(url, "archiv", "archived", "archive"),
  );

  const tickets = await listTickets({
    status,
    source: sourceRaw as TicketSource | "vsetky",
    q: queryString(url, "q", "hladaj"),
    deviceUuid: queryString(url, "device", "deviceUuid", "zariadenie"),
    prevadzka: queryString(url, "prevadzka", "store"),
    from: queryString(url, "od", "from"),
    to: queryString(url, "do", "to"),
    dateField,
    archived,
  });

  return {
    count: tickets.length,
    archived,
    tickets: tickets.map(serializeTicket),
  };
}

export async function botGetTicket(ref: string) {
  const ticket = await resolveTicketOrThrow(ref);
  return ticketPayload(ticket);
}

export async function botCreateTicket(
  raw: unknown,
  actor: BotActor,
  idempotencyKey?: string,
) {
  const body = asRecord(raw);
  let fields = collectTicketCreateFields({
    ...body,
    clientRef: body.clientRef ?? body.client_ref ?? idempotencyKey,
  });

  if (!fields.deviceUuid && fields.deviceSerial) {
    const bySerial = await getDevice(fields.deviceSerial);
    if (bySerial) fields.deviceUuid = bySerial.uuid;
  }

  if (fields.deviceUuid) {
    const device = await getDevice(fields.deviceUuid);
    if (!device) {
      throw new ApiError(
        400,
        "validation_error",
        "Zariadenie s týmto UUID sa nenašlo.",
        { deviceUuid: "Neznáme zariadenie." },
      );
    }
    fields = {
      ...fields,
      ...applyDeviceToTicketFields(device, fields),
    };
  } else {
    const prevadzka = String(body.prevadzka ?? "").trim();
    if (prevadzka) {
      const matches = findDevicesForPrevadzka(await listDevices(), prevadzka);
      if (matches.length === 1) {
        fields = {
          ...fields,
          ...applyDeviceToTicketFields(matches[0], fields),
        };
      } else if (matches.length > 1 && !fields.customerName) {
        fields.customerName = prevadzka;
      }
    }
  }

  const errors = validateCreateTicket(fields);
  if (errors) {
    throw new ApiError(
      400,
      "validation_error",
      "Neplatné údaje ticketu.",
      errors,
    );
  }

  const clientRef = fields.clientRef?.trim() || "";
  if (clientRef) {
    const existing = await getTicketByClientRef(clientRef);
    if (existing) {
      return { ...(await ticketPayload(existing)), created: false, idempotent: true };
    }
  }

  const extraNote = String(body.note ?? body.poznamka ?? "").trim();
  const { wantsPendingNavrh } = await import("./kontrola");
  if (wantsPendingNavrh(body)) {
    const { createNavrh } = await import("./kontrola-store");
    const navrh = await createNavrh({
      kind: "ticket",
      payload: {
        title: fields.title,
        description: fields.description,
        deviceType: fields.deviceType,
        deviceSerial: fields.deviceSerial,
        deviceUuid: fields.deviceUuid,
        customerName: fields.customerName,
        customerPhone: fields.customerPhone,
        assignedTo: fields.assignedTo,
        priority: fields.priority,
        clientRef,
        note: extraNote,
      },
      summary: `Návrh ticketu: ${fields.customerName || fields.title}`,
      actorId: actor.id,
      actorName: actor.name,
    });
    safeRevalidate("/");
    safeRevalidate("/kontrola");
    return { pending: true, created: false, navrh };
  }
  const ticket = await createTicket(
    {
      title: fields.title!,
      description: fields.description!,
      deviceType: fields.deviceType!,
      deviceSerial: fields.deviceSerial ?? "",
      deviceUuid: fields.deviceUuid,
      customerName: fields.customerName!,
      customerPhone: fields.customerPhone ?? "",
      assignedTo: fields.assignedTo ?? "",
      priority: fields.priority ?? "normalna",
      clientRef,
    },
    {
      author: actor.name,
      note: extraNote || undefined,
    },
  );

  revalidateTicketPaths(ticket);
  return { ...(await ticketPayload(ticket)), created: true, idempotent: false };
}

export async function botAddNote(
  ref: string,
  raw: unknown,
  actor: BotActor,
  idempotencyKey?: string,
) {
  const body = asRecord(raw);
  const text = String(body.text ?? body.poznamka ?? "").trim();
  if (!text) {
    throw new ApiError(400, "validation_error", "Chýba text poznámky.", {
      text: "Vyplň text servisného záznamu.",
    });
  }
  const ticket = await resolveTicketOrThrow(ref);
  const clientRef = String(body.clientRef ?? body.client_ref ?? idempotencyKey ?? "").trim();
  const before = clientRef
    ? ticket.notes.some((n) => n.clientRef === clientRef)
    : false;
  const updated = await addTicketNote(ticket.id, text, actor.name, {
    clientRef,
  });
  if (!updated) {
    throw new ApiError(404, "not_found", `Ticket „${ref}“ sa nenašiel.`);
  }
  revalidateTicketPaths(updated);
  return {
    ...(await ticketPayload(updated)),
    created: !before,
    idempotent: before,
  };
}

export async function botChangeStatus(
  ref: string,
  raw: unknown,
  actor: BotActor,
) {
  const body = asRecord(raw);
  const status = parseTicketStatus(body.status);
  if (!status) {
    throw new ApiError(
      400,
      "validation_error",
      "Neplatný status. Použi otvorene, v_rieseni, caka_diely alebo hotove.",
      { status: "Neznámy stav." },
    );
  }
  const ticket = await resolveTicketOrThrow(ref);
  const changed = ticket.status !== status;
  const note = String(body.note ?? body.poznamka ?? "").trim();
  const updated = await updateTicketStatus(ticket.id, status, {
    author: actor.name,
    note: note || undefined,
  });
  if (!updated) {
    throw new ApiError(404, "not_found", `Ticket „${ref}“ sa nenašiel.`);
  }
  revalidateTicketPaths(updated);
  return { ...(await ticketPayload(updated)), changed };
}

export async function botCloseTicket(
  ref: string,
  raw: unknown,
  actor: BotActor,
) {
  const body = raw && typeof raw === "object" ? asRecord(raw) : {};
  return botChangeStatus(
    ref,
    { ...body, status: "hotove" },
    actor,
  );
}

export async function botReopenTicket(
  ref: string,
  raw: unknown,
  actor: BotActor,
) {
  const body = raw && typeof raw === "object" ? asRecord(raw) : {};
  const requested = parseTicketStatus(body.status);
  return botChangeStatus(
    ref,
    { ...body, status: requested && requested !== "hotove" ? requested : "otvorene" },
    actor,
  );
}

export async function botPatchTicket(
  ref: string,
  raw: unknown,
  actor: BotActor,
) {
  const body = asRecord(raw);
  let ticket = await resolveTicketOrThrow(ref);
  let changed = false;

  if (body.status !== undefined) {
    const result = await botChangeStatus(ref, body, actor);
    ticket = (await getTicketByRef(ticket.id)) ?? ticket;
    changed = changed || result.changed;
  }

  if (body.priority !== undefined) {
    const priority = String(body.priority).trim();
    if (!(TICKET_PRIORITIES as string[]).includes(priority)) {
      throw new ApiError(400, "validation_error", "Neplatná priorita.", {
        priority: "Použi nizka, normalna, vysoka alebo urgentna.",
      });
    }
    if (ticket.priority !== priority) {
      const updated = await updateTicketPriority(
        ticket.id,
        normalizePriority(priority),
      );
      if (updated) {
        const noted = await addTicketNote(
          updated.id,
          `Priorita zmenená na ${priority}.`,
          actor.name,
        );
        ticket = noted ?? updated;
        changed = true;
        revalidateTicketPaths(ticket);
      }
    }
  }

  const vyjazdRef = String(body.vyjazdId ?? body.vyjazd ?? "").trim();
  if (vyjazdRef) {
    const linked = await botLinkTicket(ticket.id, { vyjazdId: vyjazdRef }, actor);
    ticket = (await getTicketByRef(ticket.id)) ?? ticket;
    changed = changed || linked.linked;
    return { ...linked, changed };
  }

  return { ...(await ticketPayload(ticket)), changed };
}

export async function botLinkTicket(
  ref: string,
  raw: unknown,
  actor: BotActor,
) {
  const body = asRecord(raw);
  const vyjazdRef = String(body.vyjazdId ?? body.vyjazd ?? "").trim();
  if (!vyjazdRef) {
    throw new ApiError(400, "validation_error", "Chýba identifikátor výjazdu.", {
      vyjazdId: "Zadaj id, číslo alebo kód výjazdu (napr. V-0003).",
    });
  }
  const ticket = await resolveTicketOrThrow(ref);
  const vyjazd = await resolveVyjazdOrThrow(vyjazdRef);
  const result = await linkTicketToVyjazd(ticket.id, vyjazd.id, {
    author: actor.name,
  });
  if (!result) {
    throw new ApiError(404, "not_found", "Ticket alebo výjazd sa nenašiel.");
  }
  revalidateTicketPaths(result.ticket);
  revalidateVyjazdPaths(result.vyjazd.id);
  return {
    ...(await ticketPayload(result.ticket)),
    vyjazd: serializeVyjazd(result.vyjazd),
    linked: result.linked,
  };
}

export async function botListVyjazdy(url: URL) {
  const statusRaw = queryString(url, "status") || "vsetky";
  if (
    statusRaw !== "vsetky" &&
    !(statusRaw in VYJAZD_STATUS_LABELS)
  ) {
    throw new ApiError(
      400,
      "validation_error",
      "Neplatný stav výjazdu. Použi naplanovany, prebieha, hotovy, zruseny alebo vsetky.",
    );
  }

  const ticketRef = queryString(url, "ticket", "ticketId");
  let ticketId = ticketRef;
  if (ticketRef) {
    const ticket = await getTicketByRef(ticketRef);
    if (ticket) ticketId = ticket.id;
  }

  const vyjazdy = await listVyjazdy({
    status: statusRaw as VyjazdStatus | "vsetky",
    q: queryString(url, "q", "hladaj"),
    deviceUuid: queryString(url, "device", "deviceUuid", "zariadenie"),
    ticketId,
    prevadzka: queryString(url, "prevadzka", "store"),
    from: queryString(url, "od", "from"),
    to: queryString(url, "do", "to"),
  });

  return {
    count: vyjazdy.length,
    vyjazdy: vyjazdy.map(serializeVyjazd),
  };
}

export async function botProposeVyjazd(raw: unknown, actor: BotActor) {
  const body = asRecord(raw);
  const title = String(body.title ?? body.nazov ?? "").trim();
  const store = String(body.store ?? body.prevadzka ?? "").trim();
  if (!title && !store) {
    throw new ApiError(
      400,
      "validation_error",
      "Zadaj názov výjazdu alebo prevádzku.",
      { title: "Chýba názov alebo prevádzka." },
    );
  }
  const { createNavrh } = await import("./kontrola-store");
  const navrh = await createNavrh({
    kind: "vyjazd",
    payload: {
      title: title || `Výjazd ${store}`,
      store,
      address: String(body.address ?? body.adresa ?? ""),
      contactPhone: String(body.contactPhone ?? body.telefon ?? ""),
      technician: String(body.technician ?? body.technik ?? ""),
      scheduledAt: String(body.scheduledAt ?? body.datum ?? ""),
      ticketId: String(body.ticketId ?? body.ticket ?? ""),
      deviceUuid: String(body.deviceUuid ?? body.device ?? ""),
      description: String(body.description ?? body.popis ?? ""),
      stops: body.stops,
    },
    summary: `Návrh výjazdu: ${title || store}`,
    actorId: actor.id,
    actorName: actor.name,
  });
  safeRevalidate("/");
  safeRevalidate("/kontrola");
  safeRevalidate("/vyjazdy");
  return { pending: true, navrh };
}

export async function botCreateNavrh(raw: unknown, actor: BotActor) {
  const body = asRecord(raw);
  const kind = String(body.kind ?? body.typ ?? "ticket");
  if (kind === "vyjazd") return botProposeVyjazd(body, actor);
  return botCreateTicket({ ...body, pending: true }, actor);
}

export async function botGetVyjazd(ref: string) {
  const vyjazd = await resolveVyjazdOrThrow(ref);
  const ticketIds = [
    vyjazd.ticketId,
    ...vyjazd.stops.map((s) => s.ticketId),
  ].filter(Boolean);
  const unique = [...new Set(ticketIds)];
  const tickets = (
    await Promise.all(unique.map((id) => getTicketByRef(id)))
  ).filter((t): t is Ticket => Boolean(t));

  return {
    vyjazd: serializeVyjazd(vyjazd),
    tickets: tickets.map(serializeTicket),
  };
}

export async function botListDevices(url: URL) {
  const onlineRaw = queryString(url, "online") || "all";
  const online =
    onlineRaw === "online" || onlineRaw === "offline" || onlineRaw === "all"
      ? onlineRaw
      : "all";
  const healthRaw = queryString(url, "health", "stav");
  const health =
    healthRaw === "long_offline" || healthRaw === "dlhodobo_offline"
      ? "long_offline"
      : healthRaw === "test"
        ? "test"
        : undefined;
  const devices = await listDevices({
    q: queryString(url, "q", "hladaj", "prevadzka"),
    online,
    health,
    partner: queryString(url, "partner") || undefined,
  });
  return {
    count: devices.length,
    devices: devices.map(serializeDevice),
  };
}

export async function botGetDevice(uuid: string) {
  const device = await getDevice(uuid.trim());
  if (!device) {
    throw new ApiError(404, "not_found", `Zariadenie „${uuid}“ sa nenašlo.`);
  }
  const tickets = await listTickets({ deviceUuid: device.uuid });
  const vyjazdy = await listVyjazdy({ deviceUuid: device.uuid });
  return {
    device: serializeDevice(device),
    tickets: tickets.map(serializeTicket),
    vyjazdy: vyjazdy.map(serializeVyjazdSummary),
  };
}

export async function botListPrevadzky(url: URL) {
  const q = queryString(url, "q", "hladaj", "prevadzka");
  const stores = await listPrevadzkaProfiles(q);
  const tickets = await listTickets({ archived: "all" });
  const vyjazdy = await listVyjazdy();
  const prevadzky = await Promise.all(
    stores.map(async (store) => {
      const devices = await devicesForPrevadzka(store);
      const uuids = await listPrevadzkaDeviceUuids(store.id);
      const vykaz = await listMergedVykaz(store, tickets, vyjazdy, [
        ...devices.map((d) => d.uuid),
        ...uuids,
      ]);
      const material = await listMaterial({ prevadzkaId: store.id });
      return serializePrevadzkaProfile(store, { devices, vykaz, material });
    }),
  );
  return { count: prevadzky.length, prevadzky };
}

export async function botGetPrevadzka(ref: string) {
  const store = await getPrevadzkaProfile(ref);
  if (!store) {
    throw new ApiError(404, "not_found", `Prevádzka „${ref}“ sa nenašla.`);
  }
  const detail = await loadPrevadzkaDetail(store);
  return {
    prevadzka: serializePrevadzkaProfile(store, {
      devices: detail.devices,
      vykaz: detail.vykaz,
      material: detail.material,
    }),
    vykaz: detail.vykaz.map(serializeVykaz),
    material: detail.material.map(serializeMaterial),
    openTickets: detail.openTickets.map(serializeTicket),
    suggestions: detail.suggestions,
    completeness: detail.completeness,
  };
}

export async function botPatchPrevadzka(
  ref: string,
  raw: unknown,
  actor: BotActor,
) {
  const store = await getPrevadzkaProfile(ref);
  if (!store) {
    throw new ApiError(404, "not_found", `Prevádzka „${ref}“ sa nenašla.`);
  }
  const body = asRecord(raw);
  const patch = collectStorePatch(body);
  const suggestion = await createProfileSuggestion({
    prevadzkaId: store.id,
    actorId: actor.id,
    actorName: actor.name,
    patch,
  });
  if (!suggestion) {
    throw new ApiError(404, "not_found", `Prevádzka „${ref}“ sa nenašla.`);
  }
  safeRevalidate("/prevadzky");
  safeRevalidate(`/prevadzky/${store.id}`);
  return {
    suggestion,
    pending: true,
    message: "Návrh čaká na schválenie v UI.",
  };
}

export async function botCreatePrevadzka(raw: unknown, actor: BotActor) {
  const body = asRecord(raw);
  const jobType = parseJobType(String(body.jobType ?? body.typ ?? ""));
  if (!jobType) {
    throw new ApiError(
      400,
      "validation_error",
      "Vyber typ zákazky: montaz_ozvucenia alebo spustenie_zariadenia.",
      { jobType: "Povinné pole." },
    );
  }
  const name = String(body.name ?? body.nazov ?? "").trim();
  const city = String(body.city ?? body.mesto ?? "").trim();
  const address = String(body.address ?? body.adresa ?? "").trim();
  const chain = String(body.chain ?? body.partner ?? body.retazec ?? "").trim();
  if (!name && !city && !address && !chain) {
    throw new ApiError(
      400,
      "validation_error",
      "Zadaj aspoň názov, reťazec alebo adresu prevádzky.",
      { name: "Chýba identifikácia prevádzky." },
    );
  }
  const result = await createPrevadzkaWithJob({
    name,
    chain,
    code: String(body.code ?? body.kod ?? "").trim(),
    storeType: String(body.storeType ?? body.typPredajne ?? "").trim(),
    city,
    address,
    gpsLat: String(body.gpsLat ?? body.lat ?? "").trim(),
    gpsLng: String(body.gpsLng ?? body.lng ?? "").trim(),
    phone: String(body.phone ?? body.telefon ?? "").trim(),
    openingHours: body.openingHours
      ? hydrateOpeningHours(body.openingHours)
      : undefined,
    profile: body.profile ? hydrateProfile(body.profile) : undefined,
    jobType,
    status: "pending",
    author: actor.name,
    description: String(body.description ?? body.popis ?? "").trim(),
    material: parseMaterialList(body.material),
    assignedTo: String(body.assignedTo ?? "").trim(),
    clientRef: String(body.clientRef ?? body.client_ref ?? "").trim() || undefined,
  });
  safeRevalidate("/prevadzky");
  safeRevalidate("/");
  return {
    pending: true,
    message: "Návrh prevádzky čaká na schválenie Martina.",
    prevadzka: serializePrevadzkaProfile(result.store),
    ticket: serializeTicket(result.ticket),
  };
}

export async function botAddVykaz(
  ref: string,
  raw: unknown,
  actor: BotActor,
) {
  const store = await getPrevadzkaProfile(ref);
  if (!store) {
    throw new ApiError(404, "not_found", `Prevádzka „${ref}“ sa nenašla.`);
  }
  const body = asRecord(raw);
  const type = parseVykazType(String(body.type ?? body.typ ?? "servis"));
  const description = String(body.description ?? body.popis ?? "").trim();
  if (!description) {
    throw new ApiError(400, "validation_error", "Chýba popis práce.", {
      description: "Vyplň, čo sa spravilo.",
    });
  }
  const durationRaw = body.durationMin ?? body.duration_min ?? body.minuty;
  const durationMin =
    durationRaw == null || durationRaw === ""
      ? null
      : Number(durationRaw);
  const entry = await addManualVykaz({
    prevadzkaId: store.id,
    date: String(body.date ?? body.datum ?? "") || new Date().toISOString(),
    type: type ?? "servis",
    author: actor.name,
    description,
    durationMin: Number.isFinite(durationMin as number)
      ? (durationMin as number)
      : null,
    ticketId: String(body.ticketId ?? body.ticket ?? ""),
    vyjazdId: String(body.vyjazdId ?? body.vyjazd ?? ""),
  });
  if (!entry) {
    throw new ApiError(404, "not_found", `Prevádzka „${ref}“ sa nenašla.`);
  }
  safeRevalidate(`/prevadzky/${store.id}`);
  return { entry: serializeVykaz(entry) };
}

export async function botAddMaterial(
  ticketRef: string,
  raw: unknown,
  actor: BotActor,
) {
  const ticket = await resolveTicketOrThrow(ticketRef);
  const body = asRecord(raw);
  const item = String(body.item ?? body.polozka ?? "").trim();
  if (!item) {
    throw new ApiError(400, "validation_error", "Chýba položka materiálu.", {
      item: "Vyplň názov.",
    });
  }
  if (!ticket.prevadzkaId) {
    throw new ApiError(
      400,
      "validation_error",
      "Ticket nie je naviazaný na prevádzku.",
    );
  }
  const created = await addMaterialItem({
    ticketId: ticket.id,
    prevadzkaId: ticket.prevadzkaId,
    item,
    quantity: Number(body.quantity ?? body.pocet ?? 1),
    unit: String(body.unit ?? body.jednotka ?? "ks"),
    unitPrice:
      body.unitPrice == null && body.unit_price == null
        ? null
        : Number(body.unitPrice ?? body.unit_price),
    note: String(body.note ?? body.poznamka ?? ""),
    status: parseMaterialStatus(String(body.status ?? "planovane")) ?? "planovane",
  });
  void actor;
  revalidateTicketPaths(ticket);
  return { item: serializeMaterial(created) };
}

export async function botPatchMaterial(
  ticketRef: string,
  itemId: string,
  raw: unknown,
) {
  const ticket = await resolveTicketOrThrow(ticketRef);
  const current = await getMaterialItem(itemId);
  if (!current || current.ticketId !== ticket.id) {
    throw new ApiError(404, "not_found", "Položka materiálu sa nenašla.");
  }
  const body = asRecord(raw);
  const updated = await updateMaterialItem(itemId, {
    item: body.item != null ? String(body.item) : undefined,
    quantity: body.quantity != null ? Number(body.quantity) : undefined,
    unit: body.unit != null ? String(body.unit) : undefined,
    unitPrice:
      body.unitPrice === undefined && body.unit_price === undefined
        ? undefined
        : body.unitPrice == null && body.unit_price == null
          ? null
          : Number(body.unitPrice ?? body.unit_price),
    note: body.note != null ? String(body.note) : undefined,
    status: parseMaterialStatus(String(body.status ?? "")) ?? undefined,
  });
  revalidateTicketPaths(ticket);
  return { item: updated ? serializeMaterial(updated) : null };
}

export async function botDeleteMaterial(ticketRef: string, itemId: string) {
  const ticket = await resolveTicketOrThrow(ticketRef);
  const current = await getMaterialItem(itemId);
  if (!current || current.ticketId !== ticket.id) {
    throw new ApiError(404, "not_found", "Položka materiálu sa nenašla.");
  }
  await deleteMaterialItem(itemId);
  revalidateTicketPaths(ticket);
  return { deleted: true, id: itemId };
}

function collectStorePatch(body: Record<string, unknown>) {
  const patch: Parameters<typeof createProfileSuggestion>[0]["patch"] = {};
  if (body.code != null) patch.code = String(body.code);
  if (body.chain != null || body.partner != null) {
    patch.chain = String(body.chain ?? body.partner);
  }
  if (body.storeType != null) patch.storeType = String(body.storeType);
  if (body.name != null) patch.name = String(body.name);
  if (body.city != null) patch.city = String(body.city);
  if (body.address != null) patch.address = String(body.address);
  if (body.gpsLat != null) patch.gpsLat = String(body.gpsLat);
  if (body.gpsLng != null) patch.gpsLng = String(body.gpsLng);
  if (body.phone != null) patch.phone = String(body.phone);
  if (body.openingHours) patch.openingHours = hydrateOpeningHours(body.openingHours);
  if (body.profile && typeof body.profile === "object") {
    patch.profile = hydrateProfile(body.profile);
  }
  return patch;
}

export async function botSkladOverview() {
  const { skladSnapshot, serializePolozka, serializeDl, serializePohyb } =
    await import("./sklad-store");
  const snap = await skladSnapshot();
  return {
    stats: snap.stats,
    low: snap.polozky.filter((p) => p.low).map(serializePolozka),
    pending: snap.pending.map(serializeDl),
    recent: snap.pohyby.slice(0, 12).map(serializePohyb),
  };
}

export async function botSkladPolozky(url: URL) {
  const { skladSnapshot, serializePolozka } = await import("./sklad-store");
  const { parseKategoria } = await import("./sklad");
  const snap = await skladSnapshot();
  const q = queryString(url, "q", "hladaj");
  const kategoria = parseKategoria(queryString(url, "kategoria"));
  let rows = snap.polozky;
  if (kategoria) rows = rows.filter((p) => p.kategoria === kategoria);
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((p) =>
      `${p.nazov} ${p.kod}`.toLowerCase().includes(needle),
    );
  }
  return { count: rows.length, polozky: rows.map(serializePolozka) };
}

export async function botSkladPohyby(url: URL) {
  const { listPohyby, serializePohyb } = await import("./sklad-store");
  const { parsePohybTyp } = await import("./sklad");
  const pohyby = await listPohyby({
    polozkaId: queryString(url, "polozka", "polozkaId"),
    typ: parsePohybTyp(queryString(url, "typ")) ?? undefined,
    prevadzkaId: queryString(url, "prevadzka", "prevadzkaId"),
    from: queryString(url, "od", "from"),
    to: queryString(url, "do", "to"),
  });
  return { count: pohyby.length, pohyby: pohyby.map(serializePohyb) };
}

async function serializePrijemResponse(list: {
  id: string;
  suborUrl: string;
  suborName: string;
  suborMime: string;
}) {
  const { serializeDl } = await import("./sklad-store");
  const prijem = serializeDl(list as Parameters<typeof serializeDl>[0]);
  const subor = list.suborUrl
    ? {
        id: list.id,
        url: list.suborUrl,
        nazov: list.suborName,
        mime: list.suborMime,
      }
    : null;
  return { pending: true as const, prijem, subor };
}

export async function botSkladPrijem(
  raw: unknown,
  actor: BotActor,
  file?: { name: string; mime: string; bytes: Buffer },
) {
  const { createDodaciList } = await import("./sklad-store");
  const { parseKategoria, parseJednotka, toSqlTimestamptz } = await import("./sklad");
  const body = asRecord(raw);
  const itemsRaw = body.polozky ?? body.items ?? body.riadky;
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
    throw new ApiError(400, "validation_error", "Chýbajú položky príjmu.", {
      polozky: "Pošli aspoň jednu položku.",
    });
  }
  const list = await createDodaciList({
    dodavatel: String(body.dodavatel ?? ""),
    cisloDl: String(body.cisloDl ?? body.cislo_dl ?? ""),
    datum: toSqlTimestamptz(body.datum ?? body.date),
    zdroj: "servis_bot",
    vytvoril: actor.name,
    riadky: itemsRaw.map((row) => {
      const o = (row && typeof row === "object" ? row : {}) as Record<
        string,
        unknown
      >;
      return {
        polozkaId: String(o.polozkaId ?? o.polozka_id ?? ""),
        kod: String(o.kod ?? o.code ?? ""),
        nazov: String(o.nazov ?? o.item ?? o.name ?? ""),
        kategoria: parseKategoria(String(o.kategoria ?? "")) ?? "Iné",
        jednotka: parseJednotka(String(o.jednotka ?? o.unit ?? "ks")),
        minStav: Number(o.minStav ?? o.min_stav ?? 0) || 0,
        mnozstvo: Number(o.mnozstvo ?? o.quantity ?? 0) || 0,
        poznamka: String(o.poznamka ?? o.note ?? ""),
        nova: Boolean(o.nova ?? o.new),
      };
    }),
    file,
  });
  safeRevalidate("/");
  safeRevalidate("/sklad");
  safeRevalidate("/kontrola");
  return serializePrijemResponse(list);
}

export async function botSkladPrijemSubor(
  id: string,
  file: { name: string; mime: string; bytes: Buffer },
  actor: BotActor,
) {
  const { attachDodaciListFile, getDodaciList } = await import("./sklad-store");
  const current = await getDodaciList(id);
  if (!current) {
    throw new ApiError(404, "not_found", "Príjem sa nenašiel.");
  }
  if (current.zdroj !== "servis_bot" || current.vytvoril !== actor.name) {
    throw new ApiError(
      403,
      "forbidden",
      "Prílohu môže pridať len bot, ktorý príjem vytvoril.",
    );
  }
  const result = await attachDodaciListFile(id, file);
  if (!result.ok) {
    if (result.reason === "not_found") {
      throw new ApiError(404, "not_found", "Príjem sa nenašiel.");
    }
    if (result.reason === "not_pending") {
      throw new ApiError(
        400,
        "validation_error",
        "Prílohu možno pridať len k čakajúcemu príjmu.",
      );
    }
    throw new ApiError(
      409,
      "conflict",
      "Príjem už má prílohu. Súbor sa nemaže ani neprepisuje.",
    );
  }
  safeRevalidate("/");
  safeRevalidate("/sklad");
  safeRevalidate("/kontrola");
  return serializePrijemResponse(result.list);
}
