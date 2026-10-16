import { revalidatePath } from "next/cache";
import { serializeDevice, serializePrevadzka, serializeTicket, serializeVyjazd, serializeVyjazdSummary } from "./api-serialize";
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
  listDevices,
  listPrevadzky,
  listTickets,
  listVyjazdy,
  updateTicketPriority,
  updateTicketStatus,
} from "./store";
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
  const vyjazdy = await listVyjazdy({ ticketId: ticket.id });
  return {
    ticket: serializeTicket(ticket),
    vyjazdy: vyjazdy.map(serializeVyjazdSummary),
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
  const devices = await listDevices({
    q: queryString(url, "q", "hladaj", "prevadzka"),
    online,
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
  const prevadzky = await listPrevadzky(queryString(url, "q", "hladaj", "prevadzka"));
  return {
    count: prevadzky.length,
    prevadzky: prevadzky.map(serializePrevadzka),
  };
}
