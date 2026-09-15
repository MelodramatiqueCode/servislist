import Link from "next/link";
import { notFound } from "next/navigation";
import { DevicePicker } from "@/components/device-ui";
import { DeleteVyjazdButton } from "@/components/vyjazd-ui";
import {
  updateVyjazdAction,
  updateVyjazdStatusAction,
} from "@/lib/actions";
import {
  formatDate,
  formatDateTime,
  priorityClass,
  vyjazdCode,
  vyjazdStatusClass,
} from "@/lib/format";
import { getDevice, getTicket, getVyjazd, listDevices } from "@/lib/store";
import {
  PRIORITY_LABELS,
  VYJAZD_STATUS_LABELS,
  type TicketPriority,
  type VyjazdStatus,
} from "@/lib/types";

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
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const vyjazd = await getVyjazd(id);
  if (!vyjazd) notFound();

  const [linkedDevice, linkedTicket, devices] = await Promise.all([
    vyjazd.deviceUuid ? getDevice(vyjazd.deviceUuid) : Promise.resolve(null),
    vyjazd.ticketId ? getTicket(vyjazd.ticketId) : Promise.resolve(null),
    listDevices(),
  ]);

  const options = devices.map((d) => ({
    uuid: d.uuid,
    label:
      [d.code && `#${d.code}`, d.partner, d.city || d.name]
        .filter(Boolean)
        .join(" · ") || d.name,
    name: d.name,
    phone: d.phone,
    isOnline: d.isOnline,
    deviceType: d.deviceType,
  }));

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
        </div>
        <h1 className="text-3xl font-extrabold leading-tight md:text-4xl">
          {vyjazd.title}
        </h1>
        <p className="text-sm text-[var(--ink-soft)]">
          Vytvorené {formatDate(vyjazd.createdAt)} · Aktualizované{" "}
          {formatDate(vyjazd.updatedAt)} · Termín{" "}
          {formatDateTime(vyjazd.scheduledAt)}
        </p>
        {saved ? (
          <p className="chip chip-ok">Zmeny uložené ✓</p>
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
            <input type="hidden" name="ticketId" value={vyjazd.ticketId} />
            <input type="hidden" name="status" value={vyjazd.status} />

            <div className="grid gap-4 md:grid-cols-2">
              <DevicePicker devices={options} selectedUuid={vyjazd.deviceUuid} />

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
                <label htmlFor="store">Predajňa / zákazník *</label>
                <input
                  id="store"
                  name="store"
                  required
                  defaultValue={vyjazd.store}
                />
              </div>

              <div className="field">
                <label htmlFor="address">Adresa</label>
                <input
                  id="address"
                  name="address"
                  defaultValue={vyjazd.address}
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
                <label htmlFor="contactPhone">Kontakt / telefón</label>
                <input
                  id="contactPhone"
                  name="contactPhone"
                  defaultValue={vyjazd.contactPhone}
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
                <label htmlFor="result">Výsledok výjazdu</label>
                <textarea
                  id="result"
                  name="result"
                  defaultValue={vyjazd.result}
                  placeholder="Čo sa na mieste spravilo, čo ešte treba…"
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
              Rýchla zmena stavu — naplánovaný → prebieha → hotový.
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
                    {VYJAZD_STATUS_LABELS[status]}
                  </button>
                </form>
              ))}
            </div>
          </div>

          <div className="panel space-y-3 p-5">
            <h2 className="text-lg font-bold">Odkazy</h2>
            {linkedDevice ? (
              <div className="rounded-xl border border-[var(--line)] bg-white/60 px-3.5 py-3">
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
            ) : (
              <p className="text-sm text-[var(--ink-soft)]">
                Bez naviazaného zariadenia. Vyber ho v editore vľavo.
              </p>
            )}
            {linkedTicket ? (
              <Link
                href={`/ticket/${linkedTicket.id}`}
                className="btn btn-ghost w-full"
              >
                Súvisiaci ticket ↗
              </Link>
            ) : null}
          </div>

          <div className="panel space-y-3 p-5">
            <h2 className="text-lg font-bold">Nebezpečná zóna</h2>
            <DeleteVyjazdButton id={vyjazd.id} />
          </div>
        </aside>
      </div>
    </div>
  );
}
