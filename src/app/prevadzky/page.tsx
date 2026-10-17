import Link from "next/link";
import { devicesForPrevadzky, listPrevadzkaProfiles, listTickets } from "@/lib/store";
import { formatOpeningHours, JOB_TYPE_LABELS, profileCompleteness } from "@/lib/prevadzka-profile";
import { storeLabel } from "@/lib/prevadzka-store";
import { StatCard } from "@/components/stat-card";

type SearchParams = Promise<{ q?: string; tickety?: string; stav?: string }>;

export default async function PrevadzkyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const onlyOpen = params.tickety === "1";
  const onlyPending = params.stav === "pending";
  const [stores, tickets] = await Promise.all([
    listPrevadzkaProfiles(q),
    listTickets({ status: "aktivne", archived: "hide" }),
  ]);
  const devicesByStore = await devicesForPrevadzky(stores);

  const allRows = stores.map((store, i) => {
    const devices = devicesByStore[i] ?? [];
    const open = tickets.filter(
      (t) =>
        t.prevadzkaId === store.id ||
        (t.deviceUuid && devices.some((d) => d.uuid === t.deviceUuid)),
    ).length;
    return { store, devices, open, completeness: profileCompleteness(store) };
  });
  const withTickets = allRows.filter((r) => r.open > 0).length;
  const pending = allRows.filter((r) => r.store.status === "pending").length;
  const rows = allRows.filter((r) => {
    if (onlyOpen && r.open <= 0) return false;
    if (onlyPending && r.store.status !== "pending") return false;
    return true;
  });

  return (
    <div className="shell page-stack space-y-6">
      <section className="fade-up flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold">Prevádzky</h1>
          <p className="max-w-2xl text-[var(--ink-soft)]">
            Karty predajní — kontakty, audio, prístup pre technika a výkaz práce.
          </p>
        </div>
        <Link href="/prevadzky/nova" className="btn btn-primary">
          + Nová prevádzka
        </Link>
      </section>

      <section className="fade-up grid gap-3 md:grid-cols-3">
        <StatCard href="/prevadzky" className="stat" active={!onlyOpen && !onlyPending}>
          <span className="label">Prevádzok</span>
          <strong>{allRows.length}</strong>
        </StatCard>
        <StatCard href="/prevadzky?tickety=1" className="stat" active={onlyOpen}>
          <span className="label">S otvorenými ticketmi</span>
          <strong>{withTickets}</strong>
        </StatCard>
        <StatCard href="/prevadzky?stav=pending" className="stat" active={onlyPending}>
          <span className="label">Návrhy</span>
          <strong>{pending}</strong>
        </StatCard>
      </section>

      <form className="panel fade-up flex flex-wrap gap-3 p-4" action="/prevadzky">
        {onlyOpen ? <input type="hidden" name="tickety" value="1" /> : null}
        {onlyPending ? <input type="hidden" name="stav" value="pending" /> : null}
        <div className="field min-w-[240px] flex-1">
          <label htmlFor="q">Hľadať</label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="reťazec, mesto, kód, adresa…"
          />
        </div>
        <button type="submit" className="btn btn-ghost self-end">
          Filtrovať
        </button>
        {onlyOpen || onlyPending ? (
          <Link href="/prevadzky" className="btn btn-ghost self-end">
            Zrušiť filter
          </Link>
        ) : null}
      </form>

      <section className="panel fade-up overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-6 text-[var(--ink-soft)]">
            Žiadna prevádzka. Pridaj ju ručne alebo počkaj na sync zariadení.
          </p>
        ) : (
          <ul>
            {rows.map(({ store, devices, open, completeness }) => (
              <li key={store.id}>
                <Link href={`/prevadzky/${store.id}`} className="ticket-row">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {store.code ? (
                        <span className="font-display text-sm font-bold text-[var(--teal-deep)]">
                          #{store.code}
                        </span>
                      ) : null}
                      <span className="font-semibold">{storeLabel(store)}</span>
                      {store.status === "pending" ? (
                        <span className="chip chip-warn">Návrh</span>
                      ) : null}
                      {store.jobType ? (
                        <span className="chip chip-edit">
                          {JOB_TYPE_LABELS[store.jobType]}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
                      {[store.address, store.city].filter(Boolean).join(", ") ||
                        "Bez adresy"}
                      {formatOpeningHours(store.openingHours)
                        ? ` · ${formatOpeningHours(store.openingHours)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="chip prio-normalna">
                      {devices.filter((d) => d.isOnline).length}/{devices.length} online
                    </span>
                    <span className={`chip ${open ? "status-otvorene" : "chip-ok"}`}>
                      {open} otvorené
                    </span>
                    <span className="chip chip-edit">{completeness.percent} %</span>
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
