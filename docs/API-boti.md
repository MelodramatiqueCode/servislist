# API pre botov (Servis bot, Hotline bot)

Základná URL: `https://servislist.vercel.app`

Všetky endpointy sú pod `/api/v1`. Vyžadujú Bearer token. UI a API používajú ten istý model ticketov (číslovanie `#0001`, stavy Otvorené / V riešení / Čaká diely / Hotové, poznámky). API **nepíše do Baleny** a pri čítaní **nespúšťa Balena sync**.

## Autentifikácia

```http
Authorization: Bearer <token bota>
```

Každý zápis sa v tickete ukáže s autorom bota (napr. `Hotline bot` alebo `Servis bot`) v poznámkach.

| Bot | `id` | Autor v UI | Env premenná s tokenom | Env s SHA-256 hashom |
|---|---|---|---|---|
| Servis bot | `servis` | Servis bot | `SERVIS_BOT_API_TOKEN` | `SERVIS_BOT_API_TOKEN_HASH` |
| Hotline bot | `hotline` | Hotline bot | `HOTLINE_BOT_API_TOKEN` | `HOTLINE_BOT_API_TOKEN_HASH` |

Stačí jedna z dvojice (plaintext **alebo** hash). Tokeny dávaj len do Vercel Environment Variables, nikdy do gitu.

Odvolanie tokenu:

1. Zmaž alebo vymeň env premennú a sprav nový deploy, **alebo**
2. Nastav `API_BOT_DISABLED=servis` (čiarka = viac botov) a redeployni, **alebo**
3. V tabuľke `api_tokens` vlož riadok s `token_hash` a `revoked_at = NOW()` — to odreže aj env token bez čakania na nový kód (schema sa doplní sama).

Hash tokenu:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('TVOJ_TOKEN').digest('hex'))"
```

## Deployment Protection (dôležité)

Produkcia `servislist.vercel.app` má zapnutú **Vercel Authentication (SSO)** aj **Password Protection** na všetky deploymenty. Samotný Bearer token API **nestačí** — Vercel botovi pred `/api` zobrazí prihlasovaciu stránku.

Odporúčaný postup (nemení sa v tomto PR, nastaví Martin v dashboarde):

1. Vercel → Project **servislist** → Settings → Deployment Protection → **Protection Bypass for Automation**.
2. Vygeneruj secret. Vercel ho uloží aj ako `VERCEL_AUTOMATION_BYPASS_SECRET`.
3. Bot posiela **oba** headre:

```http
Authorization: Bearer <SERVIS_BOT_API_TOKEN alebo HOTLINE_BOT_API_TOKEN>
x-vercel-protection-bypass: <VERCEL_AUTOMATION_BYPASS_SECRET>
```

Ak nástroj nevie poslať vlastný header, ide aj query `?x-vercel-protection-bypass=SECRET` (menej vhodné — secret ostane v logoch).

Ďalšie možnosti, ktoré Vercel Authentication **nevie**:

- Vylúčiť len `/api` cesty z ochrany — taká voľba v Deployment Protection nie je.
- Shareable link — je dočasný a pre botov nevhodný.

Alternatíva: vypnúť ochranu pre **Production** (Preview nechať zapnuté). Potom stačí Bearer token; UI na custom doméne ostane verejné.

## Chyby

Vždy JSON:

```json
{ "error": "unauthorized", "message": "Chýba alebo je neplatný Bearer token." }
```

```json
{
  "error": "validation_error",
  "message": "Neplatné údaje ticketu.",
  "fields": { "title": "Vyplň názov ticketu." }
}
```

| `error` | HTTP |
|---|---|
| `unauthorized` | 401 |
| `validation_error` | 400 |
| `invalid_json` | 400 |
| `not_found` | 404 |
| `internal_error` | 500 |

Identifikátor ticketu v URL: UUID, číslo `12` alebo kód `0012` (znak `#` do cesty nedávaj). Výjazd: UUID, `3` alebo `V-0003`.

Idempotencia: pri vytvorení ticketu a poznámky pošli `clientRef` v tele alebo header `Idempotency-Key`. Rovnaký kľúč vráti existujúci záznam, nevytvorí duplicitu.

---

## Endpointy

V príkladoch je `$TOKEN` token bota. Ak je zapnutá ochrana deploymentu, pridaj aj `-H "x-vercel-protection-bypass: $BYPASS"`.

### `GET /api/v1` — kontrola tokenu

```bash
curl -sS https://servislist.vercel.app/api/v1 \
  -H "Authorization: Bearer $TOKEN"
```

```json
{ "ok": true, "version": 1, "bot": "Hotline bot", "botId": "hotline" }
```

### `GET /api/v1/tickets` — zoznam

Query: `status` (`otvorene` \| `v_rieseni` \| `caka_diely` \| `hotove` \| `aktivne` \| `vsetky`), `source` (`manual` \| `auto` \| `vsetky`), `device` / `deviceUuid`, `prevadzka`, `q`, `od` / `do` (ISO alebo `YYYY-MM-DD`), `dateField` (`updatedAt` predvolene, `createdAt`), `archiv` (`hide` predvolene — bez archívu, `only`, `all` / `1`).

`aktivne` = všetko okrem Hotové.

```bash
curl -sS "https://servislist.vercel.app/api/v1/tickets?status=aktivne&prevadzka=COOP" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "count": 1,
  "tickets": [
    {
      "id": "…",
      "number": 12,
      "code": "#0012",
      "title": "Pokladňa nejde",
      "status": "otvorene",
      "statusLabel": "Otvorené",
      "priority": "normalna",
      "priorityLabel": "Normálna",
      "customerName": "#12 · COOP · Martin",
      "deviceUuid": "…",
      "notes": [],
      "createdAt": "2026-10-16T10:00:00.000Z",
      "updatedAt": "2026-10-16T10:00:00.000Z"
    }
  ]
}
```

### `GET /api/v1/tickets/:id` — detail (id alebo číslo)

```bash
curl -sS https://servislist.vercel.app/api/v1/tickets/12 \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "ticket": { "code": "#0012", "title": "Pokladňa nejde" },
  "vyjazdy": [{ "code": "V-0003", "title": "Servis Martin", "status": "naplanovany" }]
}
```

### `POST /api/v1/tickets` — nový ticket

Povinné: `title`, `description`. Ďalej buď `deviceUuid` (doplní prevádzku ako UI), alebo `prevadzka` / `customerName` + `deviceType`.

```bash
curl -sS -X POST https://servislist.vercel.app/api/v1/tickets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: hotline-2026-10-16-1" \
  -d '{
    "title": "Pokladňa nejde",
    "description": "Zákazník volal, čierna obrazovka od rána.",
    "deviceUuid": "balena-uuid-zariadenia",
    "priority": "vysoka",
    "clientRef": "hotline-2026-10-16-1",
    "note": "Prijaté na hotline, sľúbený callback."
  }'
```

201 pri novom, 200 pri opakovanom `clientRef` (`idempotent: true`). V poznámkach bude autor bota.

Bez UUID, len prevádzka:

```bash
curl -sS -X POST https://servislist.vercel.app/api/v1/tickets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Tlačiareň neťahá",
    "description": "Blokuje front.",
    "prevadzka": "COOP Martin",
    "deviceType": "Tlačiareň",
    "priority": "normalna"
  }'
```

### `POST /api/v1/tickets/:id/notes` — servisný záznam

```bash
curl -sS -X POST https://servislist.vercel.app/api/v1/tickets/12/notes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "text": "Vymenený adaptér, zariadenie beží.", "clientRef": "servis-note-88" }'
```

Autor sa berie z tokenu, nie z tela.

### `PATCH /api/v1/tickets/:id/status` — zmena stavu

```bash
curl -sS -X PATCH https://servislist.vercel.app/api/v1/tickets/12/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "status": "v_rieseni", "note": "Technik je na ceste." }'
```

Stavy: `otvorene`, `v_rieseni`, `caka_diely`, `hotove`. Do poznámok sa zapíše `Stav zmenený: … → …`.

### `POST /api/v1/tickets/:id/close` a `/reopen`

```bash
curl -sS -X POST https://servislist.vercel.app/api/v1/tickets/12/close \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "note": "Hotové, overené s predajňou." }'
```

```bash
curl -sS -X POST https://servislist.vercel.app/api/v1/tickets/12/reopen \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "status": "caka_diely", "note": "Znova vypadlo." }'
```

`reopen` predvolene nastaví `otvorene`. Ak už ticket v danom stave je, vráti `changed: false`.

### `PATCH /api/v1/tickets/:id` — stav, priorita, výjazd

```bash
curl -sS -X PATCH https://servislist.vercel.app/api/v1/tickets/12 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "status": "caka_diely", "priority": "urgentna", "vyjazdId": "V-0003" }'
```

### `POST /api/v1/tickets/:id/vyjazd` — naviaž na existujúci výjazd

Nevytvára nový výjazd. Do `ticketId` výjazdu (a zodpovedajúcej zastávky) doplní ticket.

```bash
curl -sS -X POST https://servislist.vercel.app/api/v1/tickets/12/vyjazd \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "vyjazdId": "V-0003" }'
```

```json
{
  "ticket": { "code": "#0012" },
  "vyjazd": { "code": "V-0003", "ticketId": "…" },
  "linked": true
}
```

Opakované volanie vráti `linked: false`.

### `GET /api/v1/vyjazdy` a `GET /api/v1/vyjazdy/:id`

Query: `status` (`naplanovany` \| `prebieha` \| `hotovy` \| `zruseny` \| `vsetky`), `device`, `ticket`, `prevadzka`, `q`, `od`, `do`.

```bash
curl -sS "https://servislist.vercel.app/api/v1/vyjazdy?status=naplanovany&prevadzka=Martin" \
  -H "Authorization: Bearer $TOKEN"
```

```bash
curl -sS https://servislist.vercel.app/api/v1/vyjazdy/V-0003 \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /api/v1/zariadenia` a `GET /api/v1/zariadenia/:uuid`

Číta uložený snapshot (žiadny sync z Baleny). Query: `q`, `online` (`all` \| `online` \| `offline`), `partner` / `prevadzka`.
`health` = `long_offline` (dlhodobo offline, zoradené od najstaršieho) alebo `test` (testovacie zariadenia).

Každé zariadenie má navyše `lastConnectivityEvent` (Balena last-seen), `offlineDays` (dni offline, inak `null`), `longOffline` a `testDevice`.

**Pravidlá auto ticketov:** testovacie zariadenia (Demo, Demo2, Balena predvolené názvy typu `quiet-engine`, alebo zoznam v env `ALERT_IGNORE_DEVICES`) a zariadenia offline dlhšie ako `ALERT_LONG_OFFLINE_DAYS` (predvolene 7) dní netvoria auto tickety. Archivovaný auto ticket sa pre ten istý incident znova nevytvorí — nový vznikne až keď sa zariadenie vráti online a znova padne.

```bash
curl -sS "https://servislist.vercel.app/api/v1/zariadenia?q=Martin" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /api/v1/prevadzky`

Zoskupené z katalógu zariadení (`partner` + mesto + adresa).

```bash
curl -sS "https://servislist.vercel.app/api/v1/prevadzky?q=COOP" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "count": 1,
  "prevadzky": [
    {
      "key": "coop|martin|hlavná 1",
      "label": "#12 · COOP · Martin",
      "partner": "COOP",
      "city": "Martin",
      "deviceCount": 1,
      "devices": [{ "uuid": "…", "name": "12-COOP Martin", "code": "12", "isOnline": true }]
    }
  ]
}
```

---

## Typické toky

### Hotline prijala hlásenie → vytvor ticket

1. `GET /api/v1/prevadzky?q=COOP+Martin` alebo `GET /api/v1/zariadenia?q=Martin`
2. `POST /api/v1/tickets` s `deviceUuid` (ak je jasné zariadenie) alebo `prevadzka`, plus `clientRef` z id hovoru
3. Odpoveď pošli operátorovi ako kód ticketu (`#0012`)

### Technik dokončil servis → pridaj záznam a uzavri

1. `GET /api/v1/tickets/12` (alebo `?status=aktivne&device=…`)
2. `POST /api/v1/tickets/12/notes` s tým, čo sa spravilo
3. `POST /api/v1/tickets/12/close`

Ak má ísť na výjazd: `POST /api/v1/tickets/12/vyjazd` s `vyjazdId` z `GET /api/v1/vyjazdy?status=naplanovany`.

### Nájdi otvorené tickety pre prevádzku

```bash
curl -sS "https://servislist.vercel.app/api/v1/tickets?status=aktivne&prevadzka=COOP%20Martin" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Čo musí Martin nastaviť vo Vercel

Project **servislist** → Settings → Environment Variables (Production, ideálne aj Preview):

| Premenná | Typ | Poznámka |
|---|---|---|
| `SERVIS_BOT_API_TOKEN` | Sensitive | Dlhý náhodný reťazec, napr. `openssl rand -hex 32` |
| `HOTLINE_BOT_API_TOKEN` | Sensitive | Iný náhodný reťazec |
| `SERVIS_BOT_API_TOKEN_HASH` | Sensitive | Voliteľné namiesto plaintext tokenu |
| `HOTLINE_BOT_API_TOKEN_HASH` | Sensitive | Voliteľné namiesto plaintext tokenu |
| `API_BOT_DISABLED` | Plain | Voliteľné; `servis` / `hotline` na vypnutie |
| `API_BOT_TOKENS` | Sensitive | Voliteľné JSON extra botov `[{id,name,tokenHash}]` |
| `DATABASE_URL` | už je | Neon; nová schema je aditívna, `ensureSchema` ju doplní pri prvom requeste |

Potom **Redeploy** Production, inak nové env premenné neplatia.

Deployment Protection:

1. Settings → Deployment Protection → zapni **Protection Bypass for Automation**
2. Secret daj botom ako `x-vercel-protection-bypass`
3. **Nemeň** heslá / SSO v tomto PR — decide Martin

Migrácia (voliteľná, inak lazy pri prvom API/UI requeste):

```bash
DATABASE_URL='…' npm run db:migrate
```

Doplní sa stĺpec `tickets.client_ref` (unikátny, existujúce riadky ostávajú) a tabuľka `api_tokens`. Žiadne existujúce dáta sa nemenia.

Balena premenné (`BALENA_API_TOKEN`, …) API nepoužíva na zápis. Cron `/api/sync-balena` ostáva oddelený.
