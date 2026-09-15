"use client";

import { useOriginPref } from "@/lib/origin-pref";

/** Hidden origin for suggestion accept — uses the saved browser default. */
export function OriginHiddenInputs() {
  const pref = useOriginPref();
  return (
    <>
      <input type="hidden" name="originLabel" value={pref.label} />
      <input type="hidden" name="originAddress" value={pref.address} />
    </>
  );
}
