import { handleBotRoute, jsonOk } from "@/lib/api-http";

export async function GET(request: Request) {
  return handleBotRoute(request, async (actor) =>
    jsonOk({
      ok: true,
      version: 1,
      bot: actor.name,
      botId: actor.id,
    }),
  );
}
