import { handleBotRoute, jsonOk, readJsonBody } from "@/lib/api-http";
import { botCreateNavrh } from "@/lib/bot-api";

export async function POST(request: Request) {
  return handleBotRoute(request, async (actor) => {
    const body = await readJsonBody(request);
    return jsonOk(await botCreateNavrh(body, actor), 201);
  });
}
