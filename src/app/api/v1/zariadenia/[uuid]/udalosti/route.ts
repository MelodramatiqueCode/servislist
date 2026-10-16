import { handleBotRoute, jsonOk, queryString } from "@/lib/api-http";
import { botDeviceEventHistory } from "@/lib/bot-insights";

export async function GET(
  request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  return handleBotRoute(request, async () => {
    const { uuid } = await context.params;
    const url = new URL(request.url);
    return jsonOk(
      await botDeviceEventHistory(uuid, queryString(url, "dni", "days")),
    );
  });
}
