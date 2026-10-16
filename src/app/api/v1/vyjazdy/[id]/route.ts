import { handleBotRoute, jsonOk } from "@/lib/api-http";
import { botGetVyjazd } from "@/lib/bot-api";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleBotRoute(request, async () => {
    const { id } = await context.params;
    return jsonOk(await botGetVyjazd(id));
  });
}
