export const AUDIT_AUTORI = [
  "martin",
  "servis_bot",
  "hotline_bot",
  "automatika",
] as const;
export type AuditAutor = (typeof AUDIT_AUTORI)[number];

export const AUDIT_TYPY = [
  "ticket",
  "vyjazd",
  "prevadzka",
  "sklad",
  "nastavenia",
] as const;
export type AuditTyp = (typeof AUDIT_TYPY)[number];

export type AuditEntry = {
  id: string;
  at: string;
  autor: AuditAutor;
  typ: AuditTyp;
  akcia: string;
  entityId: string;
  popis: string;
  diff: Record<string, unknown> | null;
  requestId: string;
};

export type SyncRun = {
  id: string;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  devicesOnline: number;
  devicesOffline: number;
  devicesLongOffline: number;
  devicesTest: number;
  ticketsOpened: number;
  ticketsClosed: number;
  error: string;
};

export type AppError = {
  id: string;
  at: string;
  zdroj: "api" | "sync" | "ui";
  route: string;
  status: number;
  bot: string;
  message: string;
  stack: string;
};

export type BotRequest = {
  id: string;
  at: string;
  bot: string;
  method: string;
  path: string;
  status: number;
  ms: number;
};

export const NAVRH_KINDS = ["ticket", "vyjazd"] as const;
export type NavrhKind = (typeof NAVRH_KINDS)[number];

export type BotNavrh = {
  id: string;
  kind: NavrhKind;
  payload: Record<string, unknown>;
  summary: string;
  actorId: string;
  actorName: string;
  stav: "cakajuci" | "schvaleny" | "zamietnuty";
  createdAt: string;
  resolvedAt: string;
  resolvedBy: string;
};

export function parseAuditAutor(raw: string | undefined | null): AuditAutor {
  const value = String(raw ?? "").trim();
  if ((AUDIT_AUTORI as readonly string[]).includes(value)) {
    return value as AuditAutor;
  }
  const lower = value.toLowerCase();
  if (lower.includes("hotline")) return "hotline_bot";
  if (lower.includes("servis") || lower.includes("bot")) return "servis_bot";
  if (lower.includes("auto") || lower.includes("balena") || lower.includes("sync")) {
    return "automatika";
  }
  return "martin";
}

export function autorLabel(autor: AuditAutor) {
  if (autor === "servis_bot") return "Servis bot";
  if (autor === "hotline_bot") return "Hotline bot";
  if (autor === "automatika") return "automatika";
  return "Martin";
}

export function deployInfo() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "";
  const message = process.env.VERCEL_GIT_COMMIT_MESSAGE?.trim() || "";
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID?.trim() || "";
  const env = process.env.VERCEL_ENV?.trim() || process.env.NODE_ENV || "";
  const builtAt = process.env.SERVISLIST_BUILT_AT?.trim() || "";
  const ref = process.env.VERCEL_GIT_COMMIT_REF?.trim() || "";
  return {
    sha,
    shortSha: sha ? sha.slice(0, 7) : "",
    message,
    deploymentId,
    env,
    builtAt,
    ref: ref || "main",
  };
}

export function minutesAgo(iso: string, now = new Date()) {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (now.getTime() - new Date(iso).getTime()) / 60000;
}

export function isSameLocalDay(iso: string, now = new Date()) {
  const at = new Date(iso);
  return (
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate()
  );
}

export function inLastHours(iso: string, hours: number, now = new Date()) {
  return now.getTime() - new Date(iso).getTime() <= hours * 3600_000;
}

export function wantsPendingNavrh(body: Record<string, unknown>) {
  const flag = body.pending ?? body.navrh ?? body.proposal;
  return flag === true || flag === "true" || flag === 1 || flag === "1";
}

export function csvEscape(value: string) {
  if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function auditToCsv(rows: AuditEntry[]) {
  const header = ["cas", "autor", "typ", "akcia", "entity_id", "popis"];
  const lines = rows.map((row) =>
    [
      row.at,
      autorLabel(row.autor),
      row.typ,
      row.akcia,
      row.entityId,
      row.popis,
    ]
      .map((cell) => csvEscape(String(cell ?? "")))
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
