import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  addMaterialAction,
  addVykazAction,
  confirmPrevadzkaAction,
  deleteMaterialAction,
  linkDeviceAction,
  rejectPrevadzkaAction,
  resolveSuggestionAction,
  updateMaterialAction,
} from "@/lib/actions";
import { MapsNavLink } from "@/components/maps-nav-link";
import { formatDate, statusClass, ticketCode, vyjazdCode } from "@/lib/format";
import {
  JOB_TYPE_LABELS,
  formatOpeningHours,
} from "@/lib/prevadzka-profile";
import { getPrevadzkaProfile, listDevices } from "@/lib/store";
import { loadPrevadzkaDetail } from "@/lib/prevadzka-view";
import { hardwareLabel } from "@/lib/parse-device";
import {
  MATERIAL_STATUS_LABELS,
  type MaterialItem,
} from "@/lib/material";
import {
  VYKAZ_TYPE_LABELS,
  VYKAZ_TYPES,
} from "@/lib/vykaz-prace";
import { STATUS_LABELS } from "@/lib/types";

type Params = Promise<{ id: string }>;
type Search = Promise<{ typ?: string }>;

export default async function PrevadzkaDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { id } = await params;
  const { typ } = await searchParams;
  const store = await getPrevadzkaProfile(id);
  if (!store) notFound();
  const detail = await loadPrevadzkaDetail(store, { vykazType: typ });
  const allDevices = await listDevices();
  const linked = new Set(detail.devices.map((d) => d.uuid));
  const available = allDevices.filter((d) => !linked.has(d.uuid));
  const callContact = store.profile.contacts.find((c) => c.callBeforeVisit);

  return (
    <div className="shell detail-page space-y-8">
      <div className="fade-up space-y-3">
        <Link href="/prevadzky" className="text-sm font-semibold text-[var(--teal)]">
          ← Späť na prevádzky
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {store.code ? (
            <span className="font-display text-sm font-bold text-[var(--teal-deep)]">
              #{store.code}
            </span>
          ) : null}
          {store.chain ? (
            <span className="chip prio-normalna">{store.chain}</span>
          ) : null}
          <span className="chip chip-ok">
            Online {detail.online}/{detail.devices.length}
          </span>
          {detail.openTickets.length ? (
            <span className="chip status-otvorene">
              {detail.openTickets.length} otvorený ticket
            </span>
          ) : null}
          {store.status === "pending" ? (
            <span className="chip chip-warn">Návrh — čaká na schválenie</span>
          ) : null}
          {store.jobType ? (
            <span className="chip chip-edit">{JOB_TYPE_LABELS[store.jobType]}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold md:text-4xl">{detail.label}</h1>
            <p className="text-[var(--ink-soft)]">
              {[store.address, store.city].filter(Boolean).join(", ") || "—"}
              {detail.hoursLabel ? ` · ${detail.hoursLabel}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {detail.mapsHref ? (
              <MapsNavLink href={detail.mapsHref} className="btn btn-ghost">
                Navigovať
              </MapsNavLink>
            ) : null}
            <Link href={`/prevadzky/${store.id}/upravit`} className="btn btn-ghost">
              Upraviť profil
            </Link>
            <Link
              href={`/vyjazdy/novy?prevadzka=${store.id}`}
              className="btn btn-primary"
            >
              + Naplánovať výjazd
            </Link>
          </div>
        </div>
      </div>

      {store.status === "pending" ? (
        <section className="panel fade-up space-y-3 p-5">
          <h2 className="text-lg font-bold">Návrh z bota</h2>
          <p className="text-sm text-[var(--ink-soft)]">
            Bot navrhol novú prevádzku. Schválením ostane v zozname; zamietnutie
            archivuje naviazaný ticket.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={confirmPrevadzkaAction}>
              <input type="hidden" name="id" value={store.id} />
              <button className="btn btn-primary" type="submit">
                Schváliť
              </button>
            </form>
            <form action={rejectPrevadzkaAction}>
              <input type="hidden" name="id" value={store.id} />
              <button className="btn btn-ghost" type="submit">
                Zamietnuť
              </button>
            </form>
          </div>
        </section>
      ) : null}

      {detail.suggestions.length ? (
        <section className="panel fade-up space-y-3 p-5">
          <h2 className="text-lg font-bold">Návrhy úprav profilu</h2>
          {detail.suggestions.map((s) => (
            <div key={s.id} className="note">
              <div className="text-sm font-semibold">
                {s.actorName} · {s.summary}
              </div>
              <p className="text-xs text-[var(--ink-soft)]">
                {formatDate(s.createdAt)}
              </p>
              <div className="mt-2 flex gap-2">
                <form action={resolveSuggestionAction}>
                  <input type="hidden" name="suggestionId" value={s.id} />
                  <input type="hidden" name="prevadzkaId" value={store.id} />
                  <input type="hidden" name="action" value="accepted" />
                  <button className="btn btn-primary" type="submit">
                    Schváliť
                  </button>
                </form>
                <form action={resolveSuggestionAction}>
                  <input type="hidden" name="suggestionId" value={s.id} />
                  <input type="hidden" name="prevadzkaId" value={store.id} />
                  <input type="hidden" name="action" value="rejected" />
                  <button className="btn btn-ghost" type="submit">
                    Zamietnuť
                  </button>
                </form>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Stat
          href="/"
          label="Otvorené tickety"
          value={String(detail.openTickets.length)}
          auto
        />
        <Stat
          href={detail.lastVyjazd ? `/vyjazdy/${detail.lastVyjazd.id}` : "/vyjazdy"}
          label="Posledný výjazd"
          value={
            detail.lastVyjazd
              ? formatDate(detail.lastVyjazd.scheduledAt || detail.lastVyjazd.updatedAt)
              : "—"
          }
          hint={detail.lastVyjazd?.title}
          auto
        />
        <Stat href="/zariadenia?health=offline" label="Výpadky 30 dní" value={`${detail.outages30}×`} auto />
        <Link href={`/prevadzky/${store.id}/upravit`} className="stat">
          <span className="label">Profil vyplnený</span>
          <strong>{detail.completeness.percent} %</strong>
          <div className="bar mt-2">
            <i style={{ width: `${detail.completeness.percent}%` }} />
          </div>
        </Link>
      </div>

      <div className="profile-grid grid items-start gap-5 md:grid-cols-[1.35fr_0.85fr]">
        <div className="space-y-5">
          <Section title="Základ" icon="🏬" badge="ručne">
            <div className="grid gap-3 sm:grid-cols-3">
              <Info label="Reťazec / sieť" value={store.chain || "—"} />
              <Info label="Kód predajne" value={store.code || "—"} />
              <Info label="Typ predajne" value={store.storeType || "—"} />
              <Info label="Adresa" value={store.address || "—"} wide />
              <Info
                label="GPS"
                value={
                  store.gpsLat && store.gpsLng
                    ? `${store.gpsLat}, ${store.gpsLng}`
                    : "—"
                }
              />
              <Info
                label="Otváracie hodiny"
                value={formatOpeningHours(store.openingHours) || "—"}
                wide
              />
            </div>
          </Section>

          <Section title="Kontakty" icon="☎" badge="ručne">
            {store.profile.contacts.length === 0 ? (
              <p className="text-sm text-[var(--ink-soft)]">Žiadne kontakty.</p>
            ) : (
              <table className="profile-table">
                <thead>
                  <tr>
                    <th>Rola</th>
                    <th>Meno</th>
                    <th>Telefón</th>
                    <th>E-mail</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {store.profile.contacts.map((c) => (
                    <tr key={c.id}>
                      <td>{c.role || "—"}</td>
                      <td className="font-semibold">{c.name || "—"}</td>
                      <td>{c.phone || "—"}</td>
                      <td>{c.email || "—"}</td>
                      <td>
                        {c.callBeforeVisit ? (
                          <span className="chip chip-sm chip-ok">
                            volať pred výjazdom
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Priestor" icon="📐" badge="ručne">
            <div className="grid gap-3 sm:grid-cols-4">
              <Info label="Plocha" value={store.profile.areaM2 ? `${store.profile.areaM2} m²` : "—"} />
              <Info label="Poschodia" value={store.profile.floors || "—"} />
              <Info label="Zóny" value={store.profile.zoneCount || "—"} />
              <Info label="Výška stropu" value={store.profile.ceilingHeight || "—"} />
            </div>
          </Section>

          <Section title="Audio" icon="🔊" badge="ručne">
            <div className="mb-3 grid gap-3 sm:grid-cols-4">
              <Info label="Reproduktory" value={store.profile.speakersTotal || "—"} />
              <Info
                label="Zosilňovač"
                value={
                  [store.profile.amplifier, store.profile.ampPower]
                    .filter(Boolean)
                    .join(" · ") || "—"
                }
              />
              <Info label="Vstup" value={store.profile.audioInput || "—"} />
              <Info label="Hlasitosť (ref.)" value={store.profile.volumeRef || "—"} />
            </div>
            {store.profile.audioZones.length ? (
              <table className="profile-table">
                <thead>
                  <tr>
                    <th>Zóna</th>
                    <th>Počet</th>
                    <th>Typ</th>
                    <th>Umiestnenie</th>
                    <th>Stav</th>
                  </tr>
                </thead>
                <tbody>
                  {store.profile.audioZones.map((z) => (
                    <tr key={z.id}>
                      <td className="font-semibold">{z.name || "—"}</td>
                      <td>{z.count || "—"}</td>
                      <td>{z.type || "—"}</td>
                      <td>{z.placement || "—"}</td>
                      <td>{z.status || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-[var(--ink-soft)]">Žiadne zóny.</p>
            )}
          </Section>

          <Section title="Ovládanie — tlačidlá" icon="⏺" badge="ručne">
            {store.profile.buttons.length ? (
              <table className="profile-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Funkcia</th>
                    <th>Umiestnenie</th>
                    <th>GPIO</th>
                  </tr>
                </thead>
                <tbody>
                  {store.profile.buttons.map((b) => (
                    <tr key={b.id}>
                      <td>{b.number}</td>
                      <td className="font-semibold">{b.fn || "—"}</td>
                      <td>{b.placement || "—"}</td>
                      <td>{b.gpio || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-[var(--ink-soft)]">Žiadne tlačidlá.</p>
            )}
            {store.profile.buttonNote ? (
              <p className="mt-3 text-sm text-[var(--ink-soft)]">
                {store.profile.buttonNote}
              </p>
            ) : null}
          </Section>

          <Section title="Prehrávač a sieť" icon="▣" badge="auto + ručne">
            <div className="grid gap-3 sm:grid-cols-3">
              {detail.devices.map((d) => (
                <div key={d.uuid} className="info auto sm:col-span-2">
                  <div className="label">
                    Zariadenie <span className="chip chip-sm chip-auto">auto</span>
                  </div>
                  <div className="v">
                    {d.name}{" "}
                    <span className={`chip chip-sm ${d.isOnline ? "chip-ok" : "status-hotove"}`}>
                      {d.replacedByUuid
                        ? "Nahradené"
                        : d.isOnline
                          ? "Online"
                          : "Offline"}
                    </span>
                  </div>
                  <div className="mono mt-1 text-xs text-[var(--ink-soft)]">
                    {d.uuid}
                  </div>
                </div>
              ))}
              {detail.devices[0] ? (
                <>
                  <Info
                    label="Model"
                    value={hardwareLabel(detail.devices[0].deviceType)}
                    auto
                  />
                  <Info
                    label="OS / supervisor"
                    value={`${detail.devices[0].osVersion || "—"} · ${detail.devices[0].supervisorVersion || "—"}`}
                    auto
                  />
                  <Info
                    label="Lokálna IP"
                    value={detail.devices[0].ipAddress || "—"}
                    auto
                  />
                  <Info
                    label="Undervoltage"
                    value={detail.devices[0].isUndervolted ? "Áno" : "Nie"}
                    auto
                  />
                </>
              ) : (
                <p className="text-sm text-[var(--ink-soft)] sm:col-span-3">
                  Zatiaľ bez Balena zariadenia — pripoj ho nižšie.
                </p>
              )}
              <Info label="Umiestnenie prehrávača" value={store.profile.playerPlacement || "—"} />
              <Info label="Napájanie / UPS" value={store.profile.powerUps || "—"} />
              <Info label="SD karta" value={store.profile.sdCard || "—"} />
              <Info label="Pripojenie" value={store.profile.connection || "—"} />
              <Info label="Router" value={store.profile.router || "—"} />
              <Info label="Náhradný HW" value={store.profile.spareHw || "—"} />
            </div>
            <form action={linkDeviceAction} className="mt-4 flex flex-wrap gap-2">
              <input type="hidden" name="prevadzkaId" value={store.id} />
              <div className="field min-w-[220px] flex-1">
                <label htmlFor="deviceUuid">Pripojiť zariadenie</label>
                <select id="deviceUuid" name="deviceUuid" defaultValue="">
                  <option value="">— vyber z flotily —</option>
                  {available.map((d) => (
                    <option key={d.uuid} value={d.uuid}>
                      {d.code ? `#${d.code} · ` : ""}
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-ghost self-end">
                Pripojiť
              </button>
            </form>
          </Section>

          <Section title="Prístup pre technika" icon="🔑" badge="ručne">
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label="Kedy chodiť" value={store.profile.visitWhen || "—"} />
              <Info label="Pred výjazdom" value={store.profile.beforeVisit || "—"} />
              <Info label="Kľúče / vstup" value={store.profile.keysAccess || "—"} />
              <Info label="Parkovanie" value={store.profile.parking || "—"} />
              <Info label="Rebrík" value={store.profile.ladder || "—"} />
              <Info label="Bezpečnosť / alarm" value={store.profile.security || "—"} />
            </div>
          </Section>

          <Section title="Materiál" icon="🧰" badge="ručne">
            <MaterialBlock
              items={detail.material}
              ticketId={
                detail.tickets.find((t) => t.kind)?.id ||
                detail.material[0]?.ticketId ||
                ""
              }
              prevadzkaId={store.id}
            />
          </Section>

          <Section title="Fotky a poznámky" icon="📷" badge="ručne">
            {store.profile.photos.length ? (
              <div className="mb-3 grid gap-3 sm:grid-cols-4">
                {store.profile.photos.map((p) =>
                  p.url ? (
                    <a
                      key={p.id}
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="photo-card"
                      style={{ backgroundImage: `url(${p.url})` }}
                    >
                      {p.caption || "Foto"}
                    </a>
                  ) : (
                    <div key={p.id} className="photo-card">
                      {p.caption || "Foto (chýba URL)"}
                    </div>
                  ),
                )}
              </div>
            ) : (
              <p className="mb-3 text-sm text-[var(--ink-soft)]">
                Fotky zadaj URL-om v úprave profilu. Upload nie je zapnutý.
              </p>
            )}
            {store.profile.techNote ? (
              <div className="note warn">
                <div className="label mb-1">Dôležité pre technika</div>
                {store.profile.techNote}
              </div>
            ) : null}
            {store.profile.notes ? (
              <div className="note mt-2">{store.profile.notes}</div>
            ) : null}
          </Section>

          <Section title="Výkaz práce" icon="📒" badge="auto + ručne">
            <div className="mb-3 flex flex-wrap gap-2">
              <Link
                href={`/prevadzky/${store.id}`}
                className="filter-pill"
                data-active={!typ}
              >
                Všetko
              </Link>
              {VYKAZ_TYPES.map((t) => (
                <Link
                  key={t}
                  href={`/prevadzky/${store.id}?typ=${t}`}
                  className="filter-pill"
                  data-active={typ === t}
                >
                  {VYKAZ_TYPE_LABELS[t]}
                </Link>
              ))}
            </div>
            {detail.vykaz.length === 0 ? (
              <p className="text-sm text-[var(--ink-soft)]">Zatiaľ prázdny výkaz.</p>
            ) : (
              <ul className="space-y-2">
                {detail.vykaz.map((e) => (
                  <li key={e.id} className="rounded-xl border border-[var(--line)] bg-white/50 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">
                        {formatDate(e.date)}
                      </span>
                      <span className="chip chip-sm chip-edit">
                        {VYKAZ_TYPE_LABELS[e.type]}
                      </span>
                      <span className="chip chip-sm chip-auto">{e.source}</span>
                      <span className="text-sm text-[var(--ink-soft)]">
                        {e.author}
                        {e.durationMin != null ? ` · ${e.durationMin} min` : ""}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{e.description}</p>
                    <div className="mt-1 flex gap-3 text-xs font-semibold text-[var(--teal)]">
                      {e.ticketId ? (
                        <Link href={`/ticket/${e.ticketId}`}>Ticket</Link>
                      ) : null}
                      {e.vyjazdId ? (
                        <Link href={`/vyjazdy/${e.vyjazdId}`}>Výjazd</Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <form action={addVykazAction} className="mt-4 grid gap-3 md:grid-cols-2">
              <input type="hidden" name="prevadzkaId" value={store.id} />
              <div className="field">
                <label htmlFor="type">Typ</label>
                <select id="type" name="type" defaultValue="servis">
                  {VYKAZ_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {VYKAZ_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="date">Dátum</label>
                <input id="date" name="date" type="datetime-local" />
              </div>
              <div className="field">
                <label htmlFor="author">Kto</label>
                <input id="author" name="author" defaultValue="Servis" />
              </div>
              <div className="field">
                <label htmlFor="durationMin">Minúty</label>
                <input id="durationMin" name="durationMin" type="number" min="0" />
              </div>
              <div className="field md:col-span-2">
                <label htmlFor="description">Popis</label>
                <textarea id="description" name="description" required />
              </div>
              <button type="submit" className="btn btn-primary">
                Pridať do výkazu
              </button>
            </form>
          </Section>
        </div>

        <aside className="space-y-5">
          <section className="panel space-y-3 p-5">
            <h2 className="text-lg font-bold">Servis</h2>
            <Link
              href={`/novy?prevadzka=${store.id}`}
              className="btn btn-primary w-full"
            >
              + Nový problém
            </Link>
            <Link
              href={`/vyjazdy/novy?prevadzka=${store.id}`}
              className="btn btn-ghost w-full"
            >
              + Naplánovať výjazd
            </Link>
            {callContact?.phone ? (
              <a href={`tel:${callContact.phone}`} className="btn btn-ghost w-full">
                Zavolať {callContact.name || "kontakt"}
              </a>
            ) : null}
            {store.profile.beforeVisit ? (
              <div className="note text-sm">
                <b>Pripomienka:</b> {store.profile.beforeVisit}
              </div>
            ) : null}
          </section>

          <section className="panel space-y-3 p-5">
            <div className="sec-h mb-0">
              <h2 className="text-lg font-bold">Otvorené tickety</h2>
              <span className="chip chip-sm chip-auto">auto</span>
            </div>
            {detail.openTickets.length === 0 ? (
              <p className="text-sm text-[var(--ink-soft)]">Žiadne otvorené.</p>
            ) : (
              detail.openTickets.map((t) => (
                <Link key={t.id} href={`/ticket/${t.id}`} className="block rounded-xl border border-[var(--line)] bg-white/50 px-3 py-2">
                  <div className="flex justify-between gap-2">
                    <b>
                      {ticketCode(t.number)} · {t.title}
                    </b>
                    <span className={`chip chip-sm ${statusClass(t.status)}`}>
                      {STATUS_LABELS[t.status]}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </section>

          <section className="panel space-y-3 p-5">
            <div className="sec-h mb-0">
              <h2 className="text-lg font-bold">Výjazdy</h2>
              <span className="chip chip-sm chip-auto">auto</span>
            </div>
            {detail.vyjazdy.length === 0 ? (
              <p className="text-sm text-[var(--ink-soft)]">Žiadne výjazdy.</p>
            ) : (
              detail.vyjazdy.slice(0, 6).map((v) => (
                <Link key={v.id} href={`/vyjazdy/${v.id}`} className="block rounded-xl border border-[var(--line)] bg-white/50 px-3 py-2">
                  <div className="flex justify-between gap-2">
                    <b>
                      {vyjazdCode(v.number)} · {v.title}
                    </b>
                    <span className="chip chip-sm status-hotove">{v.status}</span>
                  </div>
                </Link>
              ))
            )}
          </section>

          <section className="panel space-y-3 p-5">
            <div className="sec-h mb-0">
              <h2 className="text-lg font-bold">História prevádzky</h2>
              <span className="chip chip-sm chip-auto">auto</span>
            </div>
            {detail.history.length === 0 ? (
              <p className="text-sm text-[var(--ink-soft)]">Zatiaľ bez zmien.</p>
            ) : (
              <div className="tl">
                {detail.history.slice(0, 20).map((h) => (
                  <div key={h.id} className="e">
                    <b>{formatDate(h.at)}</b> {h.text}{" "}
                    <span className="text-[var(--ink-soft)]">· {h.author}</span>
                  </div>
                ))}
              </div>
            )}
            {detail.completeness.missing.length ? (
              <p className="text-xs text-[var(--ink-soft)]">
                Chýba: {detail.completeness.missing.join(", ")}
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  badge,
  children,
}: {
  title: string;
  icon: string;
  badge: string;
  children: ReactNode;
}) {
  return (
    <section className="panel space-y-3 p-5 md:p-6">
      <div className="sec-h">
        <h2>
          <span className="ico">{icon}</span>
          {title}
        </h2>
        <span className="chip chip-sm chip-edit">{badge}</span>
      </div>
      {children}
    </section>
  );
}

function Stat({
  href,
  label,
  value,
  hint,
  auto,
}: {
  href: string;
  label: string;
  value: string;
  hint?: string;
  auto?: boolean;
}) {
  return (
    <Link href={href} className="stat">
      <span className="label">
        {label}
        {auto ? <span className="chip chip-sm chip-auto">auto</span> : null}
      </span>
      <strong>{value}</strong>
      {hint ? <span className="text-sm text-[var(--ink-soft)]">{hint}</span> : null}
    </Link>
  );
}

function Info({
  label,
  value,
  wide,
  auto,
}: {
  label: string;
  value: string;
  wide?: boolean;
  auto?: boolean;
}) {
  return (
    <div className={`info ${auto ? "auto" : ""} ${wide ? "sm:col-span-2" : ""}`}>
      <div className="label">
        {label}
        {auto ? <span className="chip chip-sm chip-auto">auto</span> : null}
      </div>
      <div className="v">{value}</div>
    </div>
  );
}

function MaterialBlock({
  items,
  ticketId,
  prevadzkaId,
}: {
  items: MaterialItem[];
  ticketId: string;
  prevadzkaId: string;
}) {
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)]">Žiadny materiál.</p>
      ) : (
        <table className="profile-table">
          <thead>
            <tr>
              <th>Položka</th>
              <th>Množstvo</th>
              <th>Jedn.</th>
              <th>Stav</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="font-semibold">{row.item}</div>
                  {row.note ? (
                    <div className="text-xs text-[var(--ink-soft)]">{row.note}</div>
                  ) : null}
                </td>
                <td>{row.quantity}</td>
                <td>{row.unit}</td>
                <td>{MATERIAL_STATUS_LABELS[row.status]}</td>
                <td>
                  <div className="flex gap-1">
                    <form action={updateMaterialAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="ticketId" value={row.ticketId} />
                      <input type="hidden" name="prevadzkaId" value={prevadzkaId} />
                      <input
                        type="hidden"
                        name="status"
                        value={row.status === "pouzite" ? "planovane" : "pouzite"}
                      />
                      <button className="btn btn-ghost" type="submit">
                        {row.status === "pouzite" ? "Plán" : "Použité"}
                      </button>
                    </form>
                    <form action={deleteMaterialAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="ticketId" value={row.ticketId} />
                      <input type="hidden" name="prevadzkaId" value={prevadzkaId} />
                      <button className="btn btn-ghost" type="submit">
                        ×
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {ticketId ? (
        <form action={addMaterialAction} className="grid gap-2 md:grid-cols-5">
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="prevadzkaId" value={prevadzkaId} />
          <input name="item" placeholder="Položka" className="md:col-span-2 rounded-xl border border-[var(--line)] px-3 py-2" />
          <input name="quantity" type="number" defaultValue={1} className="rounded-xl border border-[var(--line)] px-3 py-2" />
          <input name="unit" defaultValue="ks" className="rounded-xl border border-[var(--line)] px-3 py-2" />
          <button type="submit" className="btn btn-ghost">
            +
          </button>
        </form>
      ) : null}
    </div>
  );
}
