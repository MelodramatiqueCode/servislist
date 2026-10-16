import { archiveLegacyAutoTickets } from "../src/lib/store";

function arg(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : "";
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const dryRun = hasFlag("dry-run") || hasFlag("dryrun");
  const beforeRaw =
    arg("before") || process.env.ARCHIVE_AUTO_TICKETS_BEFORE || "";
  const before = beforeRaw ? new Date(beforeRaw) : new Date();
  if (Number.isNaN(before.getTime())) {
    console.error("Neplatný --before / ARCHIVE_AUTO_TICKETS_BEFORE (očakávaj ISO).");
    process.exit(1);
  }

  const result = await archiveLegacyAutoTickets({ before, dryRun });
  console.log(
    JSON.stringify(
      {
        dryRun: result.dryRun,
        before: result.before,
        wouldArchive: result.archived,
        applied: result.dryRun ? 0 : result.archived,
        autoTicketsCreatedBeforeCutoff: result.totalAutoBefore,
        note:
          "Archivuje len source=auto s createdAt < before. Ručné tickety sa nemenia. Idempotentné.",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
