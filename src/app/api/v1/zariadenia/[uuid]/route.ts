import { handleBotRoute, jsonOk } from "@/lib/api-http";
import { botGetDevice } from "@/lib/bot-api";

export async function GET(
  request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  return handleBotRoute(request, async () => {
    const { uuid } = await context.params;
    return jsonOk(await botGetDevice(uuid));
  });
}
