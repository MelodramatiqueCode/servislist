import Link from "next/link";
import {
  formatDateTime,
  priorityClass,
  vyjazdCode,
  vyjazdStatusClass,
} from "@/lib/format";
import { getVyjazdStats, listVyjazdy } from "@/lib/store";
import {
  PRIORITY_LABELS,
  VYJAZD_STATUS_LABELS,
  type VyjazdStatus,
} from "@/lib/types";

type SearchParams = Promise<{
  status?: string;
  q?: string;
}>;

const FILTERS: Array<{ key: VyjazdStatus | "vsetky"; label: string }> = [
  { key: "vsetky", label: "Všetky" },
  { key: "naplanovany", label: "Naplánované" },
  { key: "prebieha", label: "Prebiehajú" },
  { key: "hotovy", label: "Hotové" },
  { key: "zruseny", label: "Zrušené" },
];

function vyjazdyHref(opts: { status?: VyjazdStatus | "vsetky"; q?: string }) {
  const params = new URLSearchParams();
  if (opts.status && opts.status !== "vsetky") params.set("status", opts.status);
  if (opts.q?.trim()) params.set("q", opts.q.trim());
  const qs = params.toString();
  return qs ? `/vyjazdy?${qs}` : "/vyjazdy";
}

function isOverdue(status: VyjazdStatus, scheduledAt: string) {
  if (status !== "naplanovany" && status !== "prebieha") return false;
  if (!scheduledAt) return false;
  const t = new Date(scheduledAt).getTime();
  return !Number.isNaN(t) && t < Date.now();
}

export default async function VyjazdyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const statusRaw = params.status;
  const status: VyjazdStatus | "vsetky" =
    statusRaw === "naplanovany" ||
    statusRaw === "prebieha" ||
    statusRaw === "hotovy" ||
    statusRaw === "zruseny"
      ? statusRaw
      : "vsetky";
  const q = params.q ?? "";

  const [vyjazdy, stats] = await Promise.all([
    listVyjazdy({ status, q }),
    getVyjazdStats(),
  ]);

  return (
    <div className="shell space-y-6">
      <section className="fade-up space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--teal)]">
          Servisné výjazdy
        </p>
        <h1 className="text-4xl font-extrabold leading-tight text-[var(--ink)] md:text-5xl">
          Výjazdy
        </h1>
        <p className="max-w-2xl text-lg text-[var(--ink-soft)]">
          Plánuj a edituj servisné výjazdy k predajniam — kto, kam, kedy a s
          akým výsledkom.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href="/vyjazdy/novy" className="btn btn-primary">
            + Nový výjazd
          </Link>
          <Link href="/" className="btn btn-ghost">
            Tickety
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
          <span className="text-sm text-[var(--ink-soft)]">Naplánované</span>
          <strong>{stats.naplanovany}</strong>
        </div>
        <div className="stat">
          <span className="text-sm text-[var(--ink-soft)]">Prebiehajú</span>
          <strong>{stats.prebieha}</strong>
        </div>
        <div className="stat">
          <span className="text-sm text-[var(--ink-soft)]">Hotové</span>
          <strong>{stats.hotovy}</strong>
        </div>
        <div className="stat col-span-2 md:col-span-1">
          <span className="text-sm text-[var(--ink-soft)]">Po termíne</span>
          <strong className={stats.overdue > 0 ? "text-[var(--danger)]" : ""}>
            {stats.overdue}
          </strong>
        </div>
      </section>

      <section
        className="panel fade-up overflow-hidden"
        style={{ animationDelay: "120ms" }}
      >
        <div className="flex flex-col gap-4 border-b border-[var(--line)] p-4 md:flex-row md:items-center md:justify-between md:p-5">
          <form className="flex w-full flex-col gap-3 md:max-w-md md:flex-row">
            {status !== "vsetky" ? (
              <input type="hidden" name="status" value={status} />
            ) : null}
            <div className="field grow">
              <label htmlFor="q" className="sr-only">
                Hľadať
              </label>
              <input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="Hľadať predajňu, technika, popis…"
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
                href={vyjazdyHref({ status: f.key, q })}
                className="filter-pill"
                data-active={status === f.key}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>

        {vyjazdy.length === 0 ? (
          <div className="space-y-3 p-8 text-center">
            <p className="text-lg font-semibold">Žiadne výjazdy</p>
            <p className="text-[var(--ink-soft)]">
              Zatiaľ nič nezodpovedá filtru. Naplánuj nový výjazd.
            </p>
            <Link href="/vyjazdy/novy" className="btn btn-primary">
              + Nový výjazd
            </Link>
          </div>
        ) : (
          <ul>
            {vyjazdy.map((v) => (
              <li key={v.id}>
                <Link href={`/vyjazdy/${v.id}`} className="ticket-row">
                  <div className="min-w-[6rem]">
                    <div className="font-display text-sm font-bold text-[var(--teal-deep)]">
                      {vyjazdCode(v.number)}
                    </div>
                    <div className="mt-1 text-xs text-[var(--ink-soft)]">
                      {formatDateTime(v.scheduledAt)}
                    </div>
                  </div>

                  <div className="min-w-0 space-y-1.5">
                    <div className="truncate text-lg font-bold">{v.title}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--ink-soft)]">
                      <span>{v.store}</span>
                      <span>Technik: {v.technician}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {isOverdue(v.status, v.scheduledAt) ? (
                      <span className="chip chip-overdue">Po termíne</span>
                    ) : null}
                    <span className={`chip ${vyjazdStatusClass(v.status)}`}>
                      {VYJAZD_STATUS_LABELS[v.status]}
                    </span>
                    <span className={`chip ${priorityClass(v.priority)}`}>
                      {PRIORITY_LABELS[v.priority]}
                    </span>
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
