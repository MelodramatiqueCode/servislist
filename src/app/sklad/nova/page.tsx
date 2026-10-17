import Link from "next/link";
import { createPolozkaAction } from "@/lib/actions";
import { SKLAD_JEDNOTKY, SKLAD_KATEGORIE } from "@/lib/sklad";

export default function NovaPolozkaPage() {
  return (
    <div className="shell detail-page max-w-2xl space-y-6">
      <div>
        <Link href="/sklad" className="text-sm font-semibold">
          ← Späť na sklad
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold">Nová položka</h1>
        <p className="text-[var(--ink-soft)]">
          Katalóg bez cien. Stav sa dopočíta z pohybov.
        </p>
      </div>
      <form action={createPolozkaAction} className="panel space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="field">
            <label htmlFor="nazov">Názov</label>
            <input id="nazov" name="nazov" required />
          </div>
          <div className="field">
            <label htmlFor="kod">Kód</label>
            <input id="kod" name="kod" required />
          </div>
          <div className="field">
            <label htmlFor="kategoria">Kategória</label>
            <select id="kategoria" name="kategoria" defaultValue="Iné">
              {SKLAD_KATEGORIE.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="jednotka">Jednotka</label>
            <select id="jednotka" name="jednotka" defaultValue="ks">
              {SKLAD_JEDNOTKY.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="minStav">Min. stav</label>
            <input id="minStav" name="minStav" type="number" defaultValue={0} />
          </div>
          <div className="field">
            <label htmlFor="poznamka">Poznámka</label>
            <input id="poznamka" name="poznamka" />
          </div>
        </div>
        <button className="btn btn-primary" type="submit">
          Uložiť položku
        </button>
      </form>
    </div>
  );
}
