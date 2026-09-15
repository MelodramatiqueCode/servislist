"use client";

import { deleteVyjazdAction, mergeVyjazdAction } from "@/lib/actions";
import { vyjazdCode } from "@/lib/format";
import { VYJAZD_STATUS_LABELS, type VyjazdStatus } from "@/lib/types";

export function DeleteVyjazdButton({ id }: { id: string }) {
  return (
    <form
      action={deleteVyjazdAction}
      onSubmit={(e) => {
        if (!window.confirm("Naozaj zmazať tento výjazd? Akcia je nezvratná.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="btn btn-ghost w-full"
        style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
      >
        Zmazať výjazd
      </button>
    </form>
  );
}

export type MergeCandidate = {
  id: string;
  number: number;
  title: string;
  store: string;
  status: VyjazdStatus;
  stopCount: number;
};

export function MergeVyjazdForm({
  primaryId,
  primaryNumber,
  primaryTitle,
  candidates,
}: {
  primaryId: string;
  primaryNumber: number;
  primaryTitle: string;
  candidates: MergeCandidate[];
}) {
  const primaryCode = vyjazdCode(primaryNumber);

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-[var(--ink-soft)]">
        Žiadny iný naplánovaný alebo prebiehajúci výjazd na spojenie.
      </p>
    );
  }

  return (
    <form
      action={mergeVyjazdAction}
      className="space-y-3"
      onSubmit={(e) => {
        const selected = String(new FormData(e.currentTarget).get("secondaryId") ?? "");
        const other = candidates.find((c) => c.id === selected);
        if (!other) {
          e.preventDefault();
          return;
        }
        const otherCode = vyjazdCode(other.number);
        const confirmed = window.confirm(
          `Spojiť ${otherCode} „${other.title}“ do tohto výjazdu ${primaryCode}?\n\n` +
            `Zastávky z ${otherCode} sa pridajú na koniec trasy ${primaryCode}. ` +
            `Rovnaké zariadenie, ticket alebo prevádzka+adresa sa zlúčia. ` +
            `${otherCode} sa nezmaže natrvalo — ostane zrušený s poznámkou „Spojené do ${primaryCode}“.\n\n` +
            `Názov, technik a termín ostanú z ${primaryCode}` +
            (primaryTitle ? ` („${primaryTitle}“)` : "") +
            `; prázdne polia sa doplnia z ${otherCode}. Priorita bude vyššia z oboch.`,
        );
        if (!confirmed) e.preventDefault();
      }}
    >
      <input type="hidden" name="primaryId" value={primaryId} />
      <div className="field">
        <label htmlFor="secondaryId">Druhý výjazd</label>
        <select id="secondaryId" name="secondaryId" required defaultValue="">
          <option value="" disabled>
            Vyber výjazd…
          </option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {vyjazdCode(candidate.number)} · {candidate.title}
              {candidate.store ? ` · ${candidate.store}` : ""} ·{" "}
              {VYJAZD_STATUS_LABELS[candidate.status]}
              {candidate.stopCount > 1 ? ` · ${candidate.stopCount} zast.` : ""}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-primary w-full">
        Spojiť výjazdy
      </button>
    </form>
  );
}
