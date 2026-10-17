import { handleBotRoute, jsonOk, readJsonBody } from "@/lib/api-http";
import { botAddMaterial, botGetTicket } from "@/lib/bot-api";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleBotRoute(request, async () => {
    const { id } = await context.params;
    const payload = await botGetTicket(id);
    return jsonOk({ material: payload.material });
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleBotRoute(request, async (actor) => {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    return jsonOk(await botAddMaterial(id, body, actor), 201);
  });
}
