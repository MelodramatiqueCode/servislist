import { handleBotRoute, jsonOk } from "@/lib/api-http";
import { botSkladPrijem } from "@/lib/bot-api";
import { readPrijemRequest } from "@/lib/sklad-upload";

export async function POST(request: Request) {
  return handleBotRoute(request, async (actor) => {
    const { body, file } = await readPrijemRequest(request);
    return jsonOk(await botSkladPrijem(body, actor, file), 201);
  });
}
