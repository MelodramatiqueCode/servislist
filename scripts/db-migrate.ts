import { ensureSchema, isDatabaseConfigured } from "../src/lib/db";

async function main() {
  if (!isDatabaseConfigured()) {
    console.error(
      "Chýba DATABASE_URL (alebo POSTGRES_URL). Nastav Neon connection string.",
    );
    process.exit(1);
  }

  await ensureSchema();
  console.log(
    "Schema OK — tabuľky tickets + vyjazdy (vrátane stops, route a origin) + app_meta sú pripravené.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
