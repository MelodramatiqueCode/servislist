import { handleBotRoute, jsonOk } from "@/lib/api-http";
import { botSkladPrijemSubor } from "@/lib/bot-api";
import { readAttachRequest } from "@/lib/sklad-upload";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleBotRoute(request, async (actor) => {
    const { id } = await context.params;
    const file = await readAttachRequest(request);
    return jsonOk(await botSkladPrijemSubor(id, file, actor), 201);
  });
}
