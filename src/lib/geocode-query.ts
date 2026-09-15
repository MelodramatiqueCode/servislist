/**
 * Pure geocoding query helpers for výjazd stops.
 * Nominatim fails on Balena/store labels like `#42 · Massiva · Filakovo`;
 * city-level queries such as `Fiľakovo, Slovensko` succeed.
 */

const COUNTRY_SUFFIXES = ["Slovensko", "Slovakia"] as const;

/** Known OSM-friendly spellings keyed by accent-folded city. */
const CITY_ALIASES: Record<string, string[]> = {
  filakovo: ["Fiľakovo", "Filakovo"],
};

function foldPlace(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function includesFold(haystack: string, needle: string) {
  const h = foldPlace(haystack);
  const n = foldPlace(needle);
  return Boolean(n) && h.includes(n);
}

function sameFold(a: string, b: string) {
  const left = foldPlace(a);
  const right = foldPlace(b);
  return Boolean(left) && left === right;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function looksLikeInternalStoreCode(value: string) {
  const t = value.trim();
  if (!t || /\s/.test(t)) return false;
  return /^(pj\d[\w.-]*|[a-z]{1,6}\d[\w.-]*)$/i.test(t);
}

export function isStoreLabel(value: string) {
  const t = value.trim();
  if (!t) return false;
  if (/[·•]/.test(t) && t.split(/\s*[·•]\s*/).filter(Boolean).length >= 2) {
    return true;
  }
  return /^#\d+\b/.test(t) && /[·•]/.test(t);
}

export function isDeviceNameDump(value: string) {
  const t = value.trim();
  if (!t) return false;
  if (/^\d+\s*[-_][A-Za-zÁ-ž0-9]/.test(t)) return true;
  const head = t.split(",")[0]?.trim() ?? "";
  return /^\d+\s*[-_][A-Za-zÁ-ž0-9]/.test(head);
}

export type ParsedStoreLabel = {
  code: string;
  partner: string;
  city: string;
};

/** `#42 · Massiva · Filakovo` → city = last middot segment. */
export function parseStoreLabel(store: string): ParsedStoreLabel {
  const parts = store
    .split(/\s*[·•]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    return { code: "", partner: "", city: "" };
  }
  const first = parts[0];
  const code = /^#\d+$/.test(first) ? first : "";
  const last = parts[parts.length - 1] ?? "";
  const city =
    last && !looksLikeInternalStoreCode(last) && !/^#\d+$/.test(last)
      ? last
      : "";
  const middle = parts.slice(code ? 1 : 0, city ? -1 : undefined);
  return {
    code,
    partner: middle.join(" ").trim(),
    city,
  };
}

export function looksLikePlaceAddress(value: string) {
  const t = value.trim();
  if (t.length < 2) return false;
  if (isStoreLabel(t)) return false;
  if (looksLikeInternalStoreCode(t)) return false;
  if (/^#\d+$/.test(t)) return false;
  if (isDeviceNameDump(t)) return false;
  if (/\d/.test(t) && /\p{L}/u.test(t)) return true;
  if (/^[\p{L}][\p{L}\s.'’/-]*$/u.test(t) && foldPlace(t).length >= 3) {
    return true;
  }
  return false;
}

function stripLeadingCodes(value: string) {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  while (parts.length > 1 && looksLikeInternalStoreCode(parts[0])) {
    parts.shift();
  }
  return parts.join(", ");
}

export function extractCityFromAddress(address: string) {
  const t = address.trim();
  if (!t) return "";
  if (isStoreLabel(t)) return parseStoreLabel(t).city;
  const parts = t
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2 && isDeviceNameDump(t)) {
    const maybeCity = parts[1];
    if (
      maybeCity &&
      !/\d/.test(maybeCity) &&
      looksLikePlaceAddress(maybeCity)
    ) {
      return maybeCity;
    }
  }
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (last && !/\d/.test(last) && looksLikePlaceAddress(last)) return last;
  }
  return "";
}

function extractStreetFromDump(address: string, city: string) {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    const tail = stripLeadingCodes(parts.slice(2).join(", "));
    return looksLikePlaceAddress(tail) ? tail : "";
  }
  if (parts.length === 2 && isDeviceNameDump(parts[0] ?? "")) {
    const second = parts[1] ?? "";
    if (city && includesFold(second, city)) {
      const foldedCity = foldPlace(city);
      const foldedSecond = foldPlace(second);
      if (foldedSecond === foldedCity) return "";
      if (foldedSecond.startsWith(`${foldedCity} `)) {
        const rest = second.slice(city.length).trim();
        return looksLikePlaceAddress(rest) ? rest : "";
      }
    }
    if (looksLikePlaceAddress(second) && !sameFold(second, city)) {
      return second;
    }
  }
  return "";
}

export function pickStreetAddress(address: string, city = "") {
  const raw = address.trim();
  if (!raw) return "";
  if (isStoreLabel(raw)) return "";
  if (sameFold(raw, city)) return "";
  if (looksLikeInternalStoreCode(raw)) return "";

  if (isDeviceNameDump(raw)) {
    return extractStreetFromDump(raw, city);
  }

  const stripped = stripLeadingCodes(raw);
  if (!stripped || sameFold(stripped, city)) return "";
  if (looksLikeInternalStoreCode(stripped)) return "";
  if (looksLikePlaceAddress(stripped)) {
    if (city && includesFold(stripped, city) && sameFold(stripped, city)) {
      return "";
    }
    return stripped;
  }
  return "";
}

export function cityGeocodeVariants(city: string) {
  const raw = city.trim();
  if (!raw) return [];
  const out: string[] = [];
  const push = (value: string) => {
    const t = value.trim();
    if (!t) return;
    if (out.some((existing) => existing.toLowerCase() === t.toLowerCase())) {
      return;
    }
    out.push(t);
  };
  push(raw);
  const stripped = stripAccents(raw);
  push(stripped);
  for (const alias of CITY_ALIASES[foldPlace(raw)] ?? []) {
    push(alias);
  }
  return out;
}

export function stripStoreDecorations(query: string, partner = "") {
  let t = query.replace(/[·•]/g, " ");
  t = t.replace(/#\d+/g, " ");
  const partnerToken = partner.trim();
  if (partnerToken) {
    t = t.replace(
      new RegExp(`(^|\\s)${escapeRegExp(partnerToken)}(?=\\s|$)`, "ig"),
      " ",
    );
  }
  return t.replace(/\s+/g, " ").trim();
}

function resolveCity(stop: { store?: string; address?: string }) {
  const store = (stop.store ?? "").trim();
  const address = (stop.address ?? "").trim();
  const fromLabel = parseStoreLabel(store).city;
  if (fromLabel) return fromLabel;
  const fromAddress = extractCityFromAddress(address);
  if (fromAddress) return fromAddress;
  if (
    store &&
    !isStoreLabel(store) &&
    !isDeviceNameDump(store) &&
    looksLikePlaceAddress(store)
  ) {
    return store;
  }
  return "";
}

/**
 * Ordered Nominatim queries for a stop. Never leads with a middot store label.
 * City-level fallbacks (including Filakovo ↔ Fiľakovo) come after a real street.
 */
export function geocodeCandidates(stop: {
  store?: string;
  address?: string;
}): string[] {
  const address = (stop.address ?? "").trim();
  const store = (stop.store ?? "").trim();
  const parsed = parseStoreLabel(store);
  const city = resolveCity(stop);
  const street = pickStreetAddress(address, city);

  const out: string[] = [];
  const push = (query: string) => {
    const q = query.trim().replace(/\s+/g, " ");
    if (!q) return;
    if (out.some((existing) => existing.toLowerCase() === q.toLowerCase())) {
      return;
    }
    out.push(q);
  };

  if (street) {
    if (city && !includesFold(street, city)) {
      push(`${street}, ${city}`);
    }
    push(street);
  }

  for (const variant of cityGeocodeVariants(city)) {
    for (const country of COUNTRY_SUFFIXES) {
      push(`${variant}, ${country}`);
    }
    push(variant);
  }

  const stripped = stripStoreDecorations(store, parsed.partner);
  if (
    stripped &&
    !isStoreLabel(stripped) &&
    looksLikePlaceAddress(stripped)
  ) {
    push(stripped);
    push(`${stripped}, Slovensko`);
  }

  if (
    address &&
    !isStoreLabel(address) &&
    !isDeviceNameDump(address) &&
    looksLikePlaceAddress(address)
  ) {
    push(address);
  }

  return out;
}

export function composeDeviceStopAddress(device: {
  name?: string;
  address?: string;
  city?: string;
}) {
  const name = (device.name ?? "").trim();
  const city =
    (device.city ?? "").trim() ||
    parseStoreLabel(name).city ||
    extractCityFromAddress((device.address ?? "").trim());
  let address = (device.address ?? "").trim();

  if (address && name && address.toLowerCase() === name.toLowerCase()) {
    address = "";
  }
  if (isStoreLabel(address)) {
    address = "";
  }

  const street = pickStreetAddress(address, city);
  if (street && city && !includesFold(street, city)) {
    return `${street}, ${city}`;
  }
  if (street) return street;
  if (city) return city;
  if (address && looksLikePlaceAddress(address)) return address;
  return "";
}
