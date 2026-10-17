import { handleBotRoute, jsonOk, readJsonBody } from "@/lib/api-http";
import { botListVyjazdy, botProposeVyjazd } from "@/lib/bot-api";

export async function GET(request: Request) {
  return handleBotRoute(request, async () => {
    const url = new URL(request.url);
    return jsonOk(await botListVyjazdy(url));
  });
}

export async function POST(request: Request) {
  return handleBotRoute(request, async (actor) => {
    const body = await readJsonBody(request);
    return jsonOk(await botProposeVyjazd(body, actor), 201);
  });
}
