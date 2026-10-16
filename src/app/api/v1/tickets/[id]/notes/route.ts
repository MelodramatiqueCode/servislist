import { handleBotRoute, jsonOk, readJsonBody } from "@/lib/api-http";
import { botAddNote } from "@/lib/bot-api";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleBotRoute(request, async (actor) => {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    const result = await botAddNote(
      id,
      body,
      actor,
      request.headers.get("idempotency-key") ?? undefined,
    );
    return jsonOk(result, result.created ? 201 : 200);
  });
}
