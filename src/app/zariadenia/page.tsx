import Link from "next/link";
import { ImportDevicesPanel, SyncBalenaButton } from "@/components/device-ui";
import { getBalenaConfig } from "@/lib/balena";
import { hardwareLabel } from "@/lib/parse-device";
import {
  ensureFreshBalenaSync,
  getDeviceStats,
  listDevices,
} from "@/lib/store";

type SearchParams = Promise<{
  q?: string;
  online?: string;
  partner?: string;
}>;

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const online =
    params.online === "online" || params.online === "offline"
      ? params.online
      : "all";
  const partner = params.partner ?? "all";

  await ensureFreshBalenaSync();

  const [devices, stats] = await Promise.all([
    listDevices({ q, online, partner }),
    getDeviceStats(),
  ]);

  const fleetSlug = getBalenaConfig()?.fleetSlug || "ceo2/massiva";

  const qs = (next: Record<string, string>) => {
    const sp = new URLSearchParams();
    const merged = {
      q,
      online,
      partner,
      ...next,
    };
    if (merged.q) sp.set("q", merged.q);
    if (merged.online && merged.online !== "all") sp.set("online", merged.online);
    if (merged.partner && merged.partner !== "all") {
      sp.set("partner", merged.partner);
    }
    const s = sp.toString();
    return s ? `/zariadenia?${s}` : "/zariadenia";
  };

  return (
    <div className="shell space-y-6">
      <section className="fade-up space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--teal)]">
          Balena flotila
        </p>
        <h1 className="text-4xl font-extrabold md:text-5xl">Zariadenia</h1>
        <p className="max-w-2xl text-lg text-[var(--ink-soft)]">
          Predajne a Raspberry Pi z flotily. Live online stav z Balena Cloud.
        </p>
      </section>

      <SyncBalenaButton
        configured={stats.configured}
        syncedAt={stats.syncedAt}
        fleetSlug={fleetSlug}
        lastSyncError={stats.lastSyncError}
      />

      <section
        className="fade-up grid grid-cols-2 gap-3 md:grid-cols-4"
        style={{ animationDelay: "40ms" }}
      >
        <div className="stat">
          <span className="text-sm text-[var(--ink-soft)]">Celkom</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="stat">
          <span className="text-sm text-[var(--ink-soft)]">Online</span>
          <strong>{stats.online}</strong>
        </div>
        <div className="stat">
          <span className="text-sm text-[var(--ink-soft)]">Offline</span>
          <strong>{stats.offline}</strong>
        </div>
        <div className="stat">
          <span className="text-sm text-[var(--ink-soft)]">Partneri</span>
          <strong>{stats.partners.length}</strong>
        </div>
      </section>

      <section
        className="panel fade-up overflow-hidden"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex flex-col gap-4 border-b border-[var(--line)] p-4 md:p-5">
          <form className="flex w-full flex-col gap-3 md:flex-row">
            <input type="hidden" name="online" value={online} />
            <input type="hidden" name="partner" value={partner} />
            <div className="field grow">
              <label htmlFor="q" className="sr-only">
                Hľadať
              </label>
              <input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="Hľadať predajňu, mesto, kód, UUID…"
              />
            </div>
            <button type="submit" className="btn btn-ghost shrink-0">
              Hľadať
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {[
              { key: "all", label: "Všetky" },
              { key: "online", label: "Online" },
              { key: "offline", label: "Offline" },
            ].map((f) => (
              <Link
                key={f.key}
                href={qs({ online: f.key })}
                className="filter-pill"
                data-active={online === f.key}
              >
                {f.label}
              </Link>
            ))}
          </div>

          {stats.partners.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href={qs({ partner: "all" })}
                className="filter-pill"
                data-active={partner === "all"}
              >
                Všetci partneri
              </Link>
              {stats.partners.map((p) => (
                <Link
                  key={p}
                  href={qs({ partner: p })}
                  className="filter-pill"
                  data-active={partner === p}
                >
                  {p}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        {devices.length === 0 ? (
          <div className="space-y-3 p-8 text-center">
            <p className="text-lg font-semibold">Zatiaľ žiadne zariadenia</p>
            <p className="text-[var(--ink-soft)]">
              Nastav Balena token a stlač sync, alebo importuj JSON export.
            </p>
          </div>
        ) : (
          <ul>
            {devices.map((d) => (
              <li key={d.uuid}>
                <Link href={`/zariadenia/${d.uuid}`} className="ticket-row">
                  <div className="min-w-[4.5rem]">
                    <div className="font-display text-sm font-bold text-[var(--teal-deep)]">
                      {d.code ? `#${d.code}` : "—"}
                    </div>
                    <div className="mt-1 text-xs text-[var(--ink-soft)]">
                      {d.partner || "—"}
                    </div>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="truncate text-lg font-bold">
                      {d.city || d.name}
                    </div>
                    <div className="truncate text-sm text-[var(--ink-soft)]">
                      {d.address || d.name}
                      {d.phone ? ` · ${d.phone}` : ""}
                    </div>
                    <div className="text-xs text-[var(--ink-soft)]">
                      {hardwareLabel(d.deviceType)} · {d.status}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <span
                      className={`chip ${d.isOnline ? "status-v-rieseni" : "status-hotove"}`}
                    >
                      {d.isOnline ? "Online" : "Offline"}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {stats.total === 0 ? <ImportDevicesPanel /> : null}
    </div>
  );
}
