import { handleBotRoute, jsonOk, readJsonBody } from "@/lib/api-http";
import { botGetTicket, botPatchTicket } from "@/lib/bot-api";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleBotRoute(request, async () => {
    const { id } = await context.params;
    return jsonOk(await botGetTicket(id));
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleBotRoute(request, async (actor) => {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    return jsonOk(await botPatchTicket(id, body, actor));
  });
}
