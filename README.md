# ServisList

Ticketing pre servis Balena zariadení v predajniach (to-do list pre servisákov).

## Čo vie

- Katalog Balena zariadení (predajne, online/offline, partner, telefón)
- **Live sync** online stavu z Balena Cloud API
- Tickety naviazané na konkrétne Pi / predajňu
- Filter podľa partnera / online, poznámky, priorita, link na dashboard

## Spustenie

```bash
npm install
cp .env.example .env.local
# doplň BALENA_API_TOKEN z Balena dashboard → Preferences → Access tokens
npm run dev
```

Otvor [http://localhost:3000](http://localhost:3000).

### Env

| Premenná | Popis |
|---|---|
| `BALENA_API_TOKEN` | API key / session token z Balena |
| `BALENA_FLEET_SLUG` | default `ceo2/massiva` |

Na stránke **Zariadenia** je tlačidlo **Obnoviť online stav**. Ak je token nastavený, stránka syncne aj automaticky (max raz za 2 minúty).

Manual sync:

```bash
curl -X POST http://localhost:3000/api/sync-balena?force=1
```

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Balena Cloud API (`/v7/device`)
- Lokálne JSON súbory pre tickety a cache zariadení
