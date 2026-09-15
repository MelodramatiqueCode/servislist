const ORIGIN_PREF_KEY = "servislist.vyjazdOrigin";

export type OriginPref = {
  label: string;
  address: string;
};

export function readOriginPref(): OriginPref | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ORIGIN_PREF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OriginPref>;
    const label = String(parsed.label ?? "").trim();
    const address = String(parsed.address ?? "").trim();
    if (!label && !address) return null;
    return { label, address };
  } catch {
    return null;
  }
}

export function writeOriginPref(pref: OriginPref) {
  if (typeof window === "undefined") return;
  const label = pref.label.trim();
  const address = pref.address.trim();
  if (!label && !address) {
    window.localStorage.removeItem(ORIGIN_PREF_KEY);
    return;
  }
  window.localStorage.setItem(
    ORIGIN_PREF_KEY,
    JSON.stringify({ label, address }),
  );
}
