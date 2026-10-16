import { handleBotRoute, jsonOk, readJsonBody } from "@/lib/api-http";
import { botLinkTicket } from "@/lib/bot-api";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleBotRoute(request, async (actor) => {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    return jsonOk(await botLinkTicket(id, body, actor));
  });
}
