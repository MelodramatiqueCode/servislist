import Link from "next/link";
import { resolveDlAction } from "@/lib/actions";
import { SKLAD_KATEGORIE } from "@/lib/sklad";
import { skladSnapshot } from "@/lib/sklad-store";
import { formatDate } from "@/lib/format";

type Search = Promise<{ q?: string; kat?: string; low?: string }>;

export default async function SkladPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const { q = "", kat = "", low } = await searchParams;
  const snap = await skladSnapshot();
  const onlyLow = low === "1";
  const rows = snap.polozky.filter((p) => {
    if (kat && p.kategoria !== kat) return false;
    if (onlyLow && !p.low) return false;
    if (q.trim()) {
      const hay = `${p.nazov} ${p.kod}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="shell page-stack space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label">Modul</div>
          <h1 className="text-3xl font-extrabold">Sklad</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/sklad/pohyby" className="btn btn-ghost">
            Všetky pohyby
          </Link>
          <Link href="/sklad/nova" className="btn btn-ghost">
            + Nová položka
          </Link>
          <Link href="/sklad/prijem" className="btn btn-primary">
            + Príjem (dodací list)
          </Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="stat">
          <span className="label">Položiek</span>
          <strong>{snap.stats.items}</strong>
        </div>
        <div className="stat">
          <span className="label">Pod min. stavom</span>
          <strong className={snap.stats.low ? "text-[var(--acc)]" : ""}>
            {snap.stats.low}
          </strong>
        </div>
        <div className="stat">
          <span className="label">Rezervované na ticketoch</span>
          <strong>{snap.stats.reservedTickets}</strong>
        </div>
        <div className="stat">
          <span className="label">Príjmy tento mesiac</span>
          <strong>{snap.stats.prijmyMonth}</strong>
        </div>
      </div>

      <div className="home-grid">
        <section className="panel space-y-4 p-5">
          <form className="flex flex-wrap gap-2" action="/sklad">
            <input
              name="q"
              defaultValue={q}
              placeholder="Hľadať položku alebo kód…"
              className="min-w-[200px] flex-1 rounded-xl border border-[var(--line)] px-3 py-2"
            />
            {kat ? <input type="hidden" name="kat" value={kat} /> : null}
            <button className="btn btn-ghost" type="submit">
              Hľadať
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            <Link href="/sklad" className="tab" data-on={!kat && !onlyLow}>
              Všetko
            </Link>
            {SKLAD_KATEGORIE.map((k) => (
              <Link
                key={k}
                href={`/sklad?kat=${encodeURIComponent(k)}`}
                className="tab"
                data-on={kat === k}
              >
                {k}
              </Link>
            ))}
            <Link href="/sklad?low=1" className="tab" data-on={onlyLow}>
              Nízky stav
            </Link>
          </div>
          <table className="profile-table">
            <thead>
              <tr>
                <th>Položka</th>
                <th>Kód</th>
                <th>Kategória</th>
                <th>Na sklade</th>
                <th>Rezerv.</th>
                <th>Voľné</th>
                <th>Min.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={p.low ? "bg-[#fff4ef]" : undefined}>
                  <td>
                    <Link href={`/sklad/polozky/${p.id}`} className="font-semibold">
                      {p.nazov}
                    </Link>
                    {p.low ? (
                      <span className="chip chip-warn chip-sm ml-2">nízky stav</span>
                    ) : null}
                  </td>
                  <td className="font-mono text-xs">{p.kod}</td>
                  <td>{p.kategoria}</td>
                  <td>
                    {p.stock} {p.jednotka}
                  </td>
                  <td>{p.reserved}</td>
                  <td>{p.free}</td>
                  <td>{p.minStav}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-[var(--ink-soft)]">
            Rezervované = plánovaný materiál na otvorených ticketoch. Voľné = na
            sklade − rezervované. Ceny sa nezobrazujú.
          </p>
        </section>

        <aside className="space-y-4">
          <section className="side-box">
            <h2>
              Na schválenie <span className="cnt">{snap.pending.length}</span>
            </h2>
            {snap.pending.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--ink-soft)]">
                Žiadny čakajúci príjem.
              </p>
            ) : (
              snap.pending.map((dl) => (
                <div key={dl.id} className="ap">
                  <div>
                    <div>
                      ⚡ Príjem · {dl.cisloDl || "bez čísla"}
                    </div>
                    <small>
                      {dl.dodavatel} · {dl.riadky.length} položiek · {dl.vytvoril}
                    </small>
                    <div className="mt-2 flex gap-2">
                      <form action={resolveDlAction}>
                        <input type="hidden" name="id" value={dl.id} />
                        <input type="hidden" name="action" value="accepted" />
                        <button className="btn btn-primary" type="submit">
                          Schváliť
                        </button>
                      </form>
                      <form action={resolveDlAction}>
                        <input type="hidden" name="id" value={dl.id} />
                        <input type="hidden" name="action" value="rejected" />
                        <button className="btn btn-ghost" type="submit">
                          Zamietnuť
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              ))
            )}
          </section>
          <section className="side-box">
            <h2>Posledné pohyby</h2>
            {snap.pohyby.slice(0, 8).map((p) => {
              const item = snap.polozky.find((x) => x.id === p.polozkaId);
              return (
                <div key={p.id} className="ap">
                  <div>
                    <b className={p.mnozstvo >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}>
                      {p.mnozstvo > 0 ? `+${p.mnozstvo}` : p.mnozstvo}
                    </b>{" "}
                    {item?.nazov || p.polozkaId}
                    <small>
                      {p.typ} · {formatDate(p.datum)}
                    </small>
                  </div>
                </div>
              );
            })}
            <Link href="/sklad/pohyby" className="mt-2 inline-block text-sm font-semibold">
              Všetky pohyby →
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
