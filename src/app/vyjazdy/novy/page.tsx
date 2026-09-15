import Link from "next/link";
import { VyjazdStopsEditor } from "@/components/vyjazd-stops-editor";
import { createVyjazdAction } from "@/lib/actions";
import { getDevice, getTicket, listDevices } from "@/lib/store";
import {
  PRIORITY_LABELS,
  VYJAZD_STATUS_LABELS,
  type VyjazdStatus,
} from "@/lib/types";
import { deviceStoreLabel, stopFromDevice } from "@/lib/vyjazd-stops";

type SearchParams = Promise<{ device?: string; ticket?: string }>;

export default async function NewVyjazdPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const preselected = params.device ? await getDevice(params.device) : null;
  const ticket = params.ticket ? await getTicket(params.ticket) : null;
  const devices = await listDevices();

  const options = devices.map((d) => ({
    uuid: d.uuid,
    label: deviceStoreLabel(d) || d.name,
    name: d.name,
    phone: d.phone,
    address: d.address,
    city: d.city,
    code: d.code,
    partner: d.partner,
    isOnline: d.isOnline,
    deviceType: d.deviceType,
  }));

  const linkedDevice =
    preselected ??
    (ticket?.deviceUuid
      ? (devices.find((d) => d.uuid === ticket.deviceUuid) ?? null)
      : null);

  const initialStops = linkedDevice
    ? [
        stopFromDevice(linkedDevice, {
          ticketId: ticket?.id ?? "",
          store:
            deviceStoreLabel(linkedDevice) ||
            ticket?.customerName ||
            linkedDevice.name,
          contactPhone: linkedDevice.phone || ticket?.customerPhone || "",
        }),
      ]
    : ticket
      ? [
          {
            id: `ticket-${ticket.id}`,
            store: ticket.customerName || "Zákazník",
            address: "",
            contactPhone: ticket.customerPhone || "",
            deviceUuid: ticket.deviceUuid || "",
            ticketId: ticket.id,
            done: false,
            note: "",
          },
        ]
      : [];

  const defaultTitle = ticket ? `Výjazd k ticketu: ${ticket.title}` : "";
  const defaultDescription = ticket ? ticket.description : "";

  const statuses = Object.keys(VYJAZD_STATUS_LABELS) as VyjazdStatus[];

  return (
    <div className="shell max-w-3xl space-y-6">
      <div className="fade-up space-y-2">
        <Link
          href="/vyjazdy"
          className="text-sm font-semibold text-[var(--teal)]"
        >
          ← Späť na výjazdy
        </Link>
        <h1 className="text-3xl font-extrabold md:text-4xl">Nový výjazd</h1>
        <p className="text-[var(--ink-soft)]">
          Naplánuj servisný výjazd ako trasu — pridaj prevádzky z katalógu,
          uprav poradie a na detaile ich odtickuj.
        </p>
      </div>

      <form
        action={createVyjazdAction}
        className="panel fade-up space-y-5 p-5 md:p-7"
        style={{ animationDelay: "80ms" }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="field md:col-span-2">
            <label htmlFor="title">Názov výjazdu *</label>
            <input
              id="title"
              name="title"
              required
              defaultValue={defaultTitle}
              placeholder="napr. Výmena zdroja / trasa po predajniach"
            />
          </div>

          <div className="field">
            <label htmlFor="technician">Technik</label>
            <input
              id="technician"
              name="technician"
              placeholder="napr. Peter"
            />
          </div>

          <div className="field">
            <label htmlFor="scheduledAt">Termín výjazdu</label>
            <input
              id="scheduledAt"
              name="scheduledAt"
              type="datetime-local"
            />
          </div>

          <div className="field">
            <label htmlFor="priority">Priorita</label>
            <select id="priority" name="priority" defaultValue="normalna">
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="status">Stav</label>
            <select id="status" name="status" defaultValue="naplanovany">
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {VYJAZD_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <VyjazdStopsEditor initialStops={initialStops} devices={options} />

          <div className="field md:col-span-2">
            <label htmlFor="description">Čo treba spraviť</label>
            <textarea
              id="description"
              name="description"
              defaultValue={defaultDescription}
              placeholder="Popis úlohy, potrebné diely, kontext…"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" className="btn btn-primary">
            Vytvoriť výjazd
          </button>
          <Link href="/vyjazdy" className="btn btn-ghost">
            Zrušiť
          </Link>
        </div>
      </form>
    </div>
  );
}
