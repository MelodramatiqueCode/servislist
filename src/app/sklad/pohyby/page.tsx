import Link from "next/link";
import { formatDate } from "@/lib/format";
import { POHYB_TYPY } from "@/lib/sklad";
import { listPolozky, listPohyby } from "@/lib/sklad-store";
import { listPrevadzkaProfiles } from "@/lib/store";
import { storeLabel } from "@/lib/prevadzka-store";

type Search = Promise<{
  typ?: string;
  polozka?: string;
  prevadzka?: string;
  od?: string;
  do?: string;
}>;

export default async function SkladPohybyPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const params = await searchParams;
  const [pohyby, polozky, stores] = await Promise.all([
    listPohyby({
      typ: POHYB_TYPY.includes(params.typ as never)
        ? (params.typ as (typeof POHYB_TYPY)[number])
        : undefined,
      polozkaId: params.polozka,
      prevadzkaId: params.prevadzka,
      from: params.od,
      to: params.do,
    }),
    listPolozky(),
    listPrevadzkaProfiles(),
  ]);
  const byId = new Map(polozky.map((p) => [p.id, p]));
  const storeById = new Map(stores.map((s) => [s.id, s]));

  return (
    <div className="shell page-stack space-y-6">
      <div>
        <Link href="/sklad" className="text-sm font-semibold">
          ← Späť na sklad
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold">Všetky pohyby</h1>
      </div>
      <form className="panel flex flex-wrap gap-3 p-4" action="/sklad/pohyby">
        <select name="typ" defaultValue={params.typ ?? ""} className="pulse-filter">
          <option value="">Typ</option>
          {POHYB_TYPY.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          name="polozka"
          defaultValue={params.polozka ?? ""}
          className="pulse-filter"
        >
          <option value="">Položka</option>
          {polozky.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nazov}
            </option>
          ))}
        </select>
        <select
          name="prevadzka"
          defaultValue={params.prevadzka ?? ""}
          className="pulse-filter"
        >
          <option value="">Prevádzka</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {storeLabel(s)}
            </option>
          ))}
        </select>
        <input name="od" type="date" defaultValue={params.od} className="pulse-filter" />
        <input name="do" type="date" defaultValue={params.do} className="pulse-filter" />
        <button className="btn btn-ghost" type="submit">
          Filtrovať
        </button>
      </form>
      <section className="panel overflow-hidden">
        <table className="profile-table">
          <thead>
            <tr>
              <th>Dátum</th>
              <th>Typ</th>
              <th>Položka</th>
              <th>Množstvo</th>
              <th>Prevádzka</th>
              <th>Kto</th>
            </tr>
          </thead>
          <tbody>
            {pohyby.map((p) => (
              <tr key={p.id}>
                <td>{formatDate(p.datum)}</td>
                <td>{p.typ}</td>
                <td>
                  <Link href={`/sklad/polozky/${p.polozkaId}`}>
                    {byId.get(p.polozkaId)?.nazov || p.polozkaId}
                  </Link>
                </td>
                <td className={p.mnozstvo >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}>
                  {p.mnozstvo > 0 ? `+${p.mnozstvo}` : p.mnozstvo}
                </td>
                <td>
                  {p.prevadzkaId
                    ? storeById.get(p.prevadzkaId)
                      ? storeLabel(storeById.get(p.prevadzkaId)!)
                      : p.prevadzkaId
                    : "—"}
                </td>
                <td>{p.kto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
