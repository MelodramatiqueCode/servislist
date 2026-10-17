import { handleBotRoute, jsonOk, readJsonBody } from "@/lib/api-http";
import { botSkladPrijem } from "@/lib/bot-api";

export async function POST(request: Request) {
  return handleBotRoute(request, async (actor) => {
    const body = await readJsonBody(request);
    return jsonOk(await botSkladPrijem(body, actor), 201);
  });
}
