"use client";

import { useSyncExternalStore } from "react";

const ORIGIN_PREF_KEY = "servislist.vyjazdOrigin";

export type OriginPref = {
  label: string;
  address: string;
};

const EMPTY: OriginPref = { label: "", address: "" };

let cachedRaw: string | null | undefined;
let cachedPref: OriginPref = EMPTY;

function parsePref(raw: string | null): OriginPref {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<OriginPref>;
    const label = String(parsed.label ?? "").trim();
    const address = String(parsed.address ?? "").trim();
    if (!label && !address) return EMPTY;
    return { label, address };
  } catch {
    return EMPTY;
  }
}

export function readOriginPref(): OriginPref | null {
  if (typeof window === "undefined") return null;
  const pref = parsePref(window.localStorage.getItem(ORIGIN_PREF_KEY));
  if (!pref.label && !pref.address) return null;
  return pref;
}

export function writeOriginPref(pref: OriginPref) {
  if (typeof window === "undefined") return;
  const label = pref.label.trim();
  const address = pref.address.trim();
  if (!label && !address) {
    window.localStorage.removeItem(ORIGIN_PREF_KEY);
  } else {
    window.localStorage.setItem(
      ORIGIN_PREF_KEY,
      JSON.stringify({ label, address }),
    );
  }
  cachedRaw = undefined;
}

function getSnapshot(): OriginPref {
  const raw = window.localStorage.getItem(ORIGIN_PREF_KEY);
  if (raw === cachedRaw) return cachedPref;
  cachedRaw = raw;
  cachedPref = parsePref(raw);
  return cachedPref;
}

function getServerSnapshot(): OriginPref {
  return EMPTY;
}

function subscribe(onChange: () => void) {
  const handler = (event: StorageEvent) => {
    if (event.key === ORIGIN_PREF_KEY || event.key === null) onChange();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export function useOriginPref(): OriginPref {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
