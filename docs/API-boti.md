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

Karty prevádzok (tabuľka `prevadzky`, lazy backfill z `partner|mesto|adresa`). Každý záznam má profil, výkaz práce a materiál.

```bash
curl -sS "https://servislist.vercel.app/api/v1/prevadzky?q=COOP" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "count": 1,
  "prevadzky": [
    {
      "id": "…",
      "key": "coop|martin|hlavná 1",
      "label": "#12 · COOP · Martin",
      "partner": "COOP",
      "city": "Martin",
      "status": "active",
      "profile": { "contacts": [], "speakersTotal": "" },
      "vykaz": [],
      "material": [],
      "completeness": { "percent": 23, "missing": ["GPS"] },
      "deviceCount": 1,
      "devices": [{ "uuid": "…", "name": "12-COOP Martin", "isOnline": true }]
    }
  ]
}
```

### `GET /api/v1/prevadzky/:id` — detail karty

`:id` je UUID, `store_key` alebo kód predajne.

```bash
curl -sS https://servislist.vercel.app/api/v1/prevadzky/12 \
  -H "Authorization: Bearer $TOKEN"
```

Vracia `prevadzka` (celý profil), `vykaz`, `material`, `openTickets`, `suggestions`, `completeness`.

### `POST /api/v1/prevadzky` — návrh novej prevádzky

Vytvorí prevádzku v stave `pending` (návrh) + ticket montáže/spustenia + materiál. Martin schváli v UI.

Povinné: `jobType` (`montaz_ozvucenia` \| `spustenie_zariadenia`) a aspoň jeden z `name` / `chain` / `city` / `address`.

```bash
curl -sS -X POST https://servislist.vercel.app/api/v1/prevadzky \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jobType": "montaz_ozvucenia",
    "name": "Nová predajňa",
    "chain": "COOP",
    "city": "Nitra",
    "address": "Hlavná 1",
    "code": "300"
  }'
```

Odpoveď: `pending: true`, `prevadzka`, `ticket`.

### `PATCH /api/v1/prevadzky/:id` — návrh úpravy profilu

Neuloží sa hneď. Vytvorí `profile_suggestions` — Martin schváli alebo zamietne na karte prevádzky.

```bash
curl -sS -X PATCH https://servislist.vercel.app/api/v1/prevadzky/12 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "profile": { "speakersTotal": "10" }, "code": "214" }'
```

### `POST /api/v1/prevadzky/:id/vykaz` — zápis do výkazu práce

Fakt, nie návrh. Uloží sa hneď.

```bash
curl -sS -X POST https://servislist.vercel.app/api/v1/prevadzky/12/vykaz \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "servis",
    "description": "Výmena zdroja, overené s vedúcou.",
    "durationMin": 45
  }'
```

Typy: `montaz`, `spustenie`, `servis`, `oprava`, `vymena_hw`, `demontaz`, `ine`.

### Materiál na tickete

`GET /api/v1/tickets/:id` vracia aj `material`.

```bash
curl -sS -X POST https://servislist.vercel.app/api/v1/tickets/12/material \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "item": "SD karta", "quantity": 1, "unit": "ks", "status": "planovane" }'
```

```bash
curl -sS -X PATCH https://servislist.vercel.app/api/v1/tickets/12/material/ITEM_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "status": "pouzite", "unitPrice": 6.5 }'
```

```bash
curl -sS -X DELETE https://servislist.vercel.app/api/v1/tickets/12/material/ITEM_ID \
  -H "Authorization: Bearer $TOKEN"
```

Stavy materiálu: `planovane` \| `pouzite`. Ticket montáže/spustenia pri uzavretí zapíše výkaz (montáž alebo spustenie) vrátane použitého materiálu.

Uzavretie ticketu s materiálom `pouzite` zapíše **výdaj** na sklad (idempotentne podľa `ticket_material_id`). Ceny v sklade nie sú.

---

## Sklad

Žiadne ceny. Stav položky = súčet pohybov. Rezervované = plánovaný materiál na otvorených ticketoch. Príjem od bota ide vždy ako **čakajúci** — Martin ho schváli v appke (`/sklad`).

### `GET /api/v1/sklad` — prehľad

```bash
curl -sS https://servislist.vercel.app/api/v1/sklad \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "stats": { "items": 10, "low": 2, "reservedTickets": 1, "prijmyMonth": 0 },
  "low": [{ "id": "…", "kod": "SD-CARD", "nazov": "SD karta", "stock": 3, "reserved": 1, "free": 2, "minStav": 10, "low": true }],
  "pending": [{ "id": "…", "cisloDl": "DL-2026/10-0187", "stav": "cakajuci", "zdroj": "servis_bot" }],
  "recent": []
}
```

### `GET /api/v1/sklad/polozky` — katalóg

Query: `q`, `kategoria` (`Reproduktory` \| `Zosilňovače` \| `Prehrávače/RPi` \| `SD karty` \| `Káble` \| `Tlačidlá` \| `Držiaky` \| `Iné`).

```bash
curl -sS "https://servislist.vercel.app/api/v1/sklad/polozky?kategoria=SD%20karty" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /api/v1/sklad/pohyby` — história

Query: `polozka` / `polozkaId`, `typ` (`prijem` \| `vydaj` \| `korekcia`), `prevadzka` / `prevadzkaId`, `od` / `from`, `do` / `to`.

```bash
curl -sS "https://servislist.vercel.app/api/v1/sklad/pohyby?typ=vydaj" \
  -H "Authorization: Bearer $TOKEN"
```

### `POST /api/v1/sklad/prijem` — návrh príjmu (vždy čakajúci)

```bash
curl -sS -X POST https://servislist.vercel.app/api/v1/sklad/prijem \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dodavatel": "AudioTech",
    "cisloDl": "DL-2026/10-0187",
    "datum": "2026-10-16",
    "polozky": [
      { "kod": "SD-CARD", "nazov": "SD karta", "kategoria": "SD karty", "mnozstvo": 10, "jednotka": "ks" }
    ]
  }'
```

```json
{
  "pending": true,
  "prijem": { "id": "…", "stav": "cakajuci", "zdroj": "servis_bot", "suborUrl": "" },
  "subor": null
}
```

Stav skladu sa nezmení, kým Martin príjem neschváli. Po schválení vzniknú pohyby `prijem`. Ceny sa neposielajú.

Prílohu (foto DL / faktúra, max 4 MB, `jpg` / `png` / `webp` / `heic` / `pdf`) môže bot poslať hneď, alebo neskôr na čakajúci príjem, ktorý sám vytvoril. Súbor sa uloží rovnako ako z webu (`/api/sklad/dl/<id>/subor`) a **nikdy sa nemaže** — ani po schválení, ani po zamietnutí.

#### Multipart

Pole `data` = rovnaký JSON ako vyššie. Pole `subor` = súbor.

```bash
curl -sS -X POST https://servislist.vercel.app/api/v1/sklad/prijem \
  -H "Authorization: Bearer $TOKEN" \
  -F 'data={"dodavatel":"AudioTech","cisloDl":"DL-2026/10-0187","polozky":[{"kod":"SD-CARD","nazov":"SD karta","kategoria":"SD karty","mnozstvo":10}]}' \
  -F "subor=@faktura.pdf;type=application/pdf"
```

#### JSON + base64

```bash
curl -sS -X POST https://servislist.vercel.app/api/v1/sklad/prijem \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dodavatel": "AudioTech",
    "cisloDl": "DL-2026/10-0187",
    "polozky": [
      { "kod": "SD-CARD", "nazov": "SD karta", "kategoria": "SD karty", "mnozstvo": 10 }
    ],
    "subor": { "nazov": "faktura.jpg", "mime": "image/jpeg", "base64": "'"$B64"'" }
  }'
```

```json
{
  "pending": true,
  "prijem": { "id": "…", "stav": "cakajuci", "suborUrl": "/api/sklad/dl/…/subor" },
  "subor": { "id": "…", "url": "/api/sklad/dl/…/subor", "nazov": "faktura.jpg", "mime": "image/jpeg" }
}
```

Neplatný MIME → `400`, súbor nad 4 MB → `413` (slovenské `message`).

### `POST /api/v1/sklad/prijem/<id>/subor` — príloha k existujúcemu čakajúcemu príjmu

Len príjem, ktorý vytvoril ten istý bot (`stav=cakajuci`). Ak už príloha je, API vráti `409` a súbor neprepisuje.

```bash
curl -sS -X POST https://servislist.vercel.app/api/v1/sklad/prijem/$ID/subor \
  -H "Authorization: Bearer $TOKEN" \
  -F "subor=@faktura.pdf;type=application/pdf"
```

```bash
curl -sS -X POST https://servislist.vercel.app/api/v1/sklad/prijem/$ID/subor \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "nazov": "faktura.jpg", "mime": "image/jpeg", "base64": "'"$B64"'" }'
```

### Návrhy ticketov a výjazdov (čakajú na Martina)

Existujúce `POST /api/v1/tickets` ostáva fakt — ticket sa uloží hneď. Ak bot pošle `pending: true` (alebo `navrh: true`), vznikne len návrh. Martin ho schváli na `/kontrola`.

```bash
curl -sS -X POST https://servislist.vercel.app/api/v1/tickets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Offline Leles", "description": "2 h", "prevadzka": "Leles", "pending": true }'
```

`POST /api/v1/vyjazdy` vždy vytvorí **návrh výjazdu** (nie hotový výjazd). Rovnako `POST /api/v1/navrhy` s `kind: ticket|vyjazd`.

Stránka `/kontrola` nie je v Bot API — je len v UI za Deployment Protection.

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
