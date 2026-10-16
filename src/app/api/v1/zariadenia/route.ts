import { handleBotRoute, jsonOk } from "@/lib/api-http";
import { botListDevices } from "@/lib/bot-api";

export async function GET(request: Request) {
  return handleBotRoute(request, async () => {
    const url = new URL(request.url);
    return jsonOk(await botListDevices(url));
  });
}
