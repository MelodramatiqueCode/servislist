import { handleBotRoute, jsonOk, readJsonBody } from "@/lib/api-http";
import { botCreatePrevadzka, botListPrevadzky } from "@/lib/bot-api";

export async function GET(request: Request) {
  return handleBotRoute(request, async () => {
    const url = new URL(request.url);
    return jsonOk(await botListPrevadzky(url));
  });
}

export async function POST(request: Request) {
  return handleBotRoute(request, async (actor) => {
    const body = await readJsonBody(request);
    return jsonOk(await botCreatePrevadzka(body, actor), 201);
  });
}
