import { handleBotRoute, jsonOk } from "@/lib/api-http";
import { botListPrevadzky } from "@/lib/bot-api";

export async function GET(request: Request) {
  return handleBotRoute(request, async () => {
    const url = new URL(request.url);
    return jsonOk(await botListPrevadzky(url));
  });
}
