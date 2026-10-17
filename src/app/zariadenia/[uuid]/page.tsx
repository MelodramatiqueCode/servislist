import Link from "next/link";
import { notFound } from "next/navigation";
import {
  hardwareLabel,
  hasHealthAlert,
  memoryLabel,
  storageLabel,
} from "@/lib/parse-device";
import { TICKET_ALERT_LABELS } from "@/lib/alerts";
import { deviceEventCounts } from "@/lib/alert-state";
import { formatDate, formatDuration, statusClass, ticketCode } from "@/lib/format";
import { getDevice, listDeviceAlertEvents, listTickets } from "@/lib/store";
import { STATUS_LABELS, type DeviceEventOutcome } from "@/lib/types";

const EVENT_OUTCOME_LABELS: Record<DeviceEventOutcome, string> = {
  open: "prebieha",
  short: "krátky",
  ticketed: "ticket",
  outside_hours: "mimo hodín",
  mass: "hromadný",
  recovered: "odznel",
  flap: "flap",
  ignored: "testovacie (ignorované)",
  long_offline: "dlhodobo offline",
  archived: "už archivovaný ticket",
};

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const [device, tickets, events] = await Promise.all([
    getDevice(uuid),
    listTickets({ deviceUuid: uuid }),
    listDeviceAlertEvents(uuid, 7),
  ]);
  if (!device) notFound();
  const counts = deviceEventCounts(events, 7);
  const alert = hasHealthAlert(device);

  return (
    <div className="shell detail-page max-w-4xl space-y-8">
      <div className="fade-up space-y-3">
        <Link
          href="/zariadenia"
          className="text-sm font-semibold text-[var(--teal)]"
        >
          ← Späť na zariadenia
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display text-sm font-bold text-[var(--teal-deep)]">
            {device.code ? `#${device.code}` : device.uuid.slice(0, 8)}
          </span>
          <span
            className={`chip ${device.isOnline ? "status-v-rieseni" : "status-hotove"}`}
          >
            {device.isOnline ? "Online" : "Offline"}
          </span>
          <span className="chip prio-normalna">
            {device.overallStatus || device.status}
          </span>
          {device.isUndervolted ? (
            <span className="chip prio-urgentna">Undervoltage</span>
          ) : null}
          {alert && device.isOnline && !device.isUndervolted ? (
            <span className="chip prio-vysoka">Pozor na zdravie</span>
          ) : null}
        </div>
        <h1 className="text-3xl font-extrabold md:text-4xl">
          {device.city || device.name}
        </h1>
        <p className="text-[var(--ink-soft)]">{device.name}</p>
      </div>

      <div className="grid gap-5 md:grid-cols-[1.3fr_0.9fr]">
        <section className="panel fade-up space-y-5 p-5 md:p-6">
          <div>
            <h2 className="mb-3 text-lg font-bold">Údaje predajne</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label="Partner" value={device.partner || "—"} />
              <Info label="Mesto" value={device.city || "—"} />
              <Info label="Adresa" value={device.address || "—"} />
              <Info label="Telefón" value={device.phone || "—"} />
              <Info label="Hardware" value={hardwareLabel(device.deviceType)} />
              <Info label="Fleet" value={device.fleet} />
              <Info label="OS" value={device.osVersion || "—"} />
              <Info label="Supervisor" value={device.supervisorVersion || "—"} />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-bold">Live telemetria</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Info
                label="Posledné spojenie"
                value={
                  device.lastConnectivityEvent
                    ? formatDate(device.lastConnectivityEvent)
                    : "—"
                }
              />
              <Info
                label="VPN"
                value={
                  device.isConnectedToVpn
                    ? "Pripojené"
                    : device.lastVpnEvent
                      ? `Nepripojené · ${formatDate(device.lastVpnEvent)}`
                      : "Nepripojené"
                }
              />
              <Info label="Heartbeat" value={device.apiHeartbeat || "—"} />
              <Info
                label="Undervoltage"
                value={device.isUndervolted ? "Áno — skontroluj napájanie" : "Nie"}
              />
              <Info
                label="CPU"
                value={
                  device.cpuUsage != null
                    ? `${Math.round(device.cpuUsage)} %`
                    : "—"
                }
              />
              <Info
                label="Teplota CPU"
                value={
                  device.cpuTemp != null
                    ? `${Math.round(device.cpuTemp)} °C`
                    : "—"
                }
              />
              <Info label="RAM" value={memoryLabel(device)} />
              <Info label="Disk" value={storageLabel(device)} />
              <Info label="Lokálna IP" value={device.ipAddress || "—"} />
              <Info label="Verejná IP" value={device.publicAddress || "—"} />
              <Info label="MAC" value={device.macAddress || "—"} />
            </div>
          </div>

          {device.note ? (
            <div className="note">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
                Poznámka v Balena
              </div>
              <p className="whitespace-pre-wrap">{device.note}</p>
            </div>
          ) : null}

          <div className="rounded-xl border border-[var(--line)] bg-white/60 px-3.5 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
              UUID
            </div>
            <div className="mt-1 break-all font-mono text-sm">{device.uuid}</div>
          </div>
          <a
            href={device.dashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost"
          >
            Otvoriť Balena dashboard ↗
          </a>
        </section>

        <aside className="fade-up space-y-4" style={{ animationDelay: "80ms" }}>
          <div className="panel space-y-4 p-5">
            <h2 className="text-lg font-bold">Servis</h2>
            <p className="text-sm text-[var(--ink-soft)]">
              Založ ticket priamo na toto zariadenie.
            </p>
            <Link
              href={`/novy?device=${device.uuid}`}
              className="btn btn-primary w-full"
            >
              + Nový problém
            </Link>
            <Link
              href={`/vyjazdy/novy?device=${device.uuid}`}
              className="btn btn-ghost w-full"
            >
              + Naplánovať výjazd
            </Link>
          </div>

          <div className="panel space-y-3 p-5">
            <h2 className="text-lg font-bold">História alertov</h2>
            <p className="text-sm text-[var(--ink-soft)]">
              Krátke výpadky ostávajú tu, nie v zozname ticketov.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="chip chip-compact">
                offline {counts.offline ?? 0}× za 7 dní
              </span>
              <span className="chip chip-compact">
                Horúce CPU {counts.hot ?? 0}×
              </span>
              <span className="chip chip-compact">
                Undervolt {counts.undervolt ?? 0}×
              </span>
            </div>
            {events.length === 0 ? (
              <p className="text-sm text-[var(--ink-soft)]">
                Za 7 dní žiadna epizóda.
              </p>
            ) : (
              <ul className="space-y-2">
                {events.slice(0, 20).map((event) => (
                  <li
                    key={event.id}
                    className="rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm"
                  >
                    <div className="font-semibold">
                      {TICKET_ALERT_LABELS[event.alertType] ?? event.alertType}
                      <span className="ml-2 font-normal text-[var(--ink-soft)]">
                        {EVENT_OUTCOME_LABELS[event.outcome]}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--ink-soft)]">
                      {formatDate(event.startedAt)}
                      {event.endedAt ? ` → ${formatDate(event.endedAt)}` : " · prebieha"}
                      {` · ${formatDuration(event.durationSeconds)}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel space-y-3 p-5">
            <h2 className="text-lg font-bold">Tickety ({tickets.length})</h2>
            {tickets.length === 0 ? (
              <p className="text-sm text-[var(--ink-soft)]">
                Zatiaľ žiadne tickety pre toto zariadenie.
              </p>
            ) : (
              <ul className="space-y-2">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/ticket/${t.id}`}
                      className="block rounded-xl border border-[var(--line)] px-3 py-2.5 hover:bg-[rgba(15,107,92,0.05)]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">
                          {ticketCode(t.number)} · {t.title}
                        </span>
                        <span className={`chip ${statusClass(t.status)}`}>
                          {STATUS_LABELS[t.status]}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-[var(--ink-soft)]">
                        {formatDate(t.updatedAt)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
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
