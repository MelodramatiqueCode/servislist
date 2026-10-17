import Link from "next/link";
import {
  confirmPrevadzkaAction,
  resolveDlAction,
  resolveSuggestionAction,
} from "@/lib/actions";
import { relativeAge } from "@/lib/pulse";
import { storeLabel } from "@/lib/prevadzka-store";
import type { PrevadzkaRecord, ProfileSuggestion } from "@/lib/prevadzka-profile";
import type { DodaciList } from "@/lib/sklad";

export function ApprovalsPanel({
  stores,
  suggestions,
  prijmy = [],
  storeById,
}: {
  stores: PrevadzkaRecord[];
  suggestions: ProfileSuggestion[];
  prijmy?: DodaciList[];
  storeById: Map<string, PrevadzkaRecord>;
}) {
  const items = [
    ...stores.map((store) => ({
      id: `store-${store.id}`,
      href: `/prevadzky/${store.id}`,
      title: `Nová prevádzka ${storeLabel(store)}`,
      hint: `návrh · ${relativeAge(store.createdAt)}`,
      kind: "store" as const,
      storeId: store.id,
      suggestionId: "",
      dlId: "",
    })),
    ...suggestions.map((s) => ({
      id: `sug-${s.id}`,
      href: `/prevadzky/${s.prevadzkaId}`,
      title: s.summary || "Úprava profilu",
      hint: `${s.actorName} · ${relativeAge(s.createdAt)}`,
      kind: "suggestion" as const,
      storeId: s.prevadzkaId,
      suggestionId: s.id,
      dlId: "",
    })),
    ...prijmy.map((dl) => ({
      id: `dl-${dl.id}`,
      href: "/sklad",
      title: `Príjem ${dl.cisloDl || "dodací list"}`,
      hint: `${dl.dodavatel || "sklad"} · ${dl.riadky.length} položiek · ${relativeAge(dl.createdAt)}`,
      kind: "prijem" as const,
      storeId: "",
      suggestionId: "",
      dlId: dl.id,
    })),
  ];

  return (
    <aside className="side-box side-first">
      <h2>
        Na schválenie{" "}
        <span className="cnt">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--ink-soft)]">
          Žiadne čakajúce návrhy.
        </p>
      ) : (
        items.slice(0, 8).map((item) => (
          <div key={item.id} className="ap">
            <Link href={item.href} className="min-w-0">
              <div>⚡ {item.title}</div>
              <small>
                {item.kind === "suggestion"
                  ? storeById.get(item.storeId)
                    ? storeLabel(storeById.get(item.storeId)!)
                    : item.hint
                  : item.hint}
              </small>
            </Link>
            {item.kind === "store" ? (
              <form action={confirmPrevadzkaAction}>
                <input type="hidden" name="id" value={item.storeId} />
                <button className="ok" type="submit" aria-label="Schváliť">
                  ✓
                </button>
              </form>
            ) : item.kind === "prijem" ? (
              <form action={resolveDlAction}>
                <input type="hidden" name="id" value={item.dlId} />
                <input type="hidden" name="action" value="accepted" />
                <button className="ok" type="submit" aria-label="Schváliť">
                  ✓
                </button>
              </form>
            ) : (
              <form action={resolveSuggestionAction}>
                <input type="hidden" name="suggestionId" value={item.suggestionId} />
                <input type="hidden" name="prevadzkaId" value={item.storeId} />
                <input type="hidden" name="action" value="accepted" />
                <button className="ok" type="submit" aria-label="Schváliť">
                  ✓
                </button>
              </form>
            )}
          </div>
        ))
      )}
      <Link href="/kontrola" className="btn btn-primary mt-3 w-full">
        Všetky v Kontrole →
      </Link>
    </aside>
  );
}
