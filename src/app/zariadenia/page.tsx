import Link from "next/link";
import { ImportDevicesPanel, SyncBalenaButton } from "@/components/device-ui";
import { getBalenaConfig } from "@/lib/balena";
import {
  formatPercent,
  hardwareLabel,
  hasHealthAlert,
  isDiskFull,
  isHot,
  type DeviceHealthFilter,
} from "@/lib/parse-device";
import {
  ensureFreshBalenaSync,
  getDeviceStats,
  listDevices,
} from "@/lib/store";

type SearchParams = Promise<{
  q?: string;
  health?: string;
  online?: string;
}>;

const HEALTH_OPTIONS: { id: DeviceHealthFilter; label: string }[] = [
  { id: "all", label: "Všetky" },
  { id: "online", label: "Online" },
  { id: "offline", label: "Offline" },
  { id: "undervolt", label: "Undervolt" },
  { id: "hot", label: "Horúce" },
  { id: "disk", label: "Disk plný" },
  { id: "vpn_down", label: "Bez VPN" },
  { id: "alerts", label: "Všetky alerty" },
];

function parseHealth(params: {
  health?: string;
  online?: string;
}): DeviceHealthFilter {
  const allowed = new Set(HEALTH_OPTIONS.map((o) => o.id));
  if (params.health && allowed.has(params.health as DeviceHealthFilter)) {
    return params.health as DeviceHealthFilter;
  }
  if (params.online === "online" || params.online === "offline") {
    return params.online;
  }
  return "all";
}

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const health = parseHealth(params);

  await ensureFreshBalenaSync();

  const [devices, stats] = await Promise.all([
    listDevices({ q, health }),
    getDeviceStats(),
  ]);

  const fleetSlug = getBalenaConfig()?.fleetSlug || "ceo2/massiva";

  const healthCount = (id: DeviceHealthFilter) => {
    if (id === "all") return stats.total;
    if (id === "online") return stats.online;
    if (id === "offline") return stats.offline;
    if (id === "undervolt") return stats.undervolt;
    if (id === "hot") return stats.hot;
    if (id === "disk") return stats.disk;
    if (id === "vpn_down") return stats.vpnDown;
    if (id === "alerts") return stats.alerts;
    return 0;
  };

  const qs = (next: Record<string, string>) => {
    const sp = new URLSearchParams();
    const merged = { q, health, ...next };
    if (merged.q) sp.set("q", merged.q);
    if (merged.health && merged.health !== "all") {
      sp.set("health", merged.health);
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
          Predajne a Raspberry Pi z flotily. Live online stav a health filtre.
        </p>
      </section>

      <SyncBalenaButton
        configured={stats.configured}
        syncedAt={stats.syncedAt}
        fleetSlug={fleetSlug}
        lastSyncError={stats.lastSyncError}
      />

      <section
        className="fade-up grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
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
          <span className="text-sm text-[var(--ink-soft)]">Undervolt</span>
          <strong className={stats.undervolt > 0 ? "text-[var(--warn)]" : ""}>
            {stats.undervolt}
          </strong>
        </div>
        <div className="stat">
          <span className="text-sm text-[var(--ink-soft)]">Horúce</span>
          <strong className={stats.hot > 0 ? "text-[var(--danger)]" : ""}>
            {stats.hot}
          </strong>
        </div>
        <div className="stat">
          <span className="text-sm text-[var(--ink-soft)]">Alerty</span>
          <strong className={stats.alerts > 0 ? "text-[var(--danger)]" : ""}>
            {stats.alerts}
          </strong>
        </div>
      </section>

      <section
        className="panel fade-up overflow-hidden"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-3 md:p-4">
          <form className="flex w-full flex-col gap-2 md:flex-row">
            <input type="hidden" name="health" value={health ?? "all"} />
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

          <div className="flex flex-wrap gap-1.5">
            {HEALTH_OPTIONS.map((opt) => {
              const count = healthCount(opt.id);
              const active = health === opt.id;
              return (
                <Link
                  key={String(opt.id)}
                  href={qs({ health: opt.id ?? "all" })}
                  className={`chip ${active ? "chip-active" : ""}`}
                >
                  {opt.label}
                  <span className="opacity-70">({count})</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="divide-y divide-[var(--line)]">
          {devices.length === 0 ? (
            <div className="space-y-4 p-8 text-center text-[var(--ink-soft)]">
              <p>Žiadne zariadenia podľa filtra.</p>
              <ImportDevicesPanel />
            </div>
          ) : (
            devices.map((d) => {
              const alert = hasHealthAlert(d);
              const meta = [d.city, d.partner, d.code].filter(Boolean).join(" · ");
              return (
                <Link
                  key={d.uuid}
                  href={`/zariadenia/${d.uuid}`}
                  className="flex items-center gap-2 px-3 py-1.5 transition hover:bg-[var(--sand)] md:gap-3 md:px-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <strong className="truncate text-sm font-semibold md:text-[0.95rem]">
                        {d.name}
                      </strong>
                      <span
                        className={`chip chip-compact ${d.isOnline ? "chip-ok" : "chip-danger"}`}
                      >
                        {d.isOnline ? "Online" : "Offline"}
                      </span>
                      {d.isUndervolted ? (
                        <span className="chip chip-compact chip-warn">
                          Undervolt
                        </span>
                      ) : null}
                      {isHot(d) ? (
                        <span className="chip chip-compact chip-danger">
                          {Math.round(d.cpuTemp!)}°C
                        </span>
                      ) : null}
                      {isDiskFull(d) ? (
                        <span className="chip chip-compact chip-warn">
                          Disk {formatPercent(d.storageUsage, d.storageTotal)}
                        </span>
                      ) : null}
                      {d.isOnline && !d.isConnectedToVpn ? (
                        <span className="chip chip-compact chip-warn">
                          Bez VPN
                        </span>
                      ) : null}
                      {alert &&
                      !d.isUndervolted &&
                      !isHot(d) &&
                      !isDiskFull(d) ? (
                        <span className="chip chip-compact chip-warn">
                          Alert
                        </span>
                      ) : null}
                    </div>
                    {meta ? (
                      <p className="truncate text-xs text-[var(--ink-soft)]">
                        {meta}
                      </p>
                    ) : null}
                  </div>
                  <div className="hidden shrink-0 text-right text-xs text-[var(--ink-soft)] sm:block">
                    <div>{hardwareLabel(d.deviceType)}</div>
                    <div className="font-mono opacity-70">
                      {d.uuid.slice(0, 8)}…
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
