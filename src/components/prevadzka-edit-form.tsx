"use client";

import { useState } from "react";
import Link from "next/link";
import { updatePrevadzkaAction } from "@/lib/actions";
import {
  STORE_TYPES,
  type AudioZone,
  type ControlButton,
  type PrevadzkaRecord,
  type StoreContact,
  type StorePhoto,
} from "@/lib/prevadzka-profile";
import { hardwareLabel } from "@/lib/parse-device";

const TABS = [
  "Základ",
  "Kontakty",
  "Priestor",
  "Audio",
  "Tlačidlá",
  "Prehrávač a sieť",
  "Prístup",
  "Fotky",
] as const;

type Tab = (typeof TABS)[number];

type DeviceSnap = {
  name: string;
  deviceType: string;
  osVersion: string;
  supervisorVersion: string;
  ipAddress: string;
};

export function PrevadzkaEditForm({
  store,
  device,
}: {
  store: PrevadzkaRecord;
  device: DeviceSnap | null;
}) {
  const [tab, setTab] = useState<Tab>("Základ");
  const [contacts, setContacts] = useState<StoreContact[]>(
    store.profile.contacts,
  );
  const [zones, setZones] = useState<AudioZone[]>(store.profile.audioZones);
  const [buttons, setButtons] = useState<ControlButton[]>(store.profile.buttons);
  const [photos, setPhotos] = useState<StorePhoto[]>(store.profile.photos);
  const [hours, setHours] = useState(store.openingHours);

  const profile = {
    ...store.profile,
    contacts,
    audioZones: zones,
    buttons,
    photos,
  };

  return (
    <form action={updatePrevadzkaAction} className="space-y-5">
      <input type="hidden" name="id" value={store.id} />
      <input type="hidden" name="profileJson" value={JSON.stringify(profile)} />
      <input type="hidden" name="openingHoursJson" value={JSON.stringify(hours)} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href={`/prevadzky/${store.id}`}
            className="text-sm font-semibold text-[var(--teal)]"
          >
            ← Späť na prevádzku
          </Link>
          <h1 className="mt-2 text-3xl font-extrabold">
            Upraviť profil · {store.code ? `#${store.code} ` : ""}
            {store.name}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/prevadzky/${store.id}`} className="btn btn-ghost">
            Zrušiť
          </Link>
          <button type="submit" className="btn btn-primary">
            Uložiť zmeny
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className="tab"
            data-on={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Základ" ? (
        <section className="panel space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Názov" name="name" defaultValue={store.name} />
            <Field label="Reťazec" name="chain" defaultValue={store.chain} />
            <Field label="Kód" name="code" defaultValue={store.code} />
            <div className="field">
              <label htmlFor="storeType">Typ predajne</label>
              <select id="storeType" name="storeType" defaultValue={store.storeType}>
                <option value="">—</option>
                {STORE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <Field label="Mesto" name="city" defaultValue={store.city} />
            <Field label="Adresa" name="address" defaultValue={store.address} />
            <Field label="Telefón" name="phone" defaultValue={store.phone} />
            <Field label="GPS šírka" name="gpsLat" defaultValue={store.gpsLat} />
            <Field label="GPS dĺžka" name="gpsLng" defaultValue={store.gpsLng} />
            {(
              [
                ["monFri", "Po–Pi"],
                ["saturday", "So"],
                ["sunday", "Ne"],
                ["holidays", "Sviatky"],
              ] as const
            ).map(([key, label]) => (
              <div className="field" key={key}>
                <label htmlFor={key}>{label}</label>
                <input
                  id={key}
                  value={hours[key]}
                  onChange={(e) =>
                    setHours({ ...hours, [key]: e.target.value })
                  }
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "Kontakty" ? (
        <section className="panel space-y-4 p-5">
          {contacts.map((c, i) => (
            <div key={c.id} className="grid gap-2 md:grid-cols-6">
              <input
                value={c.role}
                placeholder="Rola"
                onChange={(e) =>
                  setContacts(patch(contacts, i, { role: e.target.value }))
                }
                className="rounded-xl border border-[var(--line)] px-3 py-2"
              />
              <input
                value={c.name}
                placeholder="Meno"
                onChange={(e) =>
                  setContacts(patch(contacts, i, { name: e.target.value }))
                }
                className="rounded-xl border border-[var(--line)] px-3 py-2"
              />
              <input
                value={c.phone}
                placeholder="Telefón"
                onChange={(e) =>
                  setContacts(patch(contacts, i, { phone: e.target.value }))
                }
                className="rounded-xl border border-[var(--line)] px-3 py-2"
              />
              <input
                value={c.email}
                placeholder="E-mail"
                onChange={(e) =>
                  setContacts(patch(contacts, i, { email: e.target.value }))
                }
                className="rounded-xl border border-[var(--line)] px-3 py-2"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={c.callBeforeVisit}
                  onChange={(e) =>
                    setContacts(
                      patch(contacts, i, { callBeforeVisit: e.target.checked }),
                    )
                  }
                />
                volať pred výjazdom
              </label>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setContacts(contacts.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              setContacts([
                ...contacts,
                {
                  id: `c${Date.now()}`,
                  role: "",
                  name: "",
                  phone: "",
                  email: "",
                  callBeforeVisit: false,
                  note: "",
                },
              ])
            }
          >
            + Kontakt
          </button>
        </section>
      ) : null}

      {tab === "Priestor" ? (
        <section className="panel grid gap-4 p-5 md:grid-cols-2">
          <Field label="Plocha m²" name="areaM2" defaultValue={store.profile.areaM2} profile />
          <Field label="Poschodia" name="floors" defaultValue={store.profile.floors} profile />
          <Field label="Zóny" name="zoneCount" defaultValue={store.profile.zoneCount} profile />
          <Field
            label="Výška stropu"
            name="ceilingHeight"
            defaultValue={store.profile.ceilingHeight}
            profile
          />
        </section>
      ) : null}

      {tab === "Audio" ? (
        <section className="panel space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Reproduktory spolu"
              name="speakersTotal"
              defaultValue={store.profile.speakersTotal}
              profile
            />
            <Field
              label="Zosilňovač"
              name="amplifier"
              defaultValue={store.profile.amplifier}
              profile
            />
            <Field label="Výkon" name="ampPower" defaultValue={store.profile.ampPower} profile />
            <Field label="Vstup" name="audioInput" defaultValue={store.profile.audioInput} profile />
            <Field
              label="Hlasitosť ref."
              name="volumeRef"
              defaultValue={store.profile.volumeRef}
              profile
            />
          </div>
          {zones.map((z, i) => (
            <div key={z.id} className="grid gap-2 md:grid-cols-6">
              <input
                value={z.name}
                placeholder="Zóna"
                onChange={(e) => setZones(patch(zones, i, { name: e.target.value }))}
                className="rounded-xl border border-[var(--line)] px-3 py-2"
              />
              <input
                value={z.count}
                placeholder="Počet"
                onChange={(e) => setZones(patch(zones, i, { count: e.target.value }))}
                className="rounded-xl border border-[var(--line)] px-3 py-2"
              />
              <input
                value={z.type}
                placeholder="Typ"
                onChange={(e) => setZones(patch(zones, i, { type: e.target.value }))}
                className="rounded-xl border border-[var(--line)] px-3 py-2"
              />
              <input
                value={z.placement}
                placeholder="Umiestnenie"
                onChange={(e) =>
                  setZones(patch(zones, i, { placement: e.target.value }))
                }
                className="rounded-xl border border-[var(--line)] px-3 py-2"
              />
              <input
                value={z.status}
                placeholder="Stav"
                onChange={(e) => setZones(patch(zones, i, { status: e.target.value }))}
                className="rounded-xl border border-[var(--line)] px-3 py-2"
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setZones(zones.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              setZones([
                ...zones,
                { id: `z${Date.now()}`, name: "", count: "", type: "", placement: "", status: "" },
              ])
            }
          >
            + Zóna
          </button>
        </section>
      ) : null}

      {tab === "Tlačidlá" ? (
        <section className="panel space-y-4 p-5">
          {buttons.map((b, i) => (
            <div key={b.id} className="grid gap-2 md:grid-cols-5">
              <input
                value={b.number}
                placeholder="#"
                onChange={(e) =>
                  setButtons(patch(buttons, i, { number: e.target.value }))
                }
                className="rounded-xl border border-[var(--line)] px-3 py-2"
              />
              <input
                value={b.fn}
                placeholder="Funkcia"
                onChange={(e) => setButtons(patch(buttons, i, { fn: e.target.value }))}
                className="rounded-xl border border-[var(--line)] px-3 py-2"
              />
              <input
                value={b.placement}
                placeholder="Umiestnenie"
                onChange={(e) =>
                  setButtons(patch(buttons, i, { placement: e.target.value }))
                }
                className="rounded-xl border border-[var(--line)] px-3 py-2"
              />
              <input
                value={b.gpio}
                placeholder="GPIO"
                onChange={(e) =>
                  setButtons(patch(buttons, i, { gpio: e.target.value }))
                }
                className="rounded-xl border border-[var(--line)] px-3 py-2"
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setButtons(buttons.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <Field
            label="Poznámka k tlačidlám"
            name="buttonNote"
            defaultValue={store.profile.buttonNote}
            profile
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              setButtons([
                ...buttons,
                {
                  id: `b${Date.now()}`,
                  number: String(buttons.length + 1),
                  fn: "",
                  placement: "",
                  gpio: "",
                },
              ])
            }
          >
            + Tlačidlo
          </button>
        </section>
      ) : null}

      {tab === "Prehrávač a sieť" ? (
        <section className="panel space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="field field-auto">
              <label>Zariadenie (auto)</label>
              <input readOnly value={device?.name || "—"} />
            </div>
            <div className="field field-auto">
              <label>Model (auto)</label>
              <input
                readOnly
                value={device ? hardwareLabel(device.deviceType) : "—"}
              />
            </div>
            <div className="field field-auto">
              <label>OS / supervisor (auto)</label>
              <input
                readOnly
                value={
                  device
                    ? `${device.osVersion || "—"} · ${device.supervisorVersion || "—"}`
                    : "—"
                }
              />
            </div>
            <div className="field field-auto">
              <label>Lokálna IP (auto)</label>
              <input readOnly value={device?.ipAddress || "—"} />
            </div>
            <Field
              label="Umiestnenie prehrávača"
              name="playerPlacement"
              defaultValue={store.profile.playerPlacement}
              profile
            />
            <Field label="Napájanie / UPS" name="powerUps" defaultValue={store.profile.powerUps} profile />
            <Field label="SD karta" name="sdCard" defaultValue={store.profile.sdCard} profile />
            <Field label="Pripojenie" name="connection" defaultValue={store.profile.connection} profile />
            <Field label="Router" name="router" defaultValue={store.profile.router} profile />
            <Field label="Náhradný HW" name="spareHw" defaultValue={store.profile.spareHw} profile />
          </div>
        </section>
      ) : null}

      {tab === "Prístup" ? (
        <section className="panel grid gap-4 p-5 md:grid-cols-2">
          <Field label="Kedy chodiť" name="visitWhen" defaultValue={store.profile.visitWhen} profile />
          <Field label="Pred výjazdom" name="beforeVisit" defaultValue={store.profile.beforeVisit} profile />
          <Field label="Kľúče / vstup" name="keysAccess" defaultValue={store.profile.keysAccess} profile />
          <Field label="Parkovanie" name="parking" defaultValue={store.profile.parking} profile />
          <Field label="Rebrík" name="ladder" defaultValue={store.profile.ladder} profile />
          <Field label="Bezpečnosť" name="security" defaultValue={store.profile.security} profile />
        </section>
      ) : null}

      {tab === "Fotky" ? (
        <section className="panel space-y-4 p-5">
          {photos.map((p, i) => (
            <div key={p.id} className="grid gap-2 md:grid-cols-3">
              <input
                value={p.url}
                placeholder="https://…"
                onChange={(e) => setPhotos(patch(photos, i, { url: e.target.value }))}
                className="rounded-xl border border-[var(--line)] px-3 py-2"
              />
              <input
                value={p.caption}
                placeholder="Popis"
                onChange={(e) =>
                  setPhotos(patch(photos, i, { caption: e.target.value }))
                }
                className="rounded-xl border border-[var(--line)] px-3 py-2"
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              setPhotos([
                ...photos,
                { id: `p${Date.now()}`, url: "", caption: "" },
              ])
            }
          >
            + Foto URL
          </button>
          <Field
            label="Poznámka pre technika"
            name="techNote"
            defaultValue={store.profile.techNote}
            profile
          />
          <Field label="Poznámky" name="notes" defaultValue={store.profile.notes} profile />
        </section>
      ) : null}

      <ProfileHiddenDefaults profile={store.profile} />
    </form>
  );
}

function patch<T>(list: T[], i: number, part: Partial<T>): T[] {
  return list.map((row, idx) => (idx === i ? { ...row, ...part } : row));
}

function Field({
  label,
  name,
  defaultValue,
  profile,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  profile?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={profile ? `profile_${name}` : name}
        defaultValue={defaultValue}
      />
    </div>
  );
}

function ProfileHiddenDefaults({
  profile,
}: {
  profile: PrevadzkaRecord["profile"];
}) {
  const keys = [
    "areaM2",
    "floors",
    "zoneCount",
    "ceilingHeight",
    "speakersTotal",
    "amplifier",
    "ampPower",
    "audioInput",
    "volumeRef",
    "buttonNote",
    "playerPlacement",
    "powerUps",
    "sdCard",
    "connection",
    "router",
    "spareHw",
    "visitWhen",
    "beforeVisit",
    "keysAccess",
    "parking",
    "ladder",
    "security",
    "techNote",
    "notes",
  ] as const;
  return (
    <>
      {keys.map((key) => (
        <input
          key={key}
          type="hidden"
          name={`_default_${key}`}
          defaultValue={profile[key]}
        />
      ))}
    </>
  );
}
