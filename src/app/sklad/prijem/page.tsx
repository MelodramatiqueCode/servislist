import Link from "next/link";
import { SkladPrijemForm } from "@/components/sklad-prijem-form";
import { ensureSkladCatalog, listPolozky } from "@/lib/sklad-store";

export default async function SkladPrijemPage() {
  await ensureSkladCatalog();
  const catalog = await listPolozky();
  return (
    <div className="shell detail-page max-w-5xl space-y-6">
      <div>
        <Link href="/sklad" className="text-sm font-semibold">
          ← Späť na sklad
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold">Nový príjem (dodací list)</h1>
        <p className="text-[var(--ink-soft)]">
          Bez cien. Príjem z webu ide rovno na schválenie, rovnako ako od bota.
        </p>
      </div>
      <SkladPrijemForm
        catalog={catalog.map((p) => ({
          id: p.id,
          kod: p.kod,
          nazov: p.nazov,
          kategoria: p.kategoria,
          jednotka: p.jednotka,
          minStav: p.minStav,
        }))}
      />
    </div>
  );
}
