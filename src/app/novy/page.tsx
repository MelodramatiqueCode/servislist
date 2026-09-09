import Link from "next/link";
import { DevicePicker } from "@/components/device-ui";
import { createTicketAction } from "@/lib/actions";
import { hardwareLabel } from "@/lib/parse-device";
import { getDevice, listDevices } from "@/lib/store";
import { DEVICE_TYPES, PRIORITY_LABELS } from "@/lib/types";

type SearchParams = Promise<{ device?: string }>;

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const preselected = params.device
    ? await getDevice(params.device)
    : null;
  const devices = await listDevices();

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

  const defaultCustomer = preselected
    ? [preselected.code && `#${preselected.code}`, preselected.partner, preselected.city]
        .filter(Boolean)
        .join(" · ") || preselected.name
    : "";

  return (
    <div className="shell max-w-3xl space-y-6">
      <div className="fade-up space-y-2">
        <Link href="/" className="text-sm font-semibold text-[var(--teal)]">
          ← Späť na tickety
        </Link>
        <h1 className="text-3xl font-extrabold md:text-4xl">Nový problém</h1>
        <p className="text-[var(--ink-soft)]">
          Vyber predajňu/zariadenie z Balena flotily alebo vyplň ručne.
        </p>
      </div>

      <form
        action={createTicketAction}
        className="panel fade-up space-y-5 p-5 md:p-7"
        style={{ animationDelay: "80ms" }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <DevicePicker
            devices={options}
            selectedUuid={preselected?.uuid ?? ""}
          />

          <div className="field md:col-span-2">
            <label htmlFor="title">Názov problému *</label>
            <input
              id="title"
              name="title"
              required
              placeholder="napr. Pi offline / displej nereaguje"
            />
          </div>

          <div className="field md:col-span-2">
            <label htmlFor="description">Popis *</label>
            <textarea
              id="description"
              name="description"
              required
              placeholder="Čo sa deje, kedy to začalo, čo už bolo skúšané…"
            />
          </div>

          <div className="field">
            <label htmlFor="deviceType">Typ zariadenia *</label>
            <select
              id="deviceType"
              name="deviceType"
              required
              defaultValue={
                preselected
                  ? hardwareLabel(preselected.deviceType)
                  : "Raspberry Pi (Balena)"
              }
            >
              {DEVICE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="deviceSerial">UUID / sériové číslo</label>
            <input
              id="deviceSerial"
              name="deviceSerial"
              defaultValue={preselected?.uuid ?? ""}
              placeholder="Balena UUID"
            />
          </div>

          <div className="field">
            <label htmlFor="customerName">Predajňa / zákazník *</label>
            <input
              id="customerName"
              name="customerName"
              required
              defaultValue={defaultCustomer}
              placeholder="Mesto / kód predajne"
            />
          </div>

          <div className="field">
            <label htmlFor="customerPhone">Telefón</label>
            <input
              id="customerPhone"
              name="customerPhone"
              defaultValue={preselected?.phone ?? ""}
              placeholder="+421 …"
            />
          </div>

          <div className="field">
            <label htmlFor="assignedTo">Priradený servisák</label>
            <input
              id="assignedTo"
              name="assignedTo"
              placeholder="napr. Peter"
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
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" className="btn btn-primary">
            Vytvoriť ticket
          </button>
          <Link href="/zariadenia" className="btn btn-ghost">
            Zoznam zariadení
          </Link>
        </div>
      </form>
    </div>
  );
}
