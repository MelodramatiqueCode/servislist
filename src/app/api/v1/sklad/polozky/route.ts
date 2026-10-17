import { handleBotRoute, jsonOk } from "@/lib/api-http";
import { botSkladPolozky } from "@/lib/bot-api";

export async function GET(request: Request) {
  return handleBotRoute(request, async () =>
    jsonOk(await botSkladPolozky(new URL(request.url))),
  );
}
