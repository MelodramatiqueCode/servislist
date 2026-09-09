import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addNoteAction,
  updatePriorityAction,
  updateStatusAction,
} from "@/lib/actions";
import {
  formatDate,
  priorityClass,
  statusClass,
  ticketCode,
} from "@/lib/format";
import { getDevice, getTicket } from "@/lib/store";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/types";

const STATUSES = Object.keys(STATUS_LABELS) as TicketStatus[];
const PRIORITIES = Object.keys(PRIORITY_LABELS) as TicketPriority[];

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ticket = await getTicket(id);
  if (!ticket) notFound();
  const linkedDevice = ticket.deviceUuid
    ? await getDevice(ticket.deviceUuid)
    : null;

  return (
    <div className="shell max-w-4xl space-y-6">
      <div className="fade-up space-y-3">
        <Link href="/" className="text-sm font-semibold text-[var(--teal)]">
          ← Späť na tickety
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display text-sm font-bold text-[var(--teal-deep)]">
            {ticketCode(ticket.number)}
          </span>
          <span className={`chip ${statusClass(ticket.status)}`}>
            {STATUS_LABELS[ticket.status]}
          </span>
          <span className={`chip ${priorityClass(ticket.priority)}`}>
            {PRIORITY_LABELS[ticket.priority]}
          </span>
          {ticket.source === "auto" ? (
            <span className="chip chip-warn">
              Auto
              {ticket.alertType ? ` · ${ticket.alertType}` : ""}
            </span>
          ) : null}
        </div>
        <h1 className="text-3xl font-extrabold leading-tight md:text-4xl">
          {ticket.title}
        </h1>
        <p className="text-sm text-[var(--ink-soft)]">
          Vytvorené {formatDate(ticket.createdAt)} · Aktualizované{" "}
          {formatDate(ticket.updatedAt)}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-[1.4fr_0.9fr]">
        <section
          className="panel fade-up space-y-5 p-5 md:p-6"
          style={{ animationDelay: "60ms" }}
        >
          <div>
            <h2 className="mb-2 text-lg font-bold">Popis problému</h2>
            <p className="whitespace-pre-wrap leading-relaxed text-[var(--ink-soft)]">
              {ticket.description}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Info label="Zariadenie" value={ticket.deviceType} />
            <Info
              label="Sériové číslo / UUID"
              value={ticket.deviceSerial || "—"}
            />
            <Info label="Predajňa / zákazník" value={ticket.customerName} />
            <Info
              label="Telefón"
              value={ticket.customerPhone || "—"}
            />
            <Info label="Servisák" value={ticket.assignedTo} />
            {linkedDevice ? (
              <div className="rounded-xl border border-[var(--line)] bg-white/60 px-3.5 py-3 sm:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
                  Balena zariadenie
                </div>
                <div className="mt-1 font-semibold">{linkedDevice.name}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    href={`/zariadenia/${linkedDevice.uuid}`}
                    className="btn btn-ghost"
                  >
                    Detail zariadenia
                  </Link>
                  <a
                    href={linkedDevice.dashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost"
                  >
                    Balena dashboard ↗
                  </a>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-3 border-t border-[var(--line)] pt-5">
            <h2 className="text-lg font-bold">Poznámky zo servisu</h2>
            {ticket.notes.length === 0 ? (
              <p className="text-sm text-[var(--ink-soft)]">
                Zatiaľ žiadne poznámky. Pridaj postup alebo zistenie.
              </p>
            ) : (
              <ul className="space-y-3">
                {ticket.notes.map((note) => (
                  <li key={note.id} className="note">
                    <div className="mb-1 flex flex-wrap gap-x-2 text-xs font-semibold text-[var(--ink-soft)]">
                      <span>{note.author}</span>
                      <span>·</span>
                      <span>{formatDate(note.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{note.text}</p>
                  </li>
                ))}
              </ul>
            )}

            <form action={addNoteAction} className="space-y-3 pt-2">
              <input type="hidden" name="id" value={ticket.id} />
              <div className="field">
                <label htmlFor="author">Autor</label>
                <input
                  id="author"
                  name="author"
                  defaultValue={ticket.assignedTo}
                  placeholder="Meno servisáka"
                />
              </div>
              <div className="field">
                <label htmlFor="text">Nová poznámka</label>
                <textarea
                  id="text"
                  name="text"
                  required
                  placeholder="Čo si zistil / urobil / objednal…"
                />
              </div>
              <button type="submit" className="btn btn-primary">
                Pridať poznámku
              </button>
            </form>
          </div>
        </section>

        <aside
          className="fade-up space-y-4"
          style={{ animationDelay: "120ms" }}
        >
          <div className="panel space-y-4 p-5">
            <h2 className="text-lg font-bold">Stav ticketu</h2>
            <p className="text-sm text-[var(--ink-soft)]">
              Posuň ticket ako v to-do liste — otvorené → v riešení → hotové.
            </p>
            <div className="flex flex-col gap-2">
              {STATUSES.map((status) => (
                <form key={status} action={updateStatusAction}>
                  <input type="hidden" name="id" value={ticket.id} />
                  <input type="hidden" name="status" value={status} />
                  <button
                    type="submit"
                    className={`btn w-full ${
                      ticket.status === status ? "btn-primary" : "btn-ghost"
                    }`}
                  >
                    {STATUS_LABELS[status]}
                  </button>
                </form>
              ))}
            </div>
          </div>

          <div className="panel space-y-4 p-5">
            <h2 className="text-lg font-bold">Priorita</h2>
            <form action={updatePriorityAction} className="space-y-3">
              <input type="hidden" name="id" value={ticket.id} />
              <div className="field">
                <label htmlFor="priority" className="sr-only">
                  Priorita
                </label>
                <select
                  id="priority"
                  name="priority"
                  defaultValue={ticket.priority}
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {PRIORITY_LABELS[priority]}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-ghost w-full">
                Uložiť prioritu
              </button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white/60 px-3.5 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
        {label}
      </div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
