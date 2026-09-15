# ServisList

Ticketing pre servis Balena zariadení v predajniach.

## Stack

- Next.js App Router + TypeScript + Tailwind
- Balena Cloud API
- **Neon Postgres** (produkcia / Vercel) alebo lokálne JSON (`data/`)

## Lokálny beh

```bash
npm install
cp .env.example .env.local
# doplň BALENA_API_TOKEN
npm run dev
```

Bez `DATABASE_URL` apka používa JSON súbory v `data/` (vhodné na vývoj).

S Neon DB:

```bash
# v .env.local nastav DATABASE_URL z Neon dashboardu
npm run db:migrate
npm run dev
```

## Deploy na Vercel

1. Pushni repo na GitHub a importuj projekt do [Vercel](https://vercel.com).
2. V projekte pridaj **Neon** (Storage / Marketplace) — Vercel doplní `DATABASE_URL`.
3. Nastav Environment Variables:

| Premenná | Popis |
|---|---|
| `DATABASE_URL` | Neon connection string (z Marketplace) |
| `BALENA_API_TOKEN` | Balena access token |
| `BALENA_FLEET_SLUG` | napr. `ceo2/massiva` |
| `ALERT_AUTO_TICKETS` | `1` / `0` |
| `ALERT_AUTO_CLOSE` | `1` / `0` |
| `CRON_SECRET` | náhodný secret pre Vercel Cron |

4. Deploy. Po prvom deployi (alebo v build/deploy hook) spusti migráciu:

```bash
# lokálne proti produkčnej DATABASE_URL
DATABASE_URL='...' npm run db:migrate
```

Alebo otvor appku / spusti sync — schema sa vytvorí aj lazy pri prvom DB prístupe (`ensureSchema`).

5. Cron: `vercel.json` syncuje flotilu každých 5 minút cez `/api/sync-balena?force=1`.
   - Na **Hobby** pláne môže byť cron obmedzený (max 1× denne) — uprav `schedule` alebo upgradni Pro.
6. Odporúčané: zapni **Deployment Protection** / heslo, kým nemáte auth.

### Manuálny sync

```bash
curl -X POST "https://YOUR_APP.vercel.app/api/sync-balena?force=1" \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Čo vie

- Katalóg Balena zariadení (online/offline, undervolt, teplota, disk, VPN)
- Live sync + auto-tickety pri nových health alertaoch
- Tickety naviazané na UUID zariadenia, poznámky, priority
- Servisné výjazdy ako trasa po prevádzkach (zastávky, ticknutie, návrh trasy)
