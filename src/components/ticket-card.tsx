import Link from "next/link";
import { updateStatusAction } from "@/lib/actions";
import { ticketCode } from "@/lib/format";
import {
  formatDayShort,
  isBotSource,
  plannedVyjazdForTicket,
  relativeAge,
  ticketProgress,
  ticketSourceLabel,
  ticketStripeClass,
} from "@/lib/pulse";
import { STATUS_LABELS, type Ticket, type Vyjazd } from "@/lib/types";
import { isTicketArchived } from "@/lib/ticket-archive";

export function TicketCard({
  ticket,
  storeLabel,
  phone,
  mapsHref,
  vyjazdy,
}: {
  ticket: Ticket;
  storeLabel: string;
  phone: string;
  mapsHref: string;
  vyjazdy: Vyjazd[];
}) {
  const source = ticketSourceLabel(ticket);
  const planned = plannedVyjazdForTicket(ticket.id, vyjazdy);
  const archived = isTicketArchived(ticket);
  const statusChip = planned
    ? `Výjazd ${formatDayShort(planned.scheduledAt)}`
    : STATUS_LABELS[ticket.status];
  const statusClass = planned
    ? "s-plan"
    : ticket.status === "otvorene"
      ? "s-otvorene"
      : ticket.status === "v_rieseni"
        ? "s-riesi"
        : ticket.status === "caka_diely"
          ? "s-plan"
          : "s-hotove";

  return (
    <article className={`pulse-card ${ticketStripeClass(ticket.priority)}`}>
      <Link href={`/ticket/${ticket.id}`} className="block">
        <div className="r1">
          <span className="id">{ticketCode(ticket.number).replace("#", "T-")}</span>
          <span>
            {ticket.status === "otvorene" ? <span className="pulse r" /> : null}
            {relativeAge(ticket.updatedAt)}
          </span>
        </div>
        <div className="store">{storeLabel}</div>
        <div className="prob">{ticket.title}</div>
        <div className="bar">
          <i style={{ width: `${ticketProgress(ticket.status)}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={`chip ${statusClass}`}>{statusChip}</span>
          <span className={`src text-[11.5px] font-semibold ${isBotSource(source) ? "text-[var(--ink)]" : "text-[var(--ink-soft)]"}`}>
            {isBotSource(source) ? `⚡ ${source}` : source}
          </span>
        </div>
      </Link>
      <div className="qa">
        {phone ? (
          <a href={`tel:${phone}`}>📞 Volať</a>
        ) : (
          <span className="pointer-events-none opacity-40">📞 Volať</span>
        )}
        {mapsHref ? (
          <a href={mapsHref} target="_blank" rel="noopener noreferrer">
            🧭 Navigovať
          </a>
        ) : (
          <span className="pointer-events-none opacity-40">🧭 Navigovať</span>
        )}
        {archived || ticket.status === "hotove" ? (
          <span className="pointer-events-none opacity-40">✓ Hotovo</span>
        ) : (
          <form action={updateStatusAction}>
            <input type="hidden" name="id" value={ticket.id} />
            <input type="hidden" name="status" value="hotove" />
            <button type="submit">✓ Hotovo</button>
          </form>
        )}
      </div>
    </article>
  );
}
