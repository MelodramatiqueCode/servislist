import Link from "next/link";
import {
  confirmPrevadzkaAction,
  rejectPrevadzkaAction,
  resolveDlAction,
  resolveNavrhAction,
  resolveSuggestionAction,
} from "@/lib/actions";
import { formatDateTime } from "@/lib/format";
import { autorLabel, AUDIT_AUTORI, AUDIT_TYPY } from "@/lib/kontrola";
import { kontrolaSnapshot } from "@/lib/kontrola-view";
import { relativeAge } from "@/lib/pulse";

type Search = Promise<{
  q?: string;
  autor?: string;
  typ?: string;
  akcia?: string;
}>;

export default async function KontrolaPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const params = await searchParams;
  const snap = await kontrolaSnapshot();
  const audit = snap.audit.filter((row) => {
    if (params.autor && row.autor !== params.autor) return false;
    if (params.typ && row.typ !== params.typ) return false;
    if (params.akcia && row.akcia !== params.akcia) return false;
    if (params.q?.trim()) {
      const q = params.q.trim().toLowerCase();
      if (!`${row.popis} ${row.entityId} ${row.akcia}`.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="shell page-stack space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label">Admin · len Martin</div>
          <h1 className="text-3xl font-extrabold">Kontrola</h1>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">
          Aktualizované {formatDateTime(snap.now)} · Balena len na čítanie
        </p>
      </div>

      <section className="panel space-y-4 p-5">
        <h2 className="text-lg font-bold">Stav systému</h2>
        <div className="ctrl-tiles">
          <div className={`ctrl-tile ${snap.sync.ok ? "ok" : "warn"}`}>
            <div className="k">
              Balena sync <span>{snap.sync.ok ? "● OK" : "● stojí"}</span>
            </div>
            <strong>{snap.sync.at ? `pred ${snap.sync.age}` : "nikdy"}</strong>
            <div className="s">
              online {snap.sync.online} · offline {snap.sync.offline}
              <br />
              dlhodobo {snap.sync.longOffline} · test {snap.sync.test}
            </div>
          </div>
          <div className="ctrl-tile ok">
            <div className="k">
              Deploy appky <span>● OK</span>
            </div>
            <strong>{snap.deploy.shortSha || snap.deploy.env || "local"}</strong>
            <div className="s">
              {snap.deploy.ref}{" "}
              {snap.deploy.shortSha ? (
                <span className="font-mono">{snap.deploy.shortSha}</span>
              ) : null}
              <br />
              {(snap.deploy.message || snap.deploy.builtAt || "bez správy").slice(0, 48)}
            </div>
          </div>
          <div className="ctrl-tile ok">
            <div className="k">
              Bot API <span>● {snap.api.today} dnes</span>
            </div>
            <strong>{snap.api.today} požiadaviek</strong>
            <div className="s">
              Servis {snap.api.servis} · Hotline {snap.api.hotline}
              <br />
              priem. odozva {snap.api.avgMs} ms
            </div>
          </div>
          <div className={`ctrl-tile ${snap.errors.count ? "warn" : "ok"}`}>
            <div className="k">
              Chyby 24 h <span>● {snap.errors.count}</span>
            </div>
            <strong>{snap.errors.count} chyby</strong>
            <div className="s">
              {snap.errors.items[0]
                ? `${snap.errors.items[0].status} ${snap.errors.items[0].route}`
                : "žiadne"}
            </div>
          </div>
          <div className={`ctrl-tile ${snap.db.ok ? "ok" : "bad"}`}>
            <div className="k">
              Databáza <span>{snap.db.ok ? "● OK" : "● chyba"}</span>
            </div>
            <strong>
              {snap.db.label}
              {snap.db.ms ? ` · ${snap.db.ms} ms` : ""}
            </strong>
            <div className="s">
              {snap.db.ok ? "schéma aktuálna" : snap.db.error || "nedostupná"}
            </div>
          </div>
        </div>
      </section>

      <div className="home-grid">
        <section className="panel space-y-3 p-5">
          <h2 className="text-lg font-bold">
            Na schválenie{" "}
            <span className="cnt">{snap.approvals.length}</span>
          </h2>
          {snap.approvals.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">Žiadne čakajúce návrhy.</p>
          ) : (
            snap.approvals.map((item) => (
              <div key={item.id} className="ctrl-ap">
                <span className="who">{item.actor}</span>
                <div>
                  <Link href={item.href} className="font-semibold">
                    {item.title}
                  </Link>
                  <small>{item.hint}</small>
                </div>
                <span className={item.stale ? "text-[var(--danger)]" : "text-[var(--ink-soft)]"}>
                  {item.stale ? "⚠ " : ""}
                  {relativeAge(item.createdAt)}
                </span>
                <div className="acts">
                  {item.kind === "store" && item.storeId ? (
                    <>
                      <form action={confirmPrevadzkaAction}>
                        <input type="hidden" name="id" value={item.storeId} />
                        <button className="btn btn-primary" type="submit">
                          Schváliť
                        </button>
                      </form>
                      <Link href={item.href} className="btn btn-ghost">
                        Upraviť
                      </Link>
                      <form action={rejectPrevadzkaAction}>
                        <input type="hidden" name="id" value={item.storeId} />
                        <button className="btn btn-ghost text-[var(--danger)]" type="submit">
                          Zamietnuť
                        </button>
                      </form>
                    </>
                  ) : null}
                  {item.kind === "suggestion" && item.suggestionId && item.storeId ? (
                    <>
                      <form action={resolveSuggestionAction}>
                        <input type="hidden" name="suggestionId" value={item.suggestionId} />
                        <input type="hidden" name="prevadzkaId" value={item.storeId} />
                        <input type="hidden" name="action" value="accepted" />
                        <button className="btn btn-primary" type="submit">
                          Schváliť
                        </button>
                      </form>
                      <Link href={item.href} className="btn btn-ghost">
                        Upraviť
                      </Link>
                      <form action={resolveSuggestionAction}>
                        <input type="hidden" name="suggestionId" value={item.suggestionId} />
                        <input type="hidden" name="prevadzkaId" value={item.storeId} />
                        <input type="hidden" name="action" value="rejected" />
                        <button className="btn btn-ghost text-[var(--danger)]" type="submit">
                          Zamietnuť
                        </button>
                      </form>
                    </>
                  ) : null}
                  {item.kind === "prijem" && item.dlId ? (
                    <>
                      <form action={resolveDlAction}>
                        <input type="hidden" name="id" value={item.dlId} />
                        <input type="hidden" name="action" value="accepted" />
                        <button className="btn btn-primary" type="submit">
                          Schváliť
                        </button>
                      </form>
                      <Link href="/sklad" className="btn btn-ghost">
                        Upraviť
                      </Link>
                      <form action={resolveDlAction}>
                        <input type="hidden" name="id" value={item.dlId} />
                        <input type="hidden" name="action" value="rejected" />
                        <button className="btn btn-ghost text-[var(--danger)]" type="submit">
                          Zamietnuť
                        </button>
                      </form>
                    </>
                  ) : null}
                  {(item.kind === "ticket" || item.kind === "vyjazd") && item.navrhId ? (
                    <>
                      <form action={resolveNavrhAction}>
                        <input type="hidden" name="id" value={item.navrhId} />
                        <input type="hidden" name="action" value="accepted" />
                        <button className="btn btn-primary" type="submit">
                          Schváliť
                        </button>
                      </form>
                      <Link href={item.href} className="btn btn-ghost">
                        Upraviť
                      </Link>
                      <form action={resolveNavrhAction}>
                        <input type="hidden" name="id" value={item.navrhId} />
                        <input type="hidden" name="action" value="rejected" />
                        <button className="btn btn-ghost text-[var(--danger)]" type="submit">
                          Zamietnuť
                        </button>
                      </form>
                    </>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </section>

        <aside className="panel space-y-3 p-5">
          <h2 className="text-lg font-bold">Upozornenia</h2>
          {snap.alerts.map((alert) => (
            <div key={alert.title} className={`al ${alert.tone}`}>
              <div>
                <b>{alert.title}</b>
                <div className="text-sm text-[var(--ink-soft)]">{alert.hint}</div>
              </div>
            </div>
          ))}
        </aside>
      </div>

      <section className="panel space-y-4 p-5">
        <h2 className="text-lg font-bold">Aktivita botov</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {snap.bots.map((bot) => (
            <div key={bot.id}>
              <h3 className="mb-2 font-bold">{bot.name}</h3>
              <div className="cnt">
                <div>
                  dnes<b>{bot.today} zápisov</b>
                </div>
                <div>
                  týždeň<b>{bot.week}</b>
                </div>
                <div>
                  tickety<b>
                    {bot.ticketsCreated} / {bot.ticketsChanged}
                  </b>
                </div>
                <div>
                  {bot.id === "hotline" ? "chyby" : "návrhy"}
                  <b>{bot.id === "hotline" ? bot.errors : bot.navrhy}</b>
                </div>
              </div>
              <div className="tl">
                {bot.timeline.length === 0 ? (
                  <p className="text-sm text-[var(--ink-soft)]">Zatiaľ ticho.</p>
                ) : (
                  bot.timeline.map((e) => (
                    <div key={`${bot.id}-${e.at}-${e.text}`} className={`e ${e.tone}`}>
                      <b>{formatTime(e.at)}</b> {e.text}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          Formát počítadla ticketov: vytvorené / zmenené tento týždeň.
        </p>
      </section>

      <section className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">História zmien</h2>
          <Link href="/kontrola/export" className="btn btn-ghost">
            Export CSV
          </Link>
        </div>
        <form className="flex flex-wrap gap-2" action="/kontrola">
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Hľadať v popise, tickete, prevádzke…"
            className="min-w-[200px] flex-1 rounded-xl border border-[var(--line)] px-3 py-2"
          />
          <select name="autor" defaultValue={params.autor ?? ""} className="pulse-filter">
            <option value="">Autor: všetci</option>
            {AUDIT_AUTORI.map((a) => (
              <option key={a} value={a}>
                {autorLabel(a)}
              </option>
            ))}
          </select>
          <select name="typ" defaultValue={params.typ ?? ""} className="pulse-filter">
            <option value="">Typ: všetko</option>
            {AUDIT_TYPY.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select name="akcia" defaultValue={params.akcia ?? ""} className="pulse-filter">
            <option value="">Akcia: všetky</option>
            <option value="vytvoril">vytvoril</option>
            <option value="zmenil">zmenil</option>
            <option value="uzavrel">uzavrel</option>
            <option value="navrh">návrh</option>
            <option value="schvalil">schválil</option>
            <option value="zamietol">zamietol</option>
            <option value="sync">sync</option>
          </select>
          <button className="btn btn-ghost" type="submit">
            Filtrovať
          </button>
        </form>
        <table className="profile-table">
          <thead>
            <tr>
              <th>Čas</th>
              <th>Autor</th>
              <th>Typ</th>
              <th>Akcia</th>
              <th>Popis</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap">{formatDateTime(row.at)}</td>
                <td>{autorLabel(row.autor)}</td>
                <td>{row.typ}</td>
                <td>{row.akcia}</td>
                <td>{row.popis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
