"use client";

import { useState } from "react";
import { createPrevadzkaAction } from "@/lib/actions";
import { materialTemplate, type MaterialInput } from "@/lib/material";
import {
  JOB_TYPE_LABELS,
  STORE_TYPES,
  type JobType,
} from "@/lib/prevadzka-profile";

const JOBS: JobType[] = ["montaz_ozvucenia", "spustenie_zariadenia"];

export function PrevadzkaNovaForm() {
  const [jobType, setJobType] = useState<JobType>("montaz_ozvucenia");
  const [material, setMaterial] = useState<MaterialInput[]>(
    materialTemplate("montaz_ozvucenia"),
  );

  const [hours, setHours] = useState({
    monFri: "",
    saturday: "",
    sunday: "",
    holidays: "",
  });

  function changeJob(next: JobType) {
    setJobType(next);
    setMaterial(materialTemplate(next));
  }

  return (
    <form action={createPrevadzkaAction} className="space-y-5">
      <input type="hidden" name="jobType" value={jobType} />
      <input type="hidden" name="materialJson" value={JSON.stringify(material)} />
      <input
        type="hidden"
        name="openingHoursJson"
        value={JSON.stringify(hours)}
      />

      <section className="panel space-y-4 p-5 md:p-6">
        <h2 className="text-lg font-bold">Typ zákazky</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {JOBS.map((job) => (
            <button
              key={job}
              type="button"
              className={`tab text-left ${jobType === job ? "" : ""}`}
              data-on={jobType === job}
              onClick={() => changeJob(job)}
            >
              {JOB_TYPE_LABELS[job]}
              <span className="mt-1 block text-xs font-medium opacity-80">
                {job === "montaz_ozvucenia"
                  ? "Kompletná montáž ozvučenia aj prehrávača."
                  : "Len pridať / spustiť prehrávač v predajni, ktorá už má reproduktory."}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel space-y-4 p-5 md:p-6">
        <h2 className="text-lg font-bold">Základ</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Názov" name="name" placeholder="Nitra · Chrenová" />
          <Field label="Reťazec" name="chain" placeholder="COOP" />
          <Field label="Kód predajne" name="code" placeholder="214" />
          <div className="field">
            <label htmlFor="storeType">Typ predajne</label>
            <select id="storeType" name="storeType" defaultValue="">
              <option value="">—</option>
              {STORE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <Field label="Mesto" name="city" required />
          <Field label="Adresa" name="address" />
          <Field label="Telefón" name="phone" />
          <Field label="GPS šírka" name="gpsLat" />
          <Field label="GPS dĺžka" name="gpsLng" />
          <div className="field">
            <label htmlFor="monFri">Po–Pi</label>
            <input
              id="monFri"
              value={hours.monFri}
              onChange={(e) => setHours({ ...hours, monFri: e.target.value })}
              placeholder="6:30-20:00"
            />
          </div>
          <div className="field">
            <label htmlFor="saturday">So</label>
            <input
              id="saturday"
              value={hours.saturday}
              onChange={(e) => setHours({ ...hours, saturday: e.target.value })}
              placeholder="7:00-20:00"
            />
          </div>
          <div className="field">
            <label htmlFor="sunday">Ne</label>
            <input
              id="sunday"
              value={hours.sunday}
              onChange={(e) => setHours({ ...hours, sunday: e.target.value })}
              placeholder="zatvorené"
            />
          </div>
          <div className="field">
            <label htmlFor="holidays">Sviatky</label>
            <input
              id="holidays"
              value={hours.holidays}
              onChange={(e) =>
                setHours({ ...hours, holidays: e.target.value })
              }
            />
          </div>
          <div className="field md:col-span-2">
            <label htmlFor="description">Popis ticketu</label>
            <textarea
              id="description"
              name="description"
              placeholder="Čo sa má spraviť pri montáži / spustení…"
            />
          </div>
        </div>
      </section>

      <section className="panel space-y-4 p-5 md:p-6">
        <h2 className="text-lg font-bold">Materiál</h2>
        <p className="text-sm text-[var(--ink-soft)]">
          Predvyplnená šablóna podľa typu zákazky. Uprav pred uložením.
        </p>
        <div className="space-y-2">
          {material.map((row, i) => (
            <div key={`${row.item}-${i}`} className="grid gap-2 md:grid-cols-12">
              <input
                className="md:col-span-7 rounded-xl border border-[var(--line)] px-3 py-2"
                value={row.item}
                onChange={(e) =>
                  setMaterial((list) =>
                    list.map((r, idx) =>
                      idx === i ? { ...r, item: e.target.value } : r,
                    ),
                  )
                }
                placeholder="Položka"
              />
              <input
                className="md:col-span-2 rounded-xl border border-[var(--line)] px-3 py-2"
                type="number"
                min="0"
                step="0.1"
                value={row.quantity ?? 1}
                onChange={(e) =>
                  setMaterial((list) =>
                    list.map((r, idx) =>
                      idx === i
                        ? { ...r, quantity: Number(e.target.value) }
                        : r,
                    ),
                  )
                }
              />
              <input
                className="md:col-span-2 rounded-xl border border-[var(--line)] px-3 py-2"
                value={row.unit ?? "ks"}
                onChange={(e) =>
                  setMaterial((list) =>
                    list.map((r, idx) =>
                      idx === i ? { ...r, unit: e.target.value } : r,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="btn btn-ghost md:col-span-1"
                onClick={() =>
                  setMaterial((list) => list.filter((_, idx) => idx !== i))
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() =>
            setMaterial((list) => [
              ...list,
              { item: "", quantity: 1, unit: "ks" },
            ])
          }
        >
          + Položka
        </button>
      </section>

      <button type="submit" className="btn btn-primary">
        Vytvoriť prevádzku a ticket
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {required ? " *" : ""}
      </label>
      <input
        id={name}
        name={name}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}
