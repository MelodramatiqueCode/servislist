import { handleBotRoute, jsonOk } from "@/lib/api-http";
import { botOpenTicketsByLocation } from "@/lib/bot-insights";

export async function GET(request: Request) {
  return handleBotRoute(request, async () => {
    return jsonOk(await botOpenTicketsByLocation(new URL(request.url)));
  });
}
