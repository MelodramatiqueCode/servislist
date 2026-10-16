import { handleBotRoute, jsonOk, readJsonBody } from "@/lib/api-http";
import { botCloseTicket } from "@/lib/bot-api";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleBotRoute(request, async (actor) => {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    return jsonOk(await botCloseTicket(id, body, actor));
  });
}
