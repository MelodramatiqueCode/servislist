import { handleBotRoute, jsonOk, readJsonBody } from "@/lib/api-http";
import { botDeleteMaterial, botPatchMaterial } from "@/lib/bot-api";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  return handleBotRoute(request, async () => {
    const { id, itemId } = await context.params;
    const body = await readJsonBody(request);
    return jsonOk(await botPatchMaterial(id, itemId, body));
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  return handleBotRoute(request, async () => {
    const { id, itemId } = await context.params;
    return jsonOk(await botDeleteMaterial(id, itemId));
  });
}
