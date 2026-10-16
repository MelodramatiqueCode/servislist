import { handleBotRoute, jsonOk } from "@/lib/api-http";
import { botListTickets } from "@/lib/bot-insights";

export async function GET(request: Request) {
  return handleBotRoute(request, async () => {
    return jsonOk(await botListTickets(new URL(request.url)));
  });
}
