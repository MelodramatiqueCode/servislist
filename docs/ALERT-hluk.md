# Menej šumu v auto-ticketoch

Balena ostáva **len na čítanie**. Tieto pravidlá menia len to, kedy sync z Baleny otvorí ticket v ServisListe. Krátke a nočné epizódy sa zapisujú do histórie zariadenia (detail zariadenia), nie do zoznamu ticketov.

Predvolené hodnoty stačia na bežnú flotilu; všetko sa dá pretlačiť env premennými vo Vercel. Po zmene env treba **Redeploy**.

## Čo sa zmenilo

1. **Grace 15 min (offline)** — ticket až keď je zariadenie offline dlhšie ako `ALERT_OFFLINE_GRACE_MINUTES`.
2. **Hromadný výpadok** — ak v okne `ALERT_MASS_WINDOW_MINUTES` (10) padne aspoň `ALERT_MASS_MIN_DEVICES` (15) zariadení **počas otváracích hodín**, vznikne **jeden** incident so zoznamom, nie ticket na každé. Nočné zatvorenie predajní sa do vlny nepočíta.
3. **Hysterézia Horúce CPU** — otvorenie pri `ALERT_HOT_OPEN_C` (82 °C) po `ALERT_HOT_MIN_MINUTES` (10), zatvorenie až pod `ALERT_HOT_CLOSE_C` (75 °C). Flap okolo 80 °C (#200 JLM Fiľakovo) už nesype tickety.
4. **Otváracie hodiny** — nočný offline (vypnutá predajňa) sa ignoruje. Predvolene `07:00–21:00` `Europe/Bratislava`. Override na prevádzku cez `ALERT_HOURS_OVERRIDES`.
5. **História + opakovaný výpadok** — krátke epizódy sú na detaile zariadenia (`offline 12× za 7 dní`). Ak ich je aspoň `ALERT_FLAP_MIN_COUNT` (5) za `ALERT_FLAP_WINDOW_DAYS` (7) **počas hodín**, vznikne jeden ticket „Opakovaný výpadok“.
6. **Undervolt** sa nemení — ide do ticketu hneď a sám sa nezahojí.

Zoskupenie ostáva: **jeden otvorený auto-ticket na zariadenie**, ďalšie alerty ako poznámky. Hromadný výpadok je samostatný fleet ticket.

## Automatické návrhy — odstránené

In-app auto-návrhy výjazdov (expres / trasa / okruh problematiky) sú **preč z kódu aj UI**. Návrhy bude robiť Servis bot cez API.

Zmazané:

- `src/lib/suggestions.ts` (generovanie návrhov)
- `src/components/suggestion-card.tsx`
- `/vyjazdy` — blok „Automatické návrhy výjazdov“
- `/zariadenia/[uuid]` — panel „Navrhovaný výjazd“
- `/ticket/[id]` — automatický návrh v paneli Výjazd (ostal ručný „+ Naplánovať výjazd“)

Existujúce tickety a výjazdy sa **nemažú**. Žiadna tabuľka sa nedropuje.

### API pre Servis bot (história + otvorené tickety)

Bearer token ako v API PR (`SERVIS_BOT_API_TOKEN`). Pri Deployment Protection aj `x-vercel-protection-bypass`.

**`GET /api/v1/zariadenia/:uuid/udalosti?dni=7`** — história alertov a flap:

```json
{
  "days": 7,
  "counts": { "offline": 12, "hot": 0, "undervolt": 0 },
  "flap": { "shortOffline": 5, "minCount": 5, "repeatedOutage": true },
  "events": [{ "alertType": "offline", "outcome": "short", "startedAt": "…" }]
}
```

**`GET /api/v1/prevadzky/otvorene-tickety?prevadzka=COOP&region=Martin`** — otvorené tickety zoskupené podľa prevádzky / regiónu (mesto):

```json
{
  "count": 1,
  "openTickets": 3,
  "groups": [
    {
      "label": "#200 · JLM · Fiľakovo",
      "region": "Fiľakovo",
      "openCount": 3,
      "tickets": [{ "code": "#0120", "title": "Offline: #200 Fiľakovo" }]
    }
  ]
}
```

Query `prevadzka` filtruje predajňu, `region` / `mesto` / `city` filtruje mesto. Bez query vráti všetky skupiny.

## Env premenné

| Premenná | Predvolené | Význam |
|---|---|---|
| `ALERT_AUTO_TICKETS` | `1` | Master vypínač auto-ticketov |
| `ALERT_AUTO_CLOSE` | `1` | Zatvoriť ticket, keď alerty zmiznú |
| `ALERT_OFFLINE_GRACE_MINUTES` | `15` | Offline musí trvať aspoň toľko (v otváracích hodinách) |
| `ALERT_MASS_WINDOW_MINUTES` | `10` | Okno na detekciu vlny |
| `ALERT_MASS_MIN_DEVICES` | `15` | Koľko zariadení = hromadný incident |
| `ALERT_HOT_OPEN_C` | `82` | Teplota na otvorenie Horúce CPU |
| `ALERT_HOT_CLOSE_C` | `75` | Teplota na zatvorenie |
| `ALERT_HOT_MIN_MINUTES` | `10` | Ako dlho musí byť nad open |
| `ALERT_STORE_HOURS` | `07:00-21:00` | Globálne hodiny; `off` / `24/7` = vždy |
| `ALERT_STORE_TIMEZONE` | `Europe/Bratislava` | Časová zóna hodín |
| `ALERT_STORE_DAYS` | `0,1,2,3,4,5,6` | Dni (0 = nedeľa) |
| `ALERT_HOURS_OVERRIDES` | `{}` | JSON: kľúč `#264`, kód, partner, mesto → `HH:MM-HH:MM` alebo `off` |
| `ALERT_FLAP_WINDOW_DAYS` | `7` | Okno na počítanie krátkych offline |
| `ALERT_FLAP_MIN_COUNT` | `5` | Koľko krátkych epizód = „Opakovaný výpadok“ |

Príklad override:

```bash
ALERT_HOURS_OVERRIDES={"#114":"08:00-20:00","JLM":"07:00-20:00"}
```

Kľúč môže byť kód zariadenia, `#kód`, partner, mesto alebo `partner|mesto`.

Cron sync každých 5 minút je ideálny pre grace 15 min a mass okno 10 min. Na Hobby (1× denne) grace/mass fungujú hrubšie — ticket sa rozhodne až pri ďalšom syncu.

## Migrácia (aditívna)

`ensureSchema` / `npm run db:migrate` doplní:

- tabuľku `device_events` (história epizód)
- tabuľku `alert_pending` (bežiaca grace / hysterézia)
- `app_meta.mass_incident` (otvorená vlna)

Existujúce tickety sa **nemažú ani neprepisujú**. Lokálne bez DB vzniknú `data/device-events.json` a `data/alert-pending.json`.

## Odhad september 2026 (10.–28. 9.)

Vstup (zo skutočnej prevádzky): **1 486 ticketov, z toho 1 477 auto**; 1 459 auto-zatvorených, medián 5 min; 5 vĺn = 641 Offline (všetky do 15 min); #200 JLM Fiľakovo = 262 Horúce CPU okolo 80 °C; nočné offline napr. #264, #114. Undervolt ostáva.

Pri predvolených pravidlách (bez raw dump ticketov, súhrn + rovnaký replay algoritmus):

| Zdroj šumu | Bolo | Po novom |
|---|---|---|
| 5 mass vĺn offline | 641 ticketov | **5** incidentov |
| Horúce CPU #200 | 262 | **1–2** (hysterézia) |
| Nočné offline / short (medián 5 min) | stovky | **0 ticketov**, história + zopár „Opakovaný výpadok“ |
| Undervolt a dlhé reálne poruchy | zvyšok | **ostáva** |

**Odhad: ~200 auto-ticketov namiesto 1 477** (pokles cca 85–90 %). Presný replay na dumpe:

```bash
DATABASE_URL='…' npx tsx -e "import { dbReadTicketStore } from './src/lib/db.ts'; import { estimateFromTickets } from './src/lib/alert-estimate.ts'; const s = await dbReadTicketStore(); console.log(estimateFromTickets(s.tickets, undefined, { from: '2026-09-10', to: '2026-09-29' }));"
```
