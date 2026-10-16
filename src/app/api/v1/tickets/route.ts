import { handleBotRoute, jsonOk, readJsonBody } from "@/lib/api-http";
import { botCreateTicket, botListTickets } from "@/lib/bot-api";

export async function GET(request: Request) {
  return handleBotRoute(request, async () => {
    const url = new URL(request.url);
    return jsonOk(await botListTickets(url));
  });
}

export async function POST(request: Request) {
  return handleBotRoute(request, async (actor) => {
    const body = await readJsonBody(request);
    const result = await botCreateTicket(
      body,
      actor,
      request.headers.get("idempotency-key") ?? undefined,
    );
    return jsonOk(result, result.created ? 201 : 200);
  });
}
