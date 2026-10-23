import Link from "next/link";
import { ImportDevicesPanel, SyncBalenaButton } from "@/components/device-ui";
import { getAlertConfig } from "@/lib/alert-config";
import { isTestDevice, offlineDays } from "@/lib/alert-suppress";
import { getBalenaConfig } from "@/lib/balena";
import {
  formatPercent,
  hardwareLabel,
  hasHealthAlert,
  isDiskFull,
  isLongOfflineDevice,
  isHot,
  type DeviceHealthFilter,
} from "@/lib/parse-device";
import { showBezVpn } from "@/lib/device-lifecycle";
import { getDeviceStats, listDevices } from "@/lib/store";
import { StatCard } from "@/components/stat-card";

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
  { id: "long_offline", label: "Dlhodobo offline" },
  { id: "test", label: "Testovacie" },
  { id: "removed", label: "Odstránené z Baleny" },
];

function storeCountLabel(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} prevádzka`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} prevádzky`;
  }
  return `${n} prevádzok`;
}

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

  const [devices, stats] = await Promise.all([
    listDevices({ q, health }),
    getDeviceStats(),
  ]);

  const fleetSlug = getBalenaConfig()?.fleetSlug || "ceo2/massiva";
  const alertConfig = getAlertConfig();
  const now = new Date();

  const healthCount = (id: DeviceHealthFilter) => {
    if (id === "all") return stats.total;
    if (id === "online") return stats.online;
    if (id === "offline") return stats.offline;
    if (id === "undervolt") return stats.undervolt;
    if (id === "hot") return stats.hot;
    if (id === "disk") return stats.disk;
    if (id === "vpn_down") return stats.vpnDown;
    if (id === "alerts") return stats.alerts;
    if (id === "long_offline") return stats.longOffline;
    if (id === "test") return stats.test;
    if (id === "removed") return stats.removed;
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
    <div className="shell page-stack space-y-6">
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
        <StatCard href={qs({ health: "all" })} className="stat" active={health === "all"}>
          <span className="text-sm text-[var(--ink-soft)]">Celkom</span>
          <strong>{stats.total}</strong>
        </StatCard>
        <StatCard href={qs({ health: "online" })} className="stat" active={health === "online"}>
          <span className="text-sm text-[var(--ink-soft)]">Online</span>
          <strong>{stats.online}</strong>
        </StatCard>
        <StatCard href={qs({ health: "offline" })} className="stat" active={health === "offline"}>
          <span className="text-sm text-[var(--ink-soft)]">Offline</span>
          <strong>{stats.offline}</strong>
        </StatCard>
        <StatCard href={qs({ health: "undervolt" })} className="stat" active={health === "undervolt"}>
          <span className="text-sm text-[var(--ink-soft)]">Undervolt</span>
          <strong className={stats.undervolt > 0 ? "text-[var(--acc)]" : ""}>
            {stats.undervolt}
          </strong>
        </StatCard>
        <StatCard href={qs({ health: "hot" })} className="stat" active={health === "hot"}>
          <span className="text-sm text-[var(--ink-soft)]">Horúce</span>
          <strong className={stats.hot > 0 ? "text-[var(--danger)]" : ""}>
            {stats.hot}
          </strong>
        </StatCard>
        <StatCard href={qs({ health: "alerts" })} className="stat" active={health === "alerts"}>
          <span className="text-sm text-[var(--ink-soft)]">Alerty</span>
          <strong className={stats.alerts > 0 ? "text-[var(--danger)]" : ""}>
            {stats.alerts}
          </strong>
        </StatCard>
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

          <div className="flex flex-wrap items-center gap-1.5">
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

          <p className="text-sm text-[var(--ink-soft)]">
            Zobrazených{" "}
            <strong className="text-[var(--ink)]">
              {storeCountLabel(devices.length)}
            </strong>
            {q.trim() || (health && health !== "all") ? " podľa filtra" : ""}
            {q.trim() ? ` „${q.trim()}“` : ""}
            {stats.total > 0 && devices.length !== stats.total
              ? ` z ${stats.total}`
              : ""}
            .
          </p>
        </div>

        {health === "long_offline" ? (
          <p className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--ink-soft)] md:px-4">
            Zariadenia offline dlhšie ako {alertConfig.longOfflineDays} dní
            (podľa poslednej konektivity v Balene). Nové Offline tickety
            nevytvárajú — keď sa vrátia online a znova padnú, ticket vznikne
            normálne.
          </p>
        ) : null}
        {health === "removed" ? (
          <p className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--ink-soft)] md:px-4">
            Zariadenia, ktoré Balena už nevracia. Ostávajú v archíve — história,
            tickety a výkaz sa nemažú. Do offline štatistík a auto-ticketov sa
            nepočítajú.
          </p>
        ) : null}
        {health === "test" ? (
          <p className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--ink-soft)] md:px-4">
            Testovacie zariadenia (Demo, Balena predvolené názvy typu
            „quiet-engine“, alebo ALERT_IGNORE_DEVICES) — nikdy netvoria auto
            tickety.
          </p>
        ) : null}

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
              const longOffline = isLongOfflineDevice(d, now);
              const daysOff = offlineDays(d, now);
              const testDevice = isTestDevice(d, alertConfig.ignoreDevices);
              return (
                <Link
                  key={d.uuid}
                  href={`/zariadenia/${d.uuid}`}
                  className="flex items-center gap-2 px-3 py-1.5 transition hover:bg-[var(--paper-2)] md:gap-3 md:px-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <strong className="truncate text-sm font-semibold md:text-[0.95rem]">
                        {d.name}
                      </strong>
                      <span
                        className={`chip chip-compact ${d.isOnline ? "chip-ok" : "chip-danger"}`}
                      >
                        {d.isOnline ? (
                          <>
                            <span className="pulse" />
                            Online
                          </>
                        ) : (
                          "Offline"
                        )}
                      </span>
                      {longOffline && daysOff != null ? (
                        <span className="chip chip-compact chip-warn">
                          Dlhodobo offline · {Math.floor(daysOff)} dní
                        </span>
                      ) : null}
                      {d.removedFromBalenaAt ? (
                        <span className="chip chip-compact">Odstránené z Baleny</span>
                      ) : null}
                      {d.replacedByUuid ? (
                        <span className="chip chip-compact">Nahradené</span>
                      ) : null}
                      {testDevice ? (
                        <span className="chip chip-compact">Testovacie</span>
                      ) : null}
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
                      {d.isOnline && showBezVpn(d) ? (
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
