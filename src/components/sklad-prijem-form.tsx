"use client";

import { useMemo, useState } from "react";
import { createPrijemAction } from "@/lib/actions";
import {
  SKLAD_JEDNOTKY,
  SKLAD_KATEGORIE,
  type SkladJednotka,
  type SkladKategoria,
} from "@/lib/sklad";

type CatalogItem = {
  id: string;
  kod: string;
  nazov: string;
  kategoria: SkladKategoria;
  jednotka: SkladJednotka;
  minStav: number;
};

type Line = {
  polozkaId: string;
  kod: string;
  nazov: string;
  kategoria: SkladKategoria;
  jednotka: SkladJednotka;
  minStav: number;
  mnozstvo: number;
  poznamka: string;
  nova: boolean;
};

export function SkladPrijemForm({ catalog }: { catalog: CatalogItem[] }) {
  const [lines, setLines] = useState<Line[]>([
    emptyExisting(catalog[0] ?? null),
  ]);

  const preview = useMemo(
    () => lines.filter((l) => l.nazov.trim() && l.mnozstvo > 0),
    [lines],
  );

  return (
    <form action={createPrijemAction} className="space-y-5">
      <input type="hidden" name="riadkyJson" value={JSON.stringify(preview)} />
      <section className="panel space-y-4 p-5">
        <h2 className="text-lg font-bold">Dodací list</h2>
        <div className="field">
          <label htmlFor="subor">Foto alebo PDF</label>
          <input id="subor" name="subor" type="file" accept="image/*,.pdf" />
          <p className="text-xs text-[var(--ink-soft)]">Max 4 MB. Bez cien.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="field">
            <label htmlFor="dodavatel">Dodávateľ</label>
            <input id="dodavatel" name="dodavatel" required />
          </div>
          <div className="field">
            <label htmlFor="cisloDl">Číslo DL</label>
            <input id="cisloDl" name="cisloDl" required />
          </div>
          <div className="field">
            <label htmlFor="datum">Dátum</label>
            <input id="datum" name="datum" type="date" />
          </div>
        </div>
      </section>

      <section className="panel space-y-4 p-5">
        <h2 className="text-lg font-bold">Položky</h2>
        <div className="space-y-3">
          {lines.map((line, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-12">
              <select
                className="md:col-span-5 rounded-xl border border-[var(--line)] px-3 py-2"
                value={line.nova ? "__new__" : line.polozkaId}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setLines((list) =>
                      list.map((r, idx) =>
                        idx === i ? { ...r, nova: true, polozkaId: "" } : r,
                      ),
                    );
                    return;
                  }
                  const hit = catalog.find((c) => c.id === e.target.value);
                  if (!hit) return;
                  setLines((list) =>
                    list.map((r, idx) =>
                      idx === i
                        ? {
                            ...r,
                            nova: false,
                            polozkaId: hit.id,
                            kod: hit.kod,
                            nazov: hit.nazov,
                            kategoria: hit.kategoria,
                            jednotka: hit.jednotka,
                            minStav: hit.minStav,
                          }
                        : r,
                    ),
                  );
                }}
              >
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nazov} · {c.kod}
                  </option>
                ))}
                <option value="__new__">+ Nová položka</option>
              </select>
              {line.nova ? (
                <input
                  className="md:col-span-3 rounded-xl border border-[var(--line)] px-3 py-2"
                  placeholder="Názov novej položky"
                  value={line.nazov}
                  onChange={(e) =>
                    setLines((list) =>
                      list.map((r, idx) =>
                        idx === i ? { ...r, nazov: e.target.value } : r,
                      ),
                    )
                  }
                />
              ) : null}
              <input
                className="md:col-span-2 rounded-xl border border-[var(--line)] px-3 py-2"
                type="number"
                min="0"
                step="0.1"
                value={line.mnozstvo}
                onChange={(e) =>
                  setLines((list) =>
                    list.map((r, idx) =>
                      idx === i
                        ? { ...r, mnozstvo: Number(e.target.value) }
                        : r,
                    ),
                  )
                }
              />
              <input
                className="md:col-span-2 rounded-xl border border-[var(--line)] px-3 py-2"
                value={line.jednotka}
                readOnly={!line.nova}
                onChange={(e) =>
                  setLines((list) =>
                    list.map((r, idx) =>
                      idx === i
                        ? { ...r, jednotka: e.target.value as SkladJednotka }
                        : r,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="btn btn-ghost md:col-span-1"
                onClick={() =>
                  setLines((list) => list.filter((_, idx) => idx !== i))
                }
              >
                ×
              </button>
              {line.nova ? (
                <div className="md:col-span-12 grid gap-2 md:grid-cols-3">
                  <input
                    className="rounded-xl border border-[var(--line)] px-3 py-2"
                    placeholder="Kód"
                    value={line.kod}
                    onChange={(e) =>
                      setLines((list) =>
                        list.map((r, idx) =>
                          idx === i ? { ...r, kod: e.target.value } : r,
                        ),
                      )
                    }
                  />
                  <select
                    className="rounded-xl border border-[var(--line)] px-3 py-2"
                    value={line.kategoria}
                    onChange={(e) =>
                      setLines((list) =>
                        list.map((r, idx) =>
                          idx === i
                            ? {
                                ...r,
                                kategoria: e.target.value as SkladKategoria,
                              }
                            : r,
                        ),
                      )
                    }
                  >
                    {SKLAD_KATEGORIE.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                  <select
                    className="rounded-xl border border-[var(--line)] px-3 py-2"
                    value={line.jednotka}
                    onChange={(e) =>
                      setLines((list) =>
                        list.map((r, idx) =>
                          idx === i
                            ? { ...r, jednotka: e.target.value as SkladJednotka }
                            : r,
                        ),
                      )
                    }
                  >
                    {SKLAD_JEDNOTKY.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() =>
            setLines((list) => [...list, emptyExisting(catalog[0] ?? null)])
          }
        >
          + Položka
        </button>
      </section>
      <button type="submit" className="btn btn-primary">
        Uložiť príjem — na schválenie
      </button>
    </form>
  );
}

function emptyExisting(item: CatalogItem | null): Line {
  return {
    polozkaId: item?.id ?? "",
    kod: item?.kod ?? "",
    nazov: item?.nazov ?? "",
    kategoria: item?.kategoria ?? "Iné",
    jednotka: item?.jednotka ?? "ks",
    minStav: item?.minStav ?? 0,
    mnozstvo: 1,
    poznamka: "",
    nova: !item,
  };
}
