import Link from "next/link";
import {
  formatDate,
  priorityClass,
  statusClass,
  ticketCode,
} from "@/lib/format";
import { getDeviceStats, getStats, listTickets } from "@/lib/store";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type TicketSource,
  type TicketStatus,
} from "@/lib/types";

type SearchParams = Promise<{
  status?: string;
  source?: string;
  q?: string;
}>;

const FILTERS: Array<{ key: TicketStatus | "vsetky"; label: string }> = [
  { key: "vsetky", label: "Všetky" },
  { key: "otvorene", label: "Otvorené" },
  { key: "v_rieseni", label: "V riešení" },
  { key: "caka_diely", label: "Čaká diely" },
  { key: "hotove", label: "Hotové" },
];

const SOURCE_FILTERS: Array<{ key: TicketSource | "vsetky"; label: string }> = [
  { key: "vsetky", label: "Všetky zdroje" },
  { key: "manual", label: "Ručné" },
  { key: "auto", label: "Automatické" },
];

function ticketsHref(opts: {
  status?: TicketStatus | "vsetky";
  source?: TicketSource | "vsetky";
  q?: string;
}) {
  const params = new URLSearchParams();
  if (opts.status && opts.status !== "vsetky") params.set("status", opts.status);
  if (opts.source && opts.source !== "vsetky") params.set("source", opts.source);
  if (opts.q?.trim()) params.set("q", opts.q.trim());
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const status =
    (params.status as TicketStatus | "vsetky" | undefined) ?? "vsetky";
  const sourceRaw = params.source;
  const source: TicketSource | "vsetky" =
    sourceRaw === "manual" || sourceRaw === "auto" ? sourceRaw : "vsetky";
  const q = params.q ?? "";

  const [tickets, stats, deviceStats] = await Promise.all([
    listTickets({ status, source, q }),
    getStats(),
    getDeviceStats(),
  ]);

  return (
    <div className="shell space-y-6">
      <section className="fade-up space-y-3">
        <h1 className="max-w-2xl text-4xl font-extrabold leading-tight text-[var(--ink)] md:text-5xl">
          ServisList
        </h1>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href="/novy" className="btn btn-primary">
            + Nový problém
          </Link>
          <Link href="/zariadenia" className="btn btn-ghost">
            Zariadenia ({deviceStats.total})
          </Link>
          <Link href="/vyjazdy" className="btn btn-ghost">
            Výjazdy
          </Link>
        </div>
      </section>

      <section
        className="fade-up grid grid-cols-2 gap-3 md:grid-cols-5"
        style={{ animationDelay: "60ms" }}
      >
        <div className="stat">
          <span className="text-sm text-[var(--ink-soft)]">Celkom</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="stat">
          <span className="text-sm text-[var(--ink-soft)]">Otvorené</span>
          <strong>{stats.otvorene}</strong>
        </div>
        <div className="stat">
          <span className="text-sm text-[var(--ink-soft)]">V riešení</span>
          <strong>{stats.v_rieseni}</strong>
        </div>
        <div className="stat">
          <span className="text-sm text-[var(--ink-soft)]">Čaká diely</span>
          <strong>{stats.caka_diely}</strong>
        </div>
        <div className="stat col-span-2 md:col-span-1">
          <span className="text-sm text-[var(--ink-soft)]">Hotové</span>
          <strong>{stats.hotove}</strong>
        </div>
      </section>

      <section
        className="panel fade-up overflow-hidden"
        style={{ animationDelay: "120ms" }}
      >
        <div className="flex flex-col gap-4 border-b border-[var(--line)] p-4 md:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <form className="flex w-full flex-col gap-3 md:max-w-md md:flex-row">
              <input type="hidden" name="status" value={status} />
              {source !== "vsetky" ? (
                <input type="hidden" name="source" value={source} />
              ) : null}
              <div className="field grow">
                <label htmlFor="q" className="sr-only">
                  Hľadať
                </label>
                <input
                  id="q"
                  name="q"
                  defaultValue={q}
                  placeholder="Hľadať zákazníka, sériové číslo, problém…"
                />
              </div>
              <button type="submit" className="btn btn-ghost shrink-0">
                Hľadať
              </button>
            </form>

            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={ticketsHref({ status: f.key, source, q })}
                  className="filter-pill"
                  data-active={status === f.key}
                >
                  {f.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {SOURCE_FILTERS.map((f) => (
              <Link
                key={f.key}
                href={ticketsHref({ status, source: f.key, q })}
                className="filter-pill"
                data-active={source === f.key}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>

        {tickets.length === 0 ? (
          <div className="space-y-3 p-8 text-center">
            <p className="text-lg font-semibold">Žiadne tickety</p>
            <p className="text-[var(--ink-soft)]">
              Zatiaľ nič nezodpovedá filtru. Pridaj nový problém.
            </p>
            <Link href="/novy" className="btn btn-primary">
              + Nový problém
            </Link>
          </div>
        ) : (
          <ul>
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link href={`/ticket/${ticket.id}`} className="ticket-row">
                  <div className="min-w-[5.5rem]">
                    <div className="font-display text-sm font-bold text-[var(--teal-deep)]">
                      {ticketCode(ticket.number)}
                    </div>
                    <div className="mt-1 text-xs text-[var(--ink-soft)]">
                      {formatDate(ticket.updatedAt)}
                    </div>
                  </div>

                  <div className="min-w-0 space-y-1.5">
                    <div className="truncate text-lg font-bold">{ticket.title}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--ink-soft)]">
                      <span>
                        {ticket.deviceType}
                        {ticket.deviceSerial ? ` · ${ticket.deviceSerial}` : ""}
                      </span>
                      <span>{ticket.customerName}</span>
                      <span>Servisák: {ticket.assignedTo}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <span className={`chip ${statusClass(ticket.status)}`}>
                      {STATUS_LABELS[ticket.status]}
                    </span>
                    <span className={`chip ${priorityClass(ticket.priority)}`}>
                      {PRIORITY_LABELS[ticket.priority]}
                    </span>
                    {ticket.source === "auto" ? (
                      <span className="chip chip-warn">Auto</span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
