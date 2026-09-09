# ServisList

Ticketing pre servis Balena zariadení v predajniach (to-do list pre servisákov).

## Čo vie

- Katalog Balena zariadení (predajne, online/offline, partner, telefón)
- Vytvárať tickety naviazané na konkrétne Pi / predajňu
- Filtrovať tickety podľa stavu a zariadenia podľa partnera / online
- Poznámky zo servisu, priorita, link na Balena dashboard

## Spustenie

```bash
npm install
npm run dev
```

Otvor [http://localhost:3000](http://localhost:3000).

Zariadenia sa načítajú z `data/balena-export.json` (prvý beh). Tickety sa ukladajú do `data/tickets.json`.

## Import nového Balena exportu

```bash
curl -X POST http://localhost:3000/api/import-devices \
  -H 'Content-Type: application/json' \
  --data-binary @data/balena-export.json
```

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Server Actions + lokálne JSON súbory
