import { handleBotRoute, jsonOk, readJsonBody } from "@/lib/api-http";
import { botGetPrevadzka, botPatchPrevadzka } from "@/lib/bot-api";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleBotRoute(request, async () => {
    const { id } = await context.params;
    return jsonOk(await botGetPrevadzka(id));
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleBotRoute(request, async (actor) => {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    return jsonOk(await botPatchPrevadzka(id, body, actor));
  });
}
