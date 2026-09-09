import Link from "next/link";
import { createTicketAction } from "@/lib/actions";
import { DEVICE_TYPES, PRIORITY_LABELS } from "@/lib/types";

export default function NewTicketPage() {
  return (
    <div className="shell max-w-3xl space-y-6">
      <div className="fade-up space-y-2">
        <Link href="/" className="text-sm font-semibold text-[var(--teal)]">
          ← Späť na tickety
        </Link>
        <h1 className="text-3xl font-extrabold md:text-4xl">Nový problém</h1>
        <p className="text-[var(--ink-soft)]">
          Zapíš zariadenie a popis chyby. Ticket sa otvorí ako úloha v zozname.
        </p>
      </div>

      <form
        action={createTicketAction}
        className="panel fade-up space-y-5 p-5 md:p-7"
        style={{ animationDelay: "80ms" }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="field md:col-span-2">
            <label htmlFor="title">Názov problému *</label>
            <input
              id="title"
              name="title"
              required
              placeholder="napr. Notebook sa nezapína"
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
            <select id="deviceType" name="deviceType" required defaultValue="">
              <option value="" disabled>
                Vyber typ
              </option>
              {DEVICE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="deviceSerial">Sériové číslo / IMEI</label>
            <input
              id="deviceSerial"
              name="deviceSerial"
              placeholder="napr. NB-88421"
            />
          </div>

          <div className="field">
            <label htmlFor="customerName">Zákazník *</label>
            <input
              id="customerName"
              name="customerName"
              required
              placeholder="Meno alebo firma"
            />
          </div>

          <div className="field">
            <label htmlFor="customerPhone">Telefón</label>
            <input
              id="customerPhone"
              name="customerPhone"
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
          <Link href="/" className="btn btn-ghost">
            Zrušiť
          </Link>
        </div>
      </form>
    </div>
  );
}
