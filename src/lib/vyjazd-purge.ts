import { vyjazdCode } from "./format";

/** Jednorazové zmazanie starých naplánovaných výjazdov (Martin, 2026-10-17). */
export const PURGE_OPEN_VYJAZDY_META_KEY = "purge_open_vyjazdy_2026-10-17";
export const PURGE_OPEN_VYJAZDY_BACKUP_KEY = "purge_open_vyjazdy_2026-10-17_backup";

export const KEEP_VYJAZD_CODE = "V-0015";
export const KEEP_VYJAZD_NUMBER = 15;
export const KEEP_VYJAZD_ID_PREFIX = "a17f27c4-";

export const PURGE_OPEN_VYJAZDY_CODES = [
  "V-0007",
  "V-0008",
  "V-0009",
  "V-0010",
  "V-0011",
  "V-0012",
  "V-0013",
  "V-0014",
  "V-0016",
  "V-0017",
] as const;

export const PURGE_OPEN_VYJAZDY_IDS: readonly string[] = [
  "24462e15-4f00-4c62-9268-ac6539fcce1a",
  "bff7a158-b58c-462e-90c3-9e00a3a46dcb",
  "767e2fda-855d-4df6-b2ee-beac22e35799",
  "c6d97e34-af85-48ef-b7cd-5907c2107244",
  "d61db1c5-e0a1-4cc9-8a1d-285c7b5e10d5",
  "2a840153-a9fe-42e3-adbc-e0aea39ca5ff",
  "e09a6d1f-6213-4a4a-83ea-3ab2b01ea6b1",
  "c8ebe764-c86d-4832-af25-89c302d91480",
  "dcdefc2a-0ae0-454f-bf1e-09fb3f51c423",
  "ddee3604-d5cf-430c-bcfb-2dcfb4a3266c",
];

const PURGE_ID_SET = new Set(PURGE_OPEN_VYJAZDY_IDS);

export function shouldPurgeOpenVyjazd(row: {
  id: string;
  number: number;
  status: string;
}) {
  if (row.status !== "naplanovany") return false;
  if (row.number === KEEP_VYJAZD_NUMBER) return false;
  if (row.id.startsWith(KEEP_VYJAZD_ID_PREFIX)) return false;
  if (vyjazdCode(row.number) === KEEP_VYJAZD_CODE) return false;
  return PURGE_ID_SET.has(row.id);
}

export function purgeOpenVyjazdyAuditPopis(codes: string[]) {
  const list = codes.join(", ");
  return `Martin (cez Servislist bot) zmazal naplánované výjazdy ${list}. ${KEEP_VYJAZD_CODE} ostáva.`;
}
