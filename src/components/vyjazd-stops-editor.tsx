"use client";

import { useMemo, useState, useTransition } from "react";
import { MapsNavLink } from "@/components/maps-nav-link";
import { toggleVyjazdStopDoneAction } from "@/lib/actions";
import { VYJAZD_STATUS_LABELS, type VyjazdStatus, type VyjazdStop } from "@/lib/types";
import {
  emptyStop,
  prevadzkyCountLabel,
  remainingStopCount,
  routeNavigationUrl,
  statusAfterStopProgress,
  stopFromDevice,
  stopNavigationUrl,
} from "@/lib/vyjazd-stops";

export type StopDeviceOption = {
  uuid: string;
  label: string;
  name: string;
  phone: string;
  address: string;
  isOnline: boolean;
  deviceType: string;
};

export function VyjazdStopsEditor({
  initialStops,
  devices,
  vyjazdId,
  allowTick = false,
  vyjazdStatus = "naplanovany",
}: {
  initialStops: VyjazdStop[];
  devices: StopDeviceOption[];
  vyjazdId?: string;
  allowTick?: boolean;
  vyjazdStatus?: VyjazdStatus;
}) {
  const [stops, setStops] = useState<VyjazdStop[]>(
    initialStops.length > 0 ? initialStops : [emptyStop()],
  );
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const savedIds = useMemo(
    () => new Set(initialStops.map((s) => s.id)),
    [initialStops],
  );

  const primary = stops.find((s) => s.store.trim()) ?? stops[0];
  const doneCount = stops.filter((s) => s.done).length;
  const remaining = remainingStopCount(stops);
  const liveStatus = statusAfterStopProgress(vyjazdStatus, stops);
  const routeUrl = routeNavigationUrl(stops);
  const filledCount = stops.filter((s) => s.store.trim() || s.address.trim()).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const takenUuid = new Set(stops.map((s) => s.deviceUuid).filter(Boolean));
    const takenPlace = new Set(
      stops
        .map((s) => `${s.store}|${s.address}`.trim().toLowerCase())
        .filter((key) => key !== "|"),
    );
    const list = devices.filter((d) => {
      if (takenUuid.has(d.uuid)) return false;
      const place = `${d.label}|${d.address}`.trim().toLowerCase();
      return !takenPlace.has(place);
    });
    if (!q) return list.slice(0, 80);
    return list
      .filter((d) => {
        const hay = `${d.label} ${d.name} ${d.phone} ${d.address} ${d.uuid}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 80);
  }, [devices, query, stops]);

  function updateStop(id: string, patch: Partial<VyjazdStop>) {
    setStops((prev) =>
      prev.map((stop) => (stop.id === id ? { ...stop, ...patch } : stop)),
    );
  }

  function addEmpty() {
    setStops((prev) => [...prev, emptyStop()]);
    setQuery("");
  }

  function addDevice(device: StopDeviceOption) {
    setStops((prev) => [
      ...prev.filter(
        (s) =>
          s.store.trim() ||
          s.address.trim() ||
          s.deviceUuid ||
          s.contactPhone.trim() ||
          s.note.trim(),
      ),
      stopFromDevice(
        {
          uuid: device.uuid,
          code: "",
          partner: "",
          city: "",
          name: device.label,
          address: device.address,
          phone: device.phone,
        },
        { store: device.label },
      ),
    ]);
    setQuery("");
    setAdding(true);
  }

  function removeStop(id: string) {
    setStops((prev) => {
      const next = prev.filter((s) => s.id !== id);
      return next.length > 0 ? next : [emptyStop()];
    });
  }

  function moveStop(id: string, dir: -1 | 1) {
    setStops((prev) => {
      const index = prev.findIndex((s) => s.id === id);
      const nextIndex = index + dir;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  function toggleDone(stop: VyjazdStop, done: boolean) {
    updateStop(stop.id, { done });
    if (!allowTick || !vyjazdId || !savedIds.has(stop.id)) return;
    const fd = new FormData();
    fd.set("id", vyjazdId);
    fd.set("stopId", stop.id);
    fd.set("done", done ? "1" : "0");
    startTransition(() => toggleVyjazdStopDoneAction(fd));
  }

  return (
    <div className="space-y-3 md:col-span-2">
      <input type="hidden" name="stopsJson" value={JSON.stringify(stops)} />
      <input type="hidden" name="store" value={primary?.store ?? ""} />
      <input type="hidden" name="address" value={primary?.address ?? ""} />
      <input
        type="hidden"
        name="contactPhone"
        value={primary?.contactPhone ?? ""}
      />
      <input
        type="hidden"
        name="deviceUuid"
        value={primary?.deviceUuid ?? ""}
      />
      <input type="hidden" name="ticketId" value={primary?.ticketId ?? ""} />

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-base font-bold">Zastávky / prevádzky</h3>
          <p className="text-sm text-[var(--ink-soft)]">
            {prevadzkyCountLabel(filledCount)}
            {allowTick
              ? ` · ticknuté ${doneCount} / ${stops.length}`
              : " · pridaj z katalógu, zmeň poradie, odober"}
          </p>
        </div>
        {routeUrl ? (
          <MapsNavLink href={routeUrl} className="btn btn-ghost btn-tool">
            Navigácia trasy ↗
          </MapsNavLink>
        ) : null}
      </div>

      {allowTick ? (
        <div className="rounded-xl border border-[var(--line)] bg-white/70 px-3.5 py-3 text-sm">
          <div className="font-bold">
            Stav: {VYJAZD_STATUS_LABELS[liveStatus]}
          </div>
          <p className="mt-1 text-[var(--ink-soft)]">
            {doneCount === 0
              ? "Prvé ticknutie dá Prebieha. Ťukni na zelený/teal pruh na zastávke."
              : remaining === 0
                ? "Všetky zastávky sú ticknuté → Hotový."
                : `Prebieha · zostáva ${prevadzkyCountLabel(remaining)}. Posledné ticknutie dá Hotový.`}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "Zavrieť katalóg" : "Pridať z katalógu"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={addEmpty}>
          Pridať ručne
        </button>
      </div>

      {adding ? (
        <div className="space-y-3 rounded-xl border border-[var(--line)] bg-white/70 p-3">
          <div className="field">
            <label htmlFor="stop-search">Hľadať v katalógu prevádzok</label>
            <input
              id="stop-search"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Číslo, mesto, partner, adresa…"
            />
          </div>
          <p className="text-xs text-[var(--ink-soft)]">
            Ťukni na prevádzku — pridá sa na koniec trasy. Katalóg ostane otvorený, kým ho nezavrieš.
          </p>
          <ul className="max-h-72 overflow-auto rounded-xl border border-[var(--line)] bg-white/80">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-[var(--ink-soft)]">
                Žiadna zhoda — skús iné slovo, alebo pridaj ručne.
              </li>
            ) : (
              filtered.map((d) => (
                <li key={d.uuid}>
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 border-b border-[var(--line)] px-3 py-3.5 text-left hover:bg-[rgba(15,107,92,0.05)]"
                    onClick={() => addDevice(d)}
                  >
                    <span>
                      <span className="block font-semibold">{d.label}</span>
                      <span className="block text-xs text-[var(--ink-soft)]">
                        {d.name}
                        {d.address ? ` · ${d.address}` : ""}
                      </span>
                    </span>
                    <span
                      className={`chip shrink-0 ${d.isOnline ? "status-v-rieseni" : "status-hotove"}`}
                    >
                      {d.isOnline ? "Online" : "Offline"}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      <ol className="space-y-3">
        {stops.map((stop, index) => {
          const stopUrl = stopNavigationUrl(stop);
          return (
            <li
              key={stop.id}
              className={`rounded-xl border px-3.5 py-3 ${
                stop.done
                  ? "border-[var(--ok)] bg-[rgba(31,122,69,0.06)]"
                  : "border-[var(--line)] bg-white/70"
              }`}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-display text-sm font-bold text-[var(--teal-deep)]">
                    Zastávka {index + 1}
                  </span>
                  <span className="text-sm font-semibold">
                    {stop.store || "Nová prevádzka"}
                  </span>
                  {stopUrl ? (
                    <MapsNavLink href={stopUrl}>Navigácia ↗</MapsNavLink>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-tool"
                    onClick={() => moveStop(stop.id, -1)}
                    disabled={index === 0}
                  >
                    Hore
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-tool"
                    onClick={() => moveStop(stop.id, 1)}
                    disabled={index === stops.length - 1}
                  >
                    Dole
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-tool"
                    style={{ color: "var(--danger)" }}
                    onClick={() => removeStop(stop.id)}
                  >
                    Odstrániť
                  </button>
                </div>
              </div>

              {allowTick ? (
                <button
                  type="button"
                  className="tick-bar mb-3"
                  data-done={stop.done ? "true" : "false"}
                  disabled={pending}
                  onClick={() => toggleDone(stop, !stop.done)}
                >
                  <span>
                    {stop.done
                      ? "Ticknuté — ťukni pre zrušenie"
                      : "Ticknúť túto prevádzku"}
                  </span>
                  <span aria-hidden>{stop.done ? "✓" : ""}</span>
                </button>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="field md:col-span-2">
                  <label htmlFor={`stop-store-${stop.id}`}>
                    Prevádzka / zákazník
                  </label>
                  <input
                    id={`stop-store-${stop.id}`}
                    value={stop.store}
                    onChange={(e) =>
                      updateStop(stop.id, { store: e.target.value })
                    }
                    placeholder="Názov predajne, partner, mesto"
                  />
                </div>
                <div className="field">
                  <label htmlFor={`stop-address-${stop.id}`}>Adresa</label>
                  <input
                    id={`stop-address-${stop.id}`}
                    value={stop.address}
                    onChange={(e) =>
                      updateStop(stop.id, { address: e.target.value })
                    }
                    placeholder="Ulica, mesto"
                  />
                  {stopUrl ? (
                    <MapsNavLink href={stopUrl}>Otvoriť v mapách ↗</MapsNavLink>
                  ) : null}
                </div>
                <div className="field">
                  <label htmlFor={`stop-phone-${stop.id}`}>Kontakt / telefón</label>
                  <input
                    id={`stop-phone-${stop.id}`}
                    value={stop.contactPhone}
                    onChange={(e) =>
                      updateStop(stop.id, { contactPhone: e.target.value })
                    }
                    placeholder="+421 …"
                  />
                </div>
                {stop.deviceUuid ? (
                  <div className="field md:col-span-2">
                    <label>Naviazané zariadenie</label>
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2 text-sm">
                      <span className="font-mono text-xs">{stop.deviceUuid}</span>
                      <button
                        type="button"
                        className="text-sm font-semibold text-[var(--teal)]"
                        onClick={() =>
                          updateStop(stop.id, {
                            deviceUuid: "",
                            ticketId: stop.ticketId,
                          })
                        }
                      >
                        Zrušiť väzbu
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="field md:col-span-2">
                  <label htmlFor={`stop-note-${stop.id}`}>
                    Poznámka / výsledok zastávky
                  </label>
                  <textarea
                    id={`stop-note-${stop.id}`}
                    value={stop.note}
                    onChange={(e) =>
                      updateStop(stop.id, { note: e.target.value })
                    }
                    placeholder="Čo sa na tejto prevádzke spravilo…"
                    style={{ minHeight: "4.5rem" }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
