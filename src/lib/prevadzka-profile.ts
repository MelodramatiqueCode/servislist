export const STORE_TYPES = [
  "Supermarket",
  "Hypermarket",
  "Potraviny",
  "Drogeria",
  "Iné",
] as const;

export type StoreContact = {
  id: string;
  role: string;
  name: string;
  phone: string;
  email: string;
  callBeforeVisit: boolean;
  note: string;
};

export type AudioZone = {
  id: string;
  name: string;
  count: string;
  type: string;
  placement: string;
  status: string;
};

export type ControlButton = {
  id: string;
  number: string;
  fn: string;
  placement: string;
  gpio: string;
};

export type StorePhoto = {
  id: string;
  url: string;
  caption: string;
};

export type StoreOpeningHours = {
  monFri: string;
  saturday: string;
  sunday: string;
  holidays: string;
};

export type StoreProfile = {
  contacts: StoreContact[];
  areaM2: string;
  floors: string;
  zoneCount: string;
  ceilingHeight: string;
  speakersTotal: string;
  amplifier: string;
  ampPower: string;
  audioInput: string;
  volumeRef: string;
  audioZones: AudioZone[];
  buttons: ControlButton[];
  buttonNote: string;
  playerPlacement: string;
  powerUps: string;
  sdCard: string;
  connection: string;
  router: string;
  spareHw: string;
  visitWhen: string;
  beforeVisit: string;
  keysAccess: string;
  parking: string;
  ladder: string;
  security: string;
  photos: StorePhoto[];
  techNote: string;
  notes: string;
};

export const PREVAZDKA_STATUSES = ["active", "pending", "rejected"] as const;
export type PrevadzkaStatus = (typeof PREVAZDKA_STATUSES)[number];

export const JOB_TYPES = [
  "montaz_ozvucenia",
  "spustenie_zariadenia",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  montaz_ozvucenia: "Montáž ozvučenia",
  spustenie_zariadenia: "Spustenie zariadenia",
};

export type PrevadzkaRecord = {
  id: string;
  storeKey: string;
  code: string;
  chain: string;
  storeType: string;
  name: string;
  city: string;
  address: string;
  gpsLat: string;
  gpsLng: string;
  phone: string;
  openingHours: StoreOpeningHours;
  profile: StoreProfile;
  status: PrevadzkaStatus;
  jobType: JobType | "";
  createdAt: string;
  updatedAt: string;
};

export type ProfileSuggestion = {
  id: string;
  prevadzkaId: string;
  actorId: string;
  actorName: string;
  patch: Partial<PrevadzkaRecord> & { profile?: Partial<StoreProfile> };
  summary: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  resolvedAt: string;
  resolvedBy: string;
};

export type ProfileHistoryEntry = {
  id: string;
  prevadzkaId: string;
  at: string;
  author: string;
  text: string;
};

export function emptyOpeningHours(): StoreOpeningHours {
  return { monFri: "", saturday: "", sunday: "", holidays: "" };
}

export function emptyProfile(): StoreProfile {
  return {
    contacts: [],
    areaM2: "",
    floors: "",
    zoneCount: "",
    ceilingHeight: "",
    speakersTotal: "",
    amplifier: "",
    ampPower: "",
    audioInput: "",
    volumeRef: "",
    audioZones: [],
    buttons: [],
    buttonNote: "",
    playerPlacement: "",
    powerUps: "",
    sdCard: "",
    connection: "",
    router: "",
    spareHw: "",
    visitWhen: "",
    beforeVisit: "",
    keysAccess: "",
    parking: "",
    ladder: "",
    security: "",
    photos: [],
    techNote: "",
    notes: "",
  };
}

export function hydrateOpeningHours(raw: unknown): StoreOpeningHours {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    monFri: String(o.monFri ?? ""),
    saturday: String(o.saturday ?? ""),
    sunday: String(o.sunday ?? ""),
    holidays: String(o.holidays ?? ""),
  };
}

export function hydrateProfile(raw: unknown): StoreProfile {
  const base = emptyProfile();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    ...base,
    contacts: Array.isArray(o.contacts)
      ? o.contacts.map((c, i) => {
          const row = (c ?? {}) as Record<string, unknown>;
          return {
            id: String(row.id ?? `c${i}`),
            role: String(row.role ?? ""),
            name: String(row.name ?? ""),
            phone: String(row.phone ?? ""),
            email: String(row.email ?? ""),
            callBeforeVisit: Boolean(row.callBeforeVisit),
            note: String(row.note ?? ""),
          };
        })
      : [],
    areaM2: String(o.areaM2 ?? ""),
    floors: String(o.floors ?? ""),
    zoneCount: String(o.zoneCount ?? ""),
    ceilingHeight: String(o.ceilingHeight ?? ""),
    speakersTotal: String(o.speakersTotal ?? ""),
    amplifier: String(o.amplifier ?? ""),
    ampPower: String(o.ampPower ?? ""),
    audioInput: String(o.audioInput ?? ""),
    volumeRef: String(o.volumeRef ?? ""),
    audioZones: Array.isArray(o.audioZones)
      ? o.audioZones.map((z, i) => {
          const row = (z ?? {}) as Record<string, unknown>;
          return {
            id: String(row.id ?? `z${i}`),
            name: String(row.name ?? ""),
            count: String(row.count ?? ""),
            type: String(row.type ?? ""),
            placement: String(row.placement ?? ""),
            status: String(row.status ?? ""),
          };
        })
      : [],
    buttons: Array.isArray(o.buttons)
      ? o.buttons.map((b, i) => {
          const row = (b ?? {}) as Record<string, unknown>;
          return {
            id: String(row.id ?? `b${i}`),
            number: String(row.number ?? String(i + 1)),
            fn: String(row.fn ?? ""),
            placement: String(row.placement ?? ""),
            gpio: String(row.gpio ?? ""),
          };
        })
      : [],
    buttonNote: String(o.buttonNote ?? ""),
    playerPlacement: String(o.playerPlacement ?? ""),
    powerUps: String(o.powerUps ?? ""),
    sdCard: String(o.sdCard ?? ""),
    connection: String(o.connection ?? ""),
    router: String(o.router ?? ""),
    spareHw: String(o.spareHw ?? ""),
    visitWhen: String(o.visitWhen ?? ""),
    beforeVisit: String(o.beforeVisit ?? ""),
    keysAccess: String(o.keysAccess ?? ""),
    parking: String(o.parking ?? ""),
    ladder: String(o.ladder ?? ""),
    security: String(o.security ?? ""),
    photos: Array.isArray(o.photos)
      ? o.photos.map((p, i) => {
          const row = (p ?? {}) as Record<string, unknown>;
          return {
            id: String(row.id ?? `p${i}`),
            url: String(row.url ?? ""),
            caption: String(row.caption ?? ""),
          };
        })
      : [],
    techNote: String(o.techNote ?? ""),
    notes: String(o.notes ?? ""),
  };
}

export function openingHoursSet(hours: StoreOpeningHours) {
  return Boolean(
    hours.monFri.trim() ||
      hours.saturday.trim() ||
      hours.sunday.trim() ||
      hours.holidays.trim(),
  );
}

export function formatOpeningHours(hours: StoreOpeningHours) {
  const parts = [
    hours.monFri.trim() && `Po–Pi ${hours.monFri.trim()}`,
    hours.saturday.trim() && `So ${hours.saturday.trim()}`,
    hours.sunday.trim() && `Ne ${hours.sunday.trim()}`,
    hours.holidays.trim() && `sviatky ${hours.holidays.trim()}`,
  ].filter(Boolean);
  return parts.join(" · ");
}

const COMPLETENESS_FIELDS: Array<{
  key: string;
  label: string;
  filled: (s: PrevadzkaRecord) => boolean;
}> = [
  { key: "chain", label: "reťazec", filled: (s) => Boolean(s.chain.trim()) },
  { key: "code", label: "kód predajne", filled: (s) => Boolean(s.code.trim()) },
  { key: "storeType", label: "typ predajne", filled: (s) => Boolean(s.storeType.trim()) },
  { key: "address", label: "adresa", filled: (s) => Boolean(s.address.trim()) },
  { key: "gps", label: "GPS", filled: (s) => Boolean(s.gpsLat.trim() && s.gpsLng.trim()) },
  { key: "hours", label: "otváracie hodiny", filled: (s) => openingHoursSet(s.openingHours) },
  {
    key: "contact",
    label: "kontakt na volanie pred výjazdom",
    filled: (s) => s.profile.contacts.some((c) => c.callBeforeVisit && c.phone.trim()),
  },
  { key: "area", label: "plocha", filled: (s) => Boolean(s.profile.areaM2.trim()) },
  { key: "amp", label: "zosilňovač", filled: (s) => Boolean(s.profile.amplifier.trim()) },
  { key: "speakers", label: "reproduktory", filled: (s) => Boolean(s.profile.speakersTotal.trim()) },
  { key: "button", label: "tlačidlo", filled: (s) => s.profile.buttons.some((b) => b.fn.trim()) },
  { key: "visit", label: "prístup pre technika", filled: (s) => Boolean(s.profile.visitWhen.trim()) },
  { key: "techNote", label: "poznámka pre technika", filled: (s) => Boolean(s.profile.techNote.trim()) },
];

export function profileCompleteness(store: PrevadzkaRecord) {
  const missing = COMPLETENESS_FIELDS.filter((f) => !f.filled(store)).map((f) => f.label);
  const filled = COMPLETENESS_FIELDS.length - missing.length;
  const percent = Math.round((filled / COMPLETENESS_FIELDS.length) * 100);
  return { percent, filled, total: COMPLETENESS_FIELDS.length, missing };
}

export function parseJobType(raw: string | undefined | null): JobType | null {
  const value = (raw ?? "").trim();
  if ((JOB_TYPES as readonly string[]).includes(value)) return value as JobType;
  return null;
}

export function applyStorePatch(
  store: PrevadzkaRecord,
  patch: Partial<PrevadzkaRecord> & { profile?: Partial<StoreProfile> },
): PrevadzkaRecord {
  const next: PrevadzkaRecord = {
    ...store,
    code: patch.code ?? store.code,
    chain: patch.chain ?? store.chain,
    storeType: patch.storeType ?? store.storeType,
    name: patch.name ?? store.name,
    city: patch.city ?? store.city,
    address: patch.address ?? store.address,
    gpsLat: patch.gpsLat ?? store.gpsLat,
    gpsLng: patch.gpsLng ?? store.gpsLng,
    phone: patch.phone ?? store.phone,
    status: patch.status ?? store.status,
    jobType: patch.jobType !== undefined ? patch.jobType : store.jobType,
    openingHours: patch.openingHours
      ? hydrateOpeningHours(patch.openingHours)
      : store.openingHours,
    profile: patch.profile
      ? hydrateProfile({ ...store.profile, ...patch.profile })
      : store.profile,
  };
  return next;
}

export function describeStorePatch(
  before: PrevadzkaRecord,
  after: PrevadzkaRecord,
): string[] {
  const lines: string[] = [];
  const top: Array<[string, string, string]> = [
    ["reťazec", before.chain, after.chain],
    ["kód", before.code, after.code],
    ["typ", before.storeType, after.storeType],
    ["názov", before.name, after.name],
    ["adresa", before.address, after.address],
    ["GPS", `${before.gpsLat},${before.gpsLng}`, `${after.gpsLat},${after.gpsLng}`],
  ];
  for (const [label, a, b] of top) {
    if (a !== b) lines.push(`${label}: ${a || "—"} → ${b || "—"}`);
  }
  if (JSON.stringify(before.openingHours) !== JSON.stringify(after.openingHours)) {
    lines.push("zmenené otváracie hodiny");
  }
  if (JSON.stringify(before.profile) !== JSON.stringify(after.profile)) {
    if (before.profile.speakersTotal !== after.profile.speakersTotal) {
      lines.push(
        `reproduktory ${before.profile.speakersTotal || "—"} → ${after.profile.speakersTotal || "—"}`,
      );
    } else {
      lines.push("upravený profil");
    }
  }
  return lines;
}

export function summarizeSuggestionPatch(
  patch: Partial<PrevadzkaRecord> & { profile?: Partial<StoreProfile> },
) {
  const bits: string[] = [];
  if (patch.chain) bits.push(`reťazec ${patch.chain}`);
  if (patch.code) bits.push(`kód ${patch.code}`);
  if (patch.profile?.speakersTotal) {
    bits.push(`reproduktory ${patch.profile.speakersTotal}`);
  }
  if (patch.profile?.amplifier) bits.push(`zosilňovač ${patch.profile.amplifier}`);
  if (bits.length === 0) bits.push("úprava profilu");
  return bits.join(", ");
}
