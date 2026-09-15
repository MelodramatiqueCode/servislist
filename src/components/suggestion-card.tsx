import { createVyjazdAction } from "@/lib/actions";
import { OriginHiddenInputs } from "@/components/origin-hidden-inputs";
import { priorityClass } from "@/lib/format";
import { PRIORITY_LABELS } from "@/lib/types";
import type { VyjazdSuggestion } from "@/lib/suggestions";
import { prevadzkyCountLabel } from "@/lib/vyjazd-stops";

export function SuggestionCard({
  suggestion,
  compact = false,
}: {
  suggestion: VyjazdSuggestion;
  compact?: boolean;
}) {
  const s = suggestion;
  const routeOpt = s.options.find((opt) => opt.scope === "combined" && opt.stops.length > 1);
  const routeStops = routeOpt?.stops.length ?? 0;

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white/70 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-bold md:text-lg">
            {s.store}
          </div>
          {s.deviceName ? (
            <div className="truncate text-xs text-[var(--ink-soft)]">
              {s.deviceName}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`chip ${priorityClass(s.priority)}`}>
            {PRIORITY_LABELS[s.priority]}
          </span>
          {routeStops > 1 ? (
            <span className="chip chip-warn">
              Trasa · {prevadzkyCountLabel(routeStops)}
            </span>
          ) : s.storeDeviceCount > 1 ? (
            <span className="chip chip-warn">
              {s.storeDeviceCount} zariadení
            </span>
          ) : null}
        </div>
      </div>

      <ul className="mt-3 space-y-1 text-sm text-[var(--ink-soft)]">
        {s.reasons.slice(0, 3).map((reason) => (
          <li key={reason} className="flex gap-2">
            <span aria-hidden className="text-[var(--teal)]">
              •
            </span>
            <span>{reason}</span>
          </li>
        ))}
        {s.reasons.length > 3 ? (
          <li className="text-xs opacity-70">
            +{s.reasons.length - 3} ďalších dôvodov
          </li>
        ) : null}
      </ul>

      {routeOpt ? (
        <div className="mt-3 rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2.5">
          <div className="text-xs font-bold uppercase tracking-wide text-[var(--teal-deep)]">
            Trasa{s.routeTheme ? ` · ${s.routeTheme}` : ""}
          </div>
          <ol className="mt-1 space-y-0.5 text-sm">
            {routeOpt.stops.map((stop, index) => (
              <li key={`${stop.store}-${index}`} className="flex gap-2">
                <span className="font-semibold text-[var(--teal)]">
                  {index + 1}.
                </span>
                <span>{stop.store}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div
        className={`mt-4 grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}
      >
        {s.options.map((opt, index) => {
          const isRoute = opt.scope === "combined" && opt.stops.length > 1;
          const emphasize = isRoute || (!routeOpt && index === 0);
          return (
            <form key={opt.id} action={createVyjazdAction}>
              <input type="hidden" name="title" value={opt.title} />
              <input
                type="hidden"
                name="store"
                value={opt.stops[0]?.store || s.store}
              />
              <input
                type="hidden"
                name="address"
                value={opt.stops[0]?.address || s.address}
              />
              <input
                type="hidden"
                name="contactPhone"
                value={opt.stops[0]?.contactPhone || s.contactPhone}
              />
              <input type="hidden" name="scheduledAt" value={opt.scheduledAt} />
              <input type="hidden" name="priority" value={opt.priority} />
              <input type="hidden" name="status" value="naplanovany" />
              <input type="hidden" name="description" value={opt.description} />
              <input
                type="hidden"
                name="deviceUuid"
                value={opt.stops[0]?.deviceUuid || s.deviceUuid}
              />
              <input
                type="hidden"
                name="ticketId"
                value={opt.stops[0]?.ticketId || s.ticketId}
              />
              <input
                type="hidden"
                name="stopsJson"
                value={JSON.stringify(opt.stops)}
              />
              <OriginHiddenInputs />
              <button
                type="submit"
                className={`btn w-full text-left ${
                  emphasize ? "btn-primary" : "btn-ghost"
                }`}
                style={{
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "0.15rem",
                  paddingTop: "0.7rem",
                  paddingBottom: "0.7rem",
                }}
              >
                <span className="text-sm font-bold">{opt.label}</span>
                <span
                  className={`text-xs font-medium ${
                    isRoute || emphasize ? "opacity-90" : "opacity-70"
                  }`}
                >
                  {opt.hint}
                </span>
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
