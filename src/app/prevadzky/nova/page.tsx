import Link from "next/link";
import { PrevadzkaNovaForm } from "@/components/prevadzka-nova-form";

export default function NovaPrevadzkaPage() {
  return (
    <div className="shell detail-page max-w-4xl space-y-8">
      <div className="fade-up space-y-2">
        <Link href="/prevadzky" className="text-sm font-semibold text-[var(--teal)]">
          ← Späť na prevádzky
        </Link>
        <h1 className="text-3xl font-extrabold md:text-4xl">Nová prevádzka</h1>
        <p className="text-[var(--ink-soft)]">
          Založ predajňu ešte pred Balena zariadením. Vytvorí sa aj ticket
          montáže alebo spustenia s materiálom.
        </p>
      </div>
      <PrevadzkaNovaForm />
    </div>
  );
}
