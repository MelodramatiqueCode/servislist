# ServisList

Jednoduchá webová apka na **servis zariadení** — ticketing / to-do list pre servisákov.

## Čo vie

- Vytvárať tickety (problémy so zariadením)
- Filtrovať podľa stavu: otvorené, v riešení, čaká diely, hotové
- Hľadať podľa zákazníka, sériového čísla, popisu
- Meniť stav a prioritu
- Pridávať poznámky zo servisu
- Dáta sa ukladajú lokálne do `data/tickets.json`

## Spustenie

```bash
npm install
npm run dev
```

Otvor [http://localhost:3000](http://localhost:3000).

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Server Actions + JSON súbor (bez externej DB)
