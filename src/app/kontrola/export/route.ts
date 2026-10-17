import { auditToCsv } from "@/lib/kontrola";
import { listAudit } from "@/lib/kontrola-store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rows = await listAudit({
    q: url.searchParams.get("q") ?? "",
    autor: (url.searchParams.get("autor") ?? "") as never,
    typ: (url.searchParams.get("typ") ?? "") as never,
    akcia: url.searchParams.get("akcia") ?? "",
    limit: 2000,
  });
  const csv = auditToCsv(rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=audit-log.csv",
    },
  });
}
