import { relativeAge } from "./pulse";
import {
  autorLabel,
  deployInfo,
  inLastHours,
  isSameLocalDay,
  minutesAgo,
  parseAuditAutor,
} from "./kontrola";
import {
  countPendingApprovals,
  lastSyncRun,
  listAppErrors,
  listAudit,
  listBotRequests,
  listNavrhy,
  pingDatabase,
} from "./kontrola-store";
import {
  listAllPendingSuggestions,
  listPendingPrevadzky,
  storeLabel,
} from "./prevadzka-store";
import { listDodacieListy, skladSnapshot } from "./sklad-store";
import { KONTROLA_SYNC_OK_MINUTES } from "./balena-sync-policy";
import { getDeviceStats } from "./store";

export type ApprovalItem = {
  id: string;
  kind: "store" | "suggestion" | "prijem" | "ticket" | "vyjazd";
  actor: string;
  title: string;
  hint: string;
  href: string;
  createdAt: string;
  stale: boolean;
  storeId?: string;
  suggestionId?: string;
  dlId?: string;
  navrhId?: string;
  suborUrl?: string;
  suborName?: string;
};

export async function kontrolaSnapshot() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();
  const hourAgo = new Date(now.getTime() - 3600_000).toISOString();

  const [
    sync,
    devices,
    db,
    errors,
    requests,
    audit,
    stores,
    suggestions,
    prijmy,
    navrhy,
    sklad,
    pendingCount,
  ] = await Promise.all([
    lastSyncRun(),
    getDeviceStats(),
    pingDatabase(),
    listAppErrors(dayAgo),
    listBotRequests(weekAgo),
    listAudit({ from: weekAgo, limit: 400 }),
    listPendingPrevadzky(),
    listAllPendingSuggestions(),
    listDodacieListy({ stav: "cakajuci" }),
    listNavrhy({ stav: "cakajuci" }),
    skladSnapshot(),
    countPendingApprovals(),
  ]);

  const lastSyncAt = sync?.finishedAt || devices.syncedAt;
  const syncAge = minutesAgo(lastSyncAt, now);
  const syncOk =
    Boolean(lastSyncAt) &&
    syncAge <= KONTROLA_SYNC_OK_MINUTES &&
    (sync ? sync.ok : !devices.lastSyncError);

  const todayRequests = requests.filter((r) => isSameLocalDay(r.at, now));
  const avgMs =
    todayRequests.length > 0
      ? Math.round(
          todayRequests.reduce((sum, r) => sum + r.ms, 0) / todayRequests.length,
        )
      : 0;
  const servisToday = todayRequests.filter((r) => r.bot === "servis").length;
  const hotlineToday = todayRequests.filter((r) => r.bot === "hotline").length;

  const approvals: ApprovalItem[] = [
    ...stores.map((store) => ({
      id: `store-${store.id}`,
      kind: "store" as const,
      actor: "návrh",
      title: `Nová prevádzka: ${storeLabel(store)}`,
      hint: store.jobType || "čaká na schválenie",
      href: `/prevadzky/${store.id}`,
      createdAt: store.createdAt,
      stale: minutesAgo(store.createdAt, now) > 24 * 60,
      storeId: store.id,
    })),
    ...suggestions.map((s) => ({
      id: `sug-${s.id}`,
      kind: "suggestion" as const,
      actor: s.actorName,
      title: `Zmena profilu: ${s.summary || "úprava"}`,
      href: `/prevadzky/${s.prevadzkaId}`,
      hint: s.actorName,
      createdAt: s.createdAt,
      stale: minutesAgo(s.createdAt, now) > 24 * 60,
      storeId: s.prevadzkaId,
      suggestionId: s.id,
    })),
    ...prijmy.map((dl) => ({
      id: `dl-${dl.id}`,
      kind: "prijem" as const,
      actor: dl.vytvoril,
      title: `Príjem na sklad: ${dl.cisloDl || "dodací list"}`,
      hint: `${dl.dodavatel} · ${dl.riadky.length} položiek`,
      href: "/sklad",
      createdAt: dl.createdAt,
      stale: minutesAgo(dl.createdAt, now) > 24 * 60,
      dlId: dl.id,
      suborUrl: dl.suborUrl || undefined,
      suborName: dl.suborName || undefined,
    })),
    ...navrhy.map((n) => ({
      id: `navrh-${n.id}`,
      kind: n.kind,
      actor: n.actorName,
      title: n.summary,
      hint: n.kind === "vyjazd" ? "návrh výjazdu" : "návrh ticketu",
      href: n.kind === "vyjazd" ? "/vyjazdy/novy" : "/novy",
      createdAt: n.createdAt,
      stale: minutesAgo(n.createdAt, now) > 24 * 60,
      navrhId: n.id,
    })),
  ].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const staleApproval = approvals.find((a) => a.stale);
  const writesLastHour = audit.filter(
    (row) =>
      (row.autor === "servis_bot" ||
        row.autor === "hotline_bot" ||
        row.autor === "elevenlabs_bot") &&
      new Date(row.at).getTime() >= new Date(hourAgo).getTime(),
  ).length;
  const apiErrors = errors.filter((e) => e.zdroj === "api");

  const alerts = [
    !syncOk
      ? {
          tone: "o" as const,
          title: "Sync starší ako 15 min",
          hint: lastSyncAt
            ? `posledný ${relativeAge(lastSyncAt, now)}`
            : "ešte nebežal",
        }
      : {
          tone: "g" as const,
          title: "Sync beží",
          hint: "pravidlo: upozorniť, ak nebeží > 15 min",
        },
    sklad.stats.low
      ? {
          tone: "o" as const,
          title: `Sklad pod minimom: ${sklad.stats.low} položky`,
          hint: sklad.polozky
            .filter((p) => p.low)
            .slice(0, 3)
            .map((p) => `${p.nazov} (${p.free}/${p.minStav})`)
            .join(", "),
        }
      : null,
    staleApproval
      ? {
          tone: "o" as const,
          title: "Schválenie čaká viac ako 24 h",
          hint: staleApproval.title,
        }
      : null,
    apiErrors.length
      ? {
          tone: "o" as const,
          title: `Chyby Bot API: ${apiErrors.length} za 24 h`,
          hint: apiErrors
            .slice(0, 2)
            .map((e) => `${e.bot || "bot"} · ${e.status} ${e.route}`)
            .join(" · "),
        }
      : null,
    writesLastHour > 20
      ? {
          tone: "o" as const,
          title: `Viac ako 20 zápisov bota za hodinu`,
          hint: `${writesLastHour} zápisov / limit 20`,
        }
      : {
          tone: "g" as const,
          title: "Aktivita botov v norme",
          hint: `max. ${writesLastHour} zápisov/h · limit 20`,
        },
  ].filter((row): row is NonNullable<typeof row> => Boolean(row));

  const botIds = [
    { id: "servis", autor: "servis_bot" as const, name: "Servis bot" },
    { id: "hotline", autor: "hotline_bot" as const, name: "Hotline bot" },
    {
      id: "elevenlabs",
      autor: "elevenlabs_bot" as const,
      name: "ElevenLabs hotline",
    },
  ];
  const bots = botIds.map((bot) => {
    const writes = audit.filter((r) => r.autor === bot.autor);
    const today = writes.filter((r) => isSameLocalDay(r.at, now));
    const week = writes.filter((r) => inLastHours(r.at, 24 * 7, now));
    const ticketsCreated = week.filter(
      (r) => r.typ === "ticket" && r.akcia === "vytvoril",
    ).length;
    const ticketsChanged = week.filter(
      (r) => r.typ === "ticket" && r.akcia !== "vytvoril",
    ).length;
    const navrhyCount = week.filter((r) => r.akcia === "navrh").length;
    const botErrors = errors.filter(
      (e) => parseAuditAutor(e.bot) === bot.autor,
    ).length;
    return {
      ...bot,
      today: today.length,
      week: week.length,
      ticketsCreated,
      ticketsChanged,
      navrhy: navrhyCount,
      errors: botErrors,
      timeline: [
        ...writes.slice(0, 8).map((r) => ({
          at: r.at,
          text: r.popis,
          tone: r.akcia.includes("error") ? "d" : r.akcia === "navrh" ? "" : "a",
        })),
        ...errors
          .filter((e) => parseAuditAutor(e.bot) === bot.autor)
          .slice(0, 3)
          .map((e) => ({
            at: e.at,
            text: `chyba ${e.status} · ${e.route} · ${e.message}`,
            tone: "d",
          })),
      ]
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 6),
    };
  });

  return {
    now: now.toISOString(),
    pendingCount,
    deploy: deployInfo(),
    sync: {
      ok: syncOk,
      at: lastSyncAt,
      age: relativeAge(lastSyncAt, now),
      online: sync?.devicesOnline ?? devices.online,
      offline: sync?.devicesOffline ?? devices.offline,
      longOffline: sync?.devicesLongOffline ?? devices.longOffline,
      test: sync?.devicesTest ?? devices.test,
      error: sync?.error || devices.lastSyncError,
    },
    api: {
      today: todayRequests.length,
      servis: servisToday,
      hotline: hotlineToday,
      avgMs,
    },
    errors: {
      count: errors.length,
      items: errors.slice(0, 8),
    },
    db,
    approvals,
    alerts,
    bots,
    writesLastHour,
    audit: audit.slice(0, 40),
    lowStock: sklad.polozky.filter((p) => p.low),
  };
}

export { autorLabel };
