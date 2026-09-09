"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type DeviceOption = {
  uuid: string;
  label: string;
  name: string;
  phone: string;
  isOnline: boolean;
  deviceType: string;
};

export function DevicePicker({
  devices,
  selectedUuid = "",
}: {
  devices: DeviceOption[];
  selectedUuid?: string;
}) {
  const [query, setQuery] = useState("");
  const [uuid, setUuid] = useState(selectedUuid);
  const selected = devices.find((d) => d.uuid === uuid);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return devices.slice(0, 80);
    return devices
      .filter((d) => {
        const hay = `${d.label} ${d.name} ${d.phone} ${d.uuid}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 80);
  }, [devices, query]);

  return (
    <div className="space-y-3 md:col-span-2">
      <input type="hidden" name="deviceUuid" value={uuid} />
      <div className="field">
        <label htmlFor="device-search">Balena zariadenie / predajňa</label>
        <input
          id="device-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hľadaj číslo, mesto, partnera, UUID…"
        />
      </div>

      {selected ? (
        <div className="rounded-xl border border-[var(--teal)] bg-[rgba(15,107,92,0.06)] px-3.5 py-3 text-sm">
          <div className="font-bold">{selected.label}</div>
          <div className="mt-1 text-[var(--ink-soft)]">{selected.name}</div>
          <button
            type="button"
            className="mt-2 text-sm font-semibold text-[var(--teal)]"
            onClick={() => setUuid("")}
          >
            Zrušiť výber
          </button>
        </div>
      ) : (
        <ul className="max-h-56 overflow-auto rounded-xl border border-[var(--line)] bg-white/70">
          {filtered.length === 0 ? (
            <li className="px-3 py-3 text-sm text-[var(--ink-soft)]">
              Žiadna zhoda — ticket môžeš vytvoriť aj bez Balena zariadenia.
            </li>
          ) : (
            filtered.map((d) => (
              <li key={d.uuid}>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 border-b border-[var(--line)] px-3 py-2.5 text-left hover:bg-[rgba(15,107,92,0.05)]"
                  onClick={() => {
                    setUuid(d.uuid);
                    setQuery("");
                  }}
                >
                  <span>
                    <span className="block font-semibold">{d.label}</span>
                    <span className="block text-xs text-[var(--ink-soft)]">
                      {d.name}
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
      )}
    </div>
  );
}

export function ImportDevicesPanel() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function onImport() {
    startTransition(async () => {
      setMessage("");
      try {
        const parsed = JSON.parse(text);
        const res = await fetch("/api/import-devices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });
        const json = await res.json();
        if (!res.ok) {
          setMessage(json.error || "Import zlyhal");
          return;
        }
        setMessage(`Importovaných zariadení: ${json.count}`);
        setText("");
        router.refresh();
      } catch {
        setMessage("Neplatný JSON.");
      }
    });
  }

  return (
    <div className="panel space-y-3 p-5">
      <h2 className="text-lg font-bold">Import Balena exportu</h2>
      <p className="text-sm text-[var(--ink-soft)]">
        Vlož JSON pole zariadení z Balena Cloud (id, uuid, device_name, …).
      </p>
      <div className="field">
        <label htmlFor="import-json" className="sr-only">
          JSON
        </label>
        <textarea
          id="import-json"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='[{ "id": 1, "uuid": "...", "device_name": "..." }]'
          className="min-h-32 font-mono text-sm"
        />
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending || !text.trim()}
        onClick={onImport}
      >
        {pending ? "Importujem…" : "Importovať zariadenia"}
      </button>
      {message ? (
        <p className="text-sm font-semibold text-[var(--teal-deep)]">{message}</p>
      ) : null}
    </div>
  );
}
