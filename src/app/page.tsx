import Link from "next/link";
import { ApprovalsPanel } from "@/components/approvals-panel";
import { CommandTrigger } from "@/components/command-palette";
import { FilterSelect } from "@/components/filter-select";
import { TicketCard } from "@/components/ticket-card";
import { listDeviceEvents } from "@/lib/alert-state";
import { ticketCode } from "@/lib/format";
import {
  listAllPendingSuggestions,
  listPendingPrevadzky,
} from "@/lib/prevadzka-store";
import {
  OUTAGE_ALERTS,
  isSameLocalDay,
  outageCountsByDay,
  sparkPolyline,
} from "@/lib/pulse";
import {
  findTicketStore,
  ticketCallPhone,
  ticketMapsHref,
  ticketRegion,
  ticketStoreLabel,
} from "@/lib/ticket-context";
import {
  getDeviceStats,
  getStats,
  getVyjazdStats,
  listDevices,
  listPrevadzkaProfiles,
  listTickets,
  listVyjazdy,
} from "@/lib/store";
import {
  PRIORITY_LABELS,
  type TicketPriority,
  type TicketSource,
  type TicketStatus,
} from "@/lib/types";

type SearchParams = Promise<{
  status?: string;
  source?: string;
  q?: string;
  archiv?: string;
  priority?: string;
  region?: string;
}>;

function ticketsHref(opts: {
  status?: TicketStatus | "vsetky" | "aktivne";
  source?: TicketSource | "vsetky";
  q?: string;
  archiv?: boolean;
  priority?: TicketPriority | "vsetky";
  region?: string;
}) {
  const params = new URLSearchParams();
  if (opts.archiv) params.set("archiv", "1");
  if (opts.status && opts.status !== "aktivne") params.set("status", opts.status);
  if (opts.source && opts.source !== "vsetky") params.set("source", opts.source);
  if (opts.priority && opts.priority !== "vsetky") {
    params.set("priority", opts.priority);
  }
  if (opts.region?.trim()) params.set("region", opts.region.trim());
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
  const statusRaw = params.status;
  const sourceRaw = params.source;
  const source: TicketSource | "vsetky" =
    sourceRaw === "manual" || sourceRaw === "auto" ? sourceRaw : "vsetky";
  const priorityRaw = params.priority;
  const priority: TicketPriority | "vsetky" =
    priorityRaw === "nizka" ||
    priorityRaw === "normalna" ||
    priorityRaw === "vysoka" ||
    priorityRaw === "urgentna"
      ? priorityRaw
      : "vsetky";
  const q = params.q ?? "";
  const archiv = params.archiv === "1" || params.archiv === "only";
  const region = params.region ?? "";

  const status: TicketStatus | "vsetky" | "aktivne" = archiv
    ? "vsetky"
    : statusRaw === "otvorene" ||
        statusRaw === "v_rieseni" ||
        statusRaw === "caka_diely" ||
        statusRaw === "hotove" ||
        statusRaw === "vsetky"
      ? statusRaw
      : "aktivne";

  const tab = archiv
    ? "archiv"
    : status === "hotove"
      ? "hotove"
      : "otvorene";

  const since = new Date();
  since.setDate(since.getDate() - 6);
  since.setHours(0, 0, 0, 0);

  const [
    tickets,
    stats,
    deviceStats,
    vyjazdStats,
    devices,
    stores,
    vyjazdy,
    events,
    pendingStores,
    suggestions,
    liveTickets,
  ] = await Promise.all([
    listTickets({
      status,
      source,
      priority,
      q,
      archived: archiv ? "only" : "hide",
    }),
    getStats(),
    getDeviceStats(),
    getVyjazdStats(),
    listDevices(),
    listPrevadzkaProfiles(),
    listVyjazdy(),
    listDeviceEvents({ sinceIso: since.toISOString() }),
    listPendingPrevadzky(),
    listAllPendingSuggestions(),
    listTickets({ status: "vsetky", archived: "hide" }),
  ]);

  const storeById = new Map(stores.map((s) => [s.id, s]));
  const regions = [
    ...new Set(
      tickets
        .map((t) => ticketRegion(t, findTicketStore(t, stores, devices), devices))
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "sk"));

  const visible = region
    ? tickets.filter(
        (t) =>
          ticketRegion(t, findTicketStore(t, stores, devices), devices) ===
          region,
      )
    : tickets;

  const openCount = stats.otvorene + stats.v_rieseni + stats.caka_diely;
  const highOpen = liveTickets.filter(
    (t) =>
      (t.status === "otvorene" ||
        t.status === "v_rieseni" ||
        t.status === "caka_diely") &&
      (t.priority === "vysoka" || t.priority === "urgentna"),
  ).length;
  const todayDone = liveTickets.filter(
    (t) => t.status === "hotove" && isSameLocalDay(t.updatedAt),
  );
  const plannedCount = vyjazdStats.naplanovany + vyjazdStats.prebieha;
  const nextVyjazd = vyjazdy
    .filter((v) => v.status === "naplanovany" || v.status === "prebieha")
    .sort(
      (a, b) =>
        new Date(a.scheduledAt || a.createdAt).getTime() -
        new Date(b.scheduledAt || b.createdAt).getTime(),
    )[0];

  const spark = sparkPolyline(
    outageCountsByDay(
      events
        .filter((e) => OUTAGE_ALERTS.has(e.alertType))
        .map((e) => e.startedAt),
    ),
  );

  return (
    <div>
      <div className="pulse-hero">
        <div className="shell space-y-0">
          <CommandTrigger />
          <div className="hero-stats">
            <div className="hero-stat hot">
              <div className="l">
                <span className="pulse r" />
                Otvorené tickety
              </div>
              <div className="v">{openCount}</div>
              <div className="h">
                {highOpen} vysoká
              </div>
            </div>
            <div className="hero-stat">
              <div className="l">Dnes vyriešené</div>
              <div className="v">{todayDone.length}</div>
              <div className="h">
                {todayDone.length
                  ? todayDone
                      .slice(0, 2)
                      .map((t) => ticketCode(t.number).replace("#", "T-"))
                      .join(", ")
                  : "zatiaľ žiadne"}
              </div>
            </div>
            <div className="hero-stat">
              <div className="l">
                <span className="pulse" />
                Zariadenia online
              </div>
              <div className="v">
                {deviceStats.online} / {deviceStats.offline}
              </div>
              <div className="h">výpadky 7 dní</div>
              <svg className="spark" width="90" height="28" viewBox="0 0 90 28">
                <polyline
                  fill="none"
                  stroke="#ff4d1a"
                  strokeWidth="2"
                  points={spark.points}
                />
                <circle cx={spark.lastX} cy={spark.lastY} r="3" fill="#ff4d1a" />
              </svg>
            </div>
            <div className="hero-stat">
              <div className="l">Naplánované výjazdy</div>
              <div className="v">{plannedCount}</div>
              <div className="h">
                {nextVyjazd?.scheduledAt
                  ? `najbližší ${new Intl.DateTimeFormat("sk-SK", {
                      weekday: "short",
                      day: "numeric",
                      month: "numeric",
                    }).format(new Date(nextVyjazd.scheduledAt))}`
                  : "žiadny v pláne"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="shell page-stack">
        <div className="pulse-bar">
          <div className="pulse-tabs">
            <Link
              href={ticketsHref({ status: "aktivne", source, q, priority, region })}
              data-on={tab === "otvorene"}
            >
              Otvorené<em>{openCount}</em>
            </Link>
            <Link
              href={ticketsHref({
                status: "hotove",
                source,
                q,
                priority,
                region,
              })}
              data-on={tab === "hotove"}
            >
              Hotové<em>{stats.hotove}</em>
            </Link>
            <Link
              href={ticketsHref({
                status: "vsetky",
                source,
                q,
                archiv: true,
                priority,
                region,
              })}
              data-on={tab === "archiv"}
            >
              Archív<em>{stats.archived}</em>
            </Link>
          </div>
          <span className="flex-1" />
          <form action="/" method="get">
            {archiv ? <input type="hidden" name="archiv" value="1" /> : null}
            {status !== "aktivne" ? (
              <input type="hidden" name="status" value={status} />
            ) : null}
            {source !== "vsetky" ? (
              <input type="hidden" name="source" value={source} />
            ) : null}
            {q ? <input type="hidden" name="q" value={q} /> : null}
            {region ? <input type="hidden" name="region" value={region} /> : null}
            <FilterSelect name="priority" defaultValue={priority}>
              <option value="vsetky">Priorita</option>
              {(Object.keys(PRIORITY_LABELS) as TicketPriority[]).map((key) => (
                <option key={key} value={key}>
                  {PRIORITY_LABELS[key]}
                </option>
              ))}
            </FilterSelect>
          </form>
          <form action="/" method="get">
            {archiv ? <input type="hidden" name="archiv" value="1" /> : null}
            {status !== "aktivne" ? (
              <input type="hidden" name="status" value={status} />
            ) : null}
            {priority !== "vsetky" ? (
              <input type="hidden" name="priority" value={priority} />
            ) : null}
            {q ? <input type="hidden" name="q" value={q} /> : null}
            {region ? <input type="hidden" name="region" value={region} /> : null}
            <FilterSelect name="source" defaultValue={source}>
              <option value="vsetky">Zdroj</option>
              <option value="manual">manuálne</option>
              <option value="auto">bot</option>
            </FilterSelect>
          </form>
          <form action="/" method="get">
            {archiv ? <input type="hidden" name="archiv" value="1" /> : null}
            {status !== "aktivne" ? (
              <input type="hidden" name="status" value={status} />
            ) : null}
            {source !== "vsetky" ? (
              <input type="hidden" name="source" value={source} />
            ) : null}
            {priority !== "vsetky" ? (
              <input type="hidden" name="priority" value={priority} />
            ) : null}
            {q ? <input type="hidden" name="q" value={q} /> : null}
            <FilterSelect name="region" defaultValue={region}>
              <option value="">Región</option>
              {regions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </FilterSelect>
          </form>
        </div>

        {archiv ? (
          <p className="mb-4 text-sm text-[var(--ink-soft)]">
            Archív je len na čítanie. Ručné tickety tu nie sú — ide o staré
            Balena auto-tickety pred novými pravidlami.
          </p>
        ) : null}

        <div className="home-grid">
          <section>
            {visible.length === 0 ? (
              <div className="panel space-y-3 p-8 text-center">
                <p className="text-lg font-semibold">
                  {archiv ? "Archív je prázdny" : "Žiadne tickety"}
                </p>
                <p className="text-[var(--ink-soft)]">
                  {archiv
                    ? "Žiadny archivovaný ticket nezodpovedá filtru."
                    : "Zatiaľ nič nezodpovedá filtru. Pridaj nový problém."}
                </p>
                {archiv ? null : (
                  <Link href="/novy" className="btn btn-primary">
                    + Nový problém
                  </Link>
                )}
              </div>
            ) : (
              <div className="ticket-cards">
                {visible.map((ticket) => {
                  const store = findTicketStore(ticket, stores, devices);
                  return (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      storeLabel={ticketStoreLabel(ticket, store)}
                      phone={ticketCallPhone(ticket, store)}
                      mapsHref={ticketMapsHref(ticket, store, devices)}
                      vyjazdy={vyjazdy}
                    />
                  );
                })}
              </div>
            )}
          </section>
          <ApprovalsPanel
            stores={pendingStores}
            suggestions={suggestions}
            storeById={storeById}
          />
        </div>
      </div>
    </div>
  );
}
