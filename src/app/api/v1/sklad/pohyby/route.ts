import { handleBotRoute, jsonOk } from "@/lib/api-http";
import { botSkladPohyby } from "@/lib/bot-api";

export async function GET(request: Request) {
  return handleBotRoute(request, async () =>
    jsonOk(await botSkladPohyby(new URL(request.url))),
  );
}
