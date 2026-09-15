"use client";

import { useActionState, type FormEvent } from "react";
import {
  setCoolingModeAction,
  type CoolingActionState,
} from "@/lib/actions";

const INITIAL_STATE: CoolingActionState = {};

export function CoolingPanel({
  uuid,
  cpuTemp,
  isOnline,
  configured,
  profileLabel,
  armFreq,
  gpuFreq,
  active,
  canDisable,
  loadError,
}: {
  uuid: string;
  cpuTemp: number | null;
  isOnline: boolean;
  configured: boolean;
  profileLabel: string;
  armFreq: string;
  gpuFreq: string;
  active: boolean;
  canDisable: boolean;
  loadError?: string;
}) {
  const [state, formAction, pending] = useActionState(
    setCoolingModeAction,
    INITIAL_STATE,
  );

  const canAct = configured && isOnline && !pending && !loadError;
  const shownActive =
    state.ok && state.mode === "on"
      ? true
      : state.ok && state.mode === "off"
        ? false
        : active;
  const shownCanDisable =
    state.ok && state.mode === "on"
      ? true
      : state.ok && state.mode === "off"
        ? false
        : canDisable;
  const tempLabel =
    cpuTemp != null ? `${Math.round(cpuTemp)} °C` : "teplota nie je k dispozícii";

  function confirmSubmit(event: FormEvent<HTMLFormElement>) {
    const native = event.nativeEvent as SubmitEvent;
    const submitter = native.submitter as HTMLButtonElement | null;
    const intent = submitter?.value || "";
    const message =
      intent === "off"
        ? `Vypnúť chladiaci režim na ${profileLabel}?\n\nZmažú sa device-level underclock nastavenia a zariadenie sa vráti na predvolené takty flotily. Kiosk v predajni sa reštartuje a na chvíľu zhasne.`
        : `Zapnúť chladiaci režim na ${profileLabel}?\n\nCPU klesne na ${armFreq} MHz a GPU na ${gpuFreq} MHz. Balena zariadenie sa reštartuje — kiosk v predajni na chvíľu zhasne a môže byť o niečo pomalší.\n\nZmena platí len pre toto zariadenie, nie pre celú flotilu.`;
    if (!window.confirm(message)) {
      event.preventDefault();
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--line)] bg-white/60 px-3.5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold">Chladiaci režim</h3>
        <span className={`chip ${shownActive ? "chip-ok" : "prio-normalna"}`}>
          {shownActive ? "Aktívny" : "Vypnutý"}
        </span>
      </div>
      <p className="text-sm text-[var(--ink-soft)]">
        Softvérový underclock cez Balena <code>config.txt</code> — CPU{" "}
        {armFreq} MHz a GPU {gpuFreq} MHz. Len toto zariadenie ({profileLabel}).
        Zmena reštartuje kiosk.
      </p>
      <p className="text-sm font-semibold">CPU teplota: {tempLabel}</p>
      {!configured ? (
        <p className="text-sm font-semibold text-[var(--amber)]">
          Nastav <code>BALENA_API_TOKEN</code>, aby sa dal režim zapnúť z
          ServisListu.
        </p>
      ) : null}
      {!isOnline ? (
        <p className="text-sm font-semibold text-[var(--amber)]">
          Zariadenie je offline — režim sa dá meniť až keď je online.
        </p>
      ) : null}
      {loadError ? (
        <p className="text-sm font-semibold text-[var(--danger)]">{loadError}</p>
      ) : null}
      {state.error ? (
        <p className="text-sm font-semibold text-[var(--danger)]">{state.error}</p>
      ) : null}
      {state.ok && state.mode === "on" ? (
        <p className="text-sm font-semibold text-[var(--teal-deep)]">
          Chladiaci režim sa zapína. Zariadenie sa reštartuje — kiosk na chvíľu
          zhasne.
        </p>
      ) : null}
      {state.ok && state.mode === "off" ? (
        <p className="text-sm font-semibold text-[var(--teal-deep)]">
          Chladiaci režim sa vypína. Zariadenie sa reštartuje na predvolené
          takty flotily.
        </p>
      ) : null}
      <form action={formAction} onSubmit={confirmSubmit} className="flex flex-wrap gap-2">
        <input type="hidden" name="uuid" value={uuid} />
        <button
          type="submit"
          name="intent"
          value="on"
          className="btn btn-primary"
          disabled={!canAct || shownActive}
        >
          {pending ? "Nastavujem…" : "Zapnúť chladiaci režim"}
        </button>
        <button
          type="submit"
          name="intent"
          value="off"
          className="btn btn-ghost"
          disabled={!canAct || !shownCanDisable}
        >
          Vypnúť
        </button>
      </form>
    </div>
  );
}
