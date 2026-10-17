import Link from "next/link";
import { notFound } from "next/navigation";
import { korekciaAction } from "@/lib/actions";
import { formatDate, ticketCode } from "@/lib/format";
import { DlFileLink } from "@/components/dl-file-link";
import {
  getPolozka,
  listDodacieListy,
  listPohyby,
  reservedForOpenTickets,
  skladSnapshot,
} from "@/lib/sklad-store";
import { getPrevadzkaProfile, getTicket } from "@/lib/store";
import { storeLabel } from "@/lib/prevadzka-store";

export default async function SkladPolozkaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getPolozka(id);
  if (!item) notFound();
  const [pohyby, reserved, snap, listy] = await Promise.all([
    listPohyby({ polozkaId: id }),
    reservedForOpenTickets(),
    skladSnapshot(),
    listDodacieListy(),
  ]);
  const dlById = new Map(listy.map((d) => [d.id, d]));
  const row = snap.polozky.find((p) => p.id === id);
  const stock = row?.stock ?? 0;
  const reservedN = row?.reserved ?? 0;
  const installed = new Map<string, { qty: number; since: string }>();
  for (const p of pohyby.filter((x) => x.typ === "vydaj" && x.prevadzkaId)) {
    const cur = installed.get(p.prevadzkaId) ?? { qty: 0, since: p.datum };
    cur.qty += Math.abs(p.mnozstvo);
    if (new Date(p.datum) < new Date(cur.since)) cur.since = p.datum;
    installed.set(p.prevadzkaId, cur);
  }
  const installRows = await Promise.all(
    [...installed.entries()].map(async ([storeId, info]) => {
      const store = await getPrevadzkaProfile(storeId);
      return { storeId, label: store ? storeLabel(store) : storeId, ...info };
    }),
  );
  const reserves = reserved.filter((r) => r.polozkaId === id);
  const reserveTickets = await Promise.all(
    reserves.map(async (r) => {
      const ticket = await getTicket(r.ticketId);
      return { ...r, ticket };
    }),
  );

  return (
    <div className="shell detail-page space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/sklad" className="text-sm font-semibold">
            ← Späť na sklad
          </Link>
          <h1 className="mt-2 text-3xl font-extrabold">{item.nazov}</h1>
          <p className="text-[var(--ink-soft)]">
            <span className="font-mono">{item.kod}</span> · {item.kategoria} ·{" "}
            {item.jednotka}
          </p>
        </div>
        <Link href="/sklad/prijem" className="btn btn-primary">
          + Príjem
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="stat">
          <span className="label">Na sklade</span>
          <strong>
            {stock} {item.jednotka}
          </strong>
        </div>
        <div className="stat">
          <span className="label">Rezervované</span>
          <strong>
            {reservedN} {item.jednotka}
          </strong>
        </div>
        <div className="stat">
          <span className="label">Voľné</span>
          <strong>
            {stock - reservedN} {item.jednotka}
          </strong>
        </div>
        <div className="stat">
          <span className="label">Min. stav</span>
          <strong>
            {item.minStav} {item.jednotka}
          </strong>
        </div>
      </div>

      <div className="home-grid">
        <section className="panel space-y-3 p-5">
          <h2 className="text-lg font-bold">História pohybov</h2>
          <table className="profile-table">
            <thead>
              <tr>
                <th>Dátum</th>
                <th>Typ</th>
                <th>Množstvo</th>
                <th>Doklad</th>
                <th>Prevádzka</th>
              </tr>
            </thead>
            <tbody>
              {pohyby.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.datum)}</td>
                  <td>{p.typ}</td>
                  <td className={p.mnozstvo >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}>
                    {p.mnozstvo > 0 ? `+${p.mnozstvo}` : p.mnozstvo}
                  </td>
                  <td>
                    {p.ticketId ? (
                      <Link href={`/ticket/${p.ticketId}`}>Ticket</Link>
                    ) : p.dodaciListId ? (
                      dlById.get(p.dodaciListId)?.suborUrl ? (
                        <DlFileLink
                          url={dlById.get(p.dodaciListId)?.suborUrl}
                          name={dlById.get(p.dodaciListId)?.suborName || "DL"}
                        />
                      ) : (
                        "DL"
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{p.prevadzkaId ? "prevádzka" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-[var(--ink-soft)]">
            Výdaj vznikne automaticky, keď sa ticket uzavrie s materiálom
            „použité“.
          </p>
          <form action={korekciaAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="polozkaId" value={item.id} />
            <input
              name="mnozstvo"
              type="number"
              step="0.1"
              placeholder="Korekcia ±"
              className="rounded-xl border border-[var(--line)] px-3 py-2"
            />
            <button className="btn btn-ghost" type="submit">
              Uložiť korekciu
            </button>
          </form>
        </section>
        <aside className="space-y-4">
          <section className="side-box">
            <h2>Nainštalované na prevádzkach</h2>
            {installRows.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--ink-soft)]">Zatiaľ žiadne výdaje.</p>
            ) : (
              installRows.map((row) => (
                <Link
                  key={row.storeId}
                  href={`/prevadzky/${row.storeId}`}
                  className="ap"
                >
                  <div>
                    {row.label}
                    <small>
                      {row.qty} {item.jednotka} · od {formatDate(row.since)}
                    </small>
                  </div>
                </Link>
              ))
            )}
          </section>
          <section className="side-box">
            <h2>Rezervácie</h2>
            {reserveTickets.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--ink-soft)]">Žiadne.</p>
            ) : (
              reserveTickets.map((r) => (
                <Link key={r.ticketId} href={`/ticket/${r.ticketId}`} className="ap">
                  <div>
                    {r.ticket ? ticketCode(r.ticket.number) : r.ticketId}
                    <small>
                      {r.quantity} {item.jednotka} plánované
                    </small>
                  </div>
                </Link>
              ))
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
