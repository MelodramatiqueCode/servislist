"use client";

import { useEffect, useState } from "react";
import { readOriginPref } from "@/lib/origin-pref";

/** Hidden origin for suggestion accept — uses the saved browser default. */
export function OriginHiddenInputs() {
  const [pref, setPref] = useState({ label: "", address: "" });

  useEffect(() => {
    const saved = readOriginPref();
    if (saved) setPref(saved);
  }, []);

  return (
    <>
      <input type="hidden" name="originLabel" value={pref.label} />
      <input type="hidden" name="originAddress" value={pref.address} />
    </>
  );
}
