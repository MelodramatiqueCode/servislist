import { handleBotRoute, jsonOk } from "@/lib/api-http";
import { botSkladOverview } from "@/lib/bot-api";

export async function GET(request: Request) {
  return handleBotRoute(request, async () => jsonOk(await botSkladOverview()));
}
