import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteVyjazdButton, MergeVyjazdForm } from "@/components/vyjazd-ui";
import { VyjazdStopsEditor } from "@/components/vyjazd-stops-editor";
import { MapsNavLink } from "@/components/maps-nav-link";
import {
  updateVyjazdAction,
  updateVyjazdStatusAction,
  recalcVyjazdRouteAction,
} from "@/lib/actions";
import {
  formatDate,
  formatDateTime,
  priorityClass,
  vyjazdCode,
  vyjazdStatusClass,
} from "@/lib/format";
import {
  getDevice,
  getTicket,
  getVyjazd,
  listDevices,
  listMergeableVyjazdy,
} from "@/lib/store";
import {
  PRIORITY_LABELS,
  VYJAZD_STATUS_LABELS,
  type TicketPriority,
  type VyjazdStatus,
} from "@/lib/types";
import {
  liveRouteError,
  liveRouteLabel,
  mappedRouteStopCount,
} from "@/lib/route-estimate";
import {
  allStopsDone,
  canMergeVyjazdStatus,
  deviceStoreLabel,
  doneStopCount,
  prevadzkyCountLabel,
  routeNavigationUrl,
  stopNavigationUrl,
  storeSummary,
} from "@/lib/vyjazd-stops";

const STATUSES = Object.keys(VYJAZD_STATUS_LABELS) as VyjazdStatus[];
const PRIORITIES = Object.keys(PRIORITY_LABELS) as TicketPriority[];

function toLocalInput(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default async function VyjazdEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; merged?: string; routed?: string }>;
}) {
  const { id } = await params;
  const { saved, merged, routed } = await searchParams;
  const vyjazd = await getVyjazd(id);
  if (!vyjazd) notFound();

  const [devices, mergeCandidates] = await Promise.all([
    listDevices(),
    canMergeVyjazdStatus(vyjazd.status)
      ? listMergeableVyjazdy(vyjazd.id)
      : Promise.resolve([]),
  ]);
  const options = devices.map((d) => ({
    uuid: d.uuid,
    label: deviceStoreLabel(d) || d.name,
    name: d.name,
    phone: d.phone,
    address: d.address,
    isOnline: d.isOnline,
    deviceType: d.deviceType,
  }));

  const linkedDevices = await Promise.all(
    [...new Set(vyjazd.stops.map((s) => s.deviceUuid).filter(Boolean))].map(
      (uuid) => getDevice(uuid),
    ),
  );
  const linkedTickets = await Promise.all(
    [...new Set(vyjazd.stops.map((s) => s.ticketId).filter(Boolean))].map(
      (ticketId) => getTicket(ticketId),
    ),
  );

  const done = doneStopCount(vyjazd.stops);
  const complete = allStopsDone(vyjazd.stops);
  const routeUrl = routeNavigationUrl(vyjazd.stops);
  const singleNavUrl =
    routeUrl ?? stopNavigationUrl(vyjazd.stops[0] ?? {});
  const routeLabel = liveRouteLabel(vyjazd);
  const routeError = liveRouteError(vyjazd);
  const canEstimateRoute = mappedRouteStopCount(vyjazd.stops) >= 2;

  return (
    <div className="shell max-w-4xl space-y-6">
      <div className="fade-up space-y-3">
        <Link
          href="/vyjazdy"
          className="text-sm font-semibold text-[var(--teal)]"
        >
          ← Späť na výjazdy
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display text-sm font-bold text-[var(--teal-deep)]">
            {vyjazdCode(vyjazd.number)}
          </span>
          <span className={`chip ${vyjazdStatusClass(vyjazd.status)}`}>
            {VYJAZD_STATUS_LABELS[vyjazd.status]}
          </span>
          <span className={`chip ${priorityClass(vyjazd.priority)}`}>
            {PRIORITY_LABELS[vyjazd.priority]}
          </span>
          <span className="chip chip-warn">
            {prevadzkyCountLabel(vyjazd.stops.length)}
          </span>
          {routeUrl ? (
            <MapsNavLink href={routeUrl} className="btn btn-ghost">
              Navigácia trasy ↗
            </MapsNavLink>
          ) : singleNavUrl ? (
            <MapsNavLink href={singleNavUrl} className="btn btn-ghost">
              Navigácia ↗
            </MapsNavLink>
          ) : null}
          {canMergeVyjazdStatus(vyjazd.status) ? (
            <a href="#spojit" className="chip chip-warn">
              Spojiť
            </a>
          ) : null}
        </div>
        {canEstimateRoute ? (
          <div className="flex flex-wrap items-center gap-3">
            {routeLabel ? (
              <p className="text-base font-semibold text-[var(--ink)]">
                {routeLabel}
              </p>
            ) : routeError ? (
              <p className="text-sm text-[var(--danger)]">{routeError}</p>
            ) : (
              <p className="text-sm text-[var(--ink-soft)]">
                Odhad km / času sa spočíta po uložení alebo prepočte trasy.
              </p>
            )}
            <form action={recalcVyjazdRouteAction}>
              <input type="hidden" name="id" value={vyjazd.id} />
              <button type="submit" className="btn btn-ghost">
                Prepočítať trasu
              </button>
            </form>
            <p className="text-xs text-[var(--ink-soft)]">
              Približne, podľa OpenStreetMap (Nominatim + OSRM).
            </p>
          </div>
        ) : vyjazd.stops.length > 1 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            Doplň aspoň dve adresy, aby sa dala spočítať vzdialenosť a čas.
          </p>
        ) : null}
        <h1 className="text-3xl font-extrabold leading-tight md:text-4xl">
          {vyjazd.title}
        </h1>
        <p className="text-sm text-[var(--ink-soft)]">
          Vytvorené {formatDate(vyjazd.createdAt)} · Aktualizované{" "}
          {formatDate(vyjazd.updatedAt)} · Termín{" "}
          {formatDateTime(vyjazd.scheduledAt)}
          {vyjazd.stops.length > 0
            ? ` · Ticknuté ${done} / ${vyjazd.stops.length}`
            : ""}
        </p>
        {saved ? <p className="chip chip-ok">Zmeny uložené ✓</p> : null}
        {merged ? (
          <p className="chip chip-ok">Výjazdy spojené ✓ Druhý ostal zrušený.</p>
        ) : null}
        {routed ? (
          <p className="chip chip-ok">
            {routeLabel
              ? `Trasa prepočítaná ✓ ${routeLabel.replace(/^Trasa\s+/, "")}`
              : routeError || "Trasa prepočítaná."}
          </p>
        ) : null}
        {complete && vyjazd.status !== "hotovy" && vyjazd.status !== "zruseny" ? (
          <p className="chip chip-ok">
            Všetky prevádzky sú ticknuté — stav sa nastaví na Hotový.
          </p>
        ) : null}
      </div>

      <div className="grid gap-5 md:grid-cols-[1.4fr_0.9fr]">
        <section
          className="panel fade-up space-y-5 p-5 md:p-6"
          style={{ animationDelay: "60ms" }}
        >
          <h2 className="text-lg font-bold">Editor výjazdu</h2>
          <form action={updateVyjazdAction} className="space-y-4">
            <input type="hidden" name="id" value={vyjazd.id} />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="field md:col-span-2">
                <label htmlFor="title">Názov výjazdu *</label>
                <input
                  id="title"
                  name="title"
                  required
                  defaultValue={vyjazd.title}
                />
              </div>

              <div className="field">
                <label htmlFor="technician">Technik</label>
                <input
                  id="technician"
                  name="technician"
                  defaultValue={vyjazd.technician}
                />
              </div>

              <div className="field">
                <label htmlFor="scheduledAt">Termín výjazdu</label>
                <input
                  id="scheduledAt"
                  name="scheduledAt"
                  type="datetime-local"
                  defaultValue={toLocalInput(vyjazd.scheduledAt)}
                />
              </div>

              <div className="field">
                <label htmlFor="priority">Priorita</label>
                <select
                  id="priority"
                  name="priority"
                  defaultValue={vyjazd.priority}
                >
                  {PRIORITIES.map((value) => (
                    <option key={value} value={value}>
                      {PRIORITY_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>

              <VyjazdStopsEditor
                initialStops={vyjazd.stops}
                devices={options}
                vyjazdId={vyjazd.id}
                allowTick
                vyjazdStatus={vyjazd.status}
              />

              <div className="field md:col-span-2">
                <label htmlFor="description">Čo treba spraviť</label>
                <textarea
                  id="description"
                  name="description"
                  defaultValue={vyjazd.description}
                  placeholder="Popis úlohy, potrebné diely, kontext…"
                />
              </div>

              <div className="field md:col-span-2">
                <label htmlFor="result">Súhrnný výsledok výjazdu</label>
                <textarea
                  id="result"
                  name="result"
                  defaultValue={vyjazd.result}
                  placeholder="Čo sa na trase spravilo, čo ešte treba…"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              <button type="submit" className="btn btn-primary">
                Uložiť zmeny
              </button>
              <Link href="/vyjazdy" className="btn btn-ghost">
                Späť
              </Link>
            </div>
          </form>
        </section>

        <aside
          className="fade-up space-y-4"
          style={{ animationDelay: "120ms" }}
        >
          <div className="panel space-y-4 p-5">
            <h2 className="text-lg font-bold">Stav výjazdu</h2>
            <p className="text-sm text-[var(--ink-soft)]">
              Ticknutie na zastávke: prvé → Prebieha, všetky → Hotový.
              Tlačidlo Hotový označí všetky zastávky ako ticknuté.
            </p>
            <div className="flex flex-col gap-2">
              {STATUSES.map((status) => (
                <form key={status} action={updateVyjazdStatusAction}>
                  <input type="hidden" name="id" value={vyjazd.id} />
                  <input type="hidden" name="status" value={status} />
                  <button
                    type="submit"
                    className={`btn w-full ${
                      vyjazd.status === status ? "btn-primary" : "btn-ghost"
                    }`}
                  >
                    {status === "hotovy"
                      ? "Hotový (ticknúť všetky)"
                      : VYJAZD_STATUS_LABELS[status]}
                  </button>
                </form>
              ))}
            </div>
          </div>

          <div className="panel space-y-3 p-5">
            <h2 className="text-lg font-bold">Odkazy</h2>
            {linkedDevices.filter(Boolean).length === 0 ? (
              <p className="text-sm text-[var(--ink-soft)]">
                Bez naviazaného zariadenia. Pridaj prevádzku z katalógu v
                editore.
              </p>
            ) : (
              linkedDevices.map((linkedDevice) =>
                linkedDevice ? (
                  <div
                    key={linkedDevice.uuid}
                    className="rounded-xl border border-[var(--line)] bg-white/60 px-3.5 py-3"
                  >
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
                        Balena ↗
                      </a>
                    </div>
                  </div>
                ) : null,
              )
            )}
            {linkedTickets.map((linkedTicket) =>
              linkedTicket ? (
                <Link
                  key={linkedTicket.id}
                  href={`/ticket/${linkedTicket.id}`}
                  className="btn btn-ghost w-full"
                >
                  Ticket {linkedTicket.title} ↗
                </Link>
              ) : null,
            )}
          </div>

          {canMergeVyjazdStatus(vyjazd.status) ? (
            <div id="spojit" className="panel scroll-mt-24 space-y-3 p-5">
              <h2 className="text-lg font-bold">Spojiť výjazdy</h2>
              <p className="text-sm text-[var(--ink-soft)]">
                Tento výjazd je primárny: názov, technik a termín ostanú odtiaľto
                (prázdne polia sa doplnia z druhého). Zastávky druhého výjazdu sa
                pridajú na koniec; rovnaké zariadenie, ticket alebo
                prevádzka+adresa sa zlúčia. Druhý výjazd sa nezmaže — ostane
                zrušený s poznámkou „Spojené do {vyjazdCode(vyjazd.number)}“.
                Priorita bude vyššia z oboch.
              </p>
              <MergeVyjazdForm
                primaryId={vyjazd.id}
                primaryNumber={vyjazd.number}
                primaryTitle={vyjazd.title}
                candidates={mergeCandidates.map((candidate) => ({
                  id: candidate.id,
                  number: candidate.number,
                  title: candidate.title,
                  store: storeSummary(candidate),
                  status: candidate.status,
                  stopCount: candidate.stops.length,
                }))}
              />
            </div>
          ) : null}

          <div className="panel space-y-3 p-5">
            <h2 className="text-lg font-bold">Nebezpečná zóna</h2>
            <DeleteVyjazdButton id={vyjazd.id} />
          </div>
        </aside>
      </div>
    </div>
  );
}
