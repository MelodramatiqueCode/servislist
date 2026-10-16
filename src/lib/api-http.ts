import { NextResponse } from "next/server";
import { authenticateBot, type BotActor } from "./bot-auth";

export type ApiErrorBody = {
  error: string;
  message: string;
  fields?: Record<string, string>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function jsonOk(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    const body: ApiErrorBody = {
      error: error.code,
      message: error.message,
    };
    if (error.fields) body.fields = error.fields;
    return NextResponse.json(body, { status: error.status });
  }
  return NextResponse.json(
    {
      error: "internal_error",
      message: error instanceof Error ? error.message : "Neznáma chyba.",
    } satisfies ApiErrorBody,
    { status: 500 },
  );
}

export async function requireBot(request: Request): Promise<BotActor> {
  const actor = await authenticateBot(request.headers.get("authorization"));
  if (!actor) {
    throw new ApiError(
      401,
      "unauthorized",
      "Chýba alebo je neplatný Bearer token.",
    );
  }
  return actor;
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "Telo požiadavky nie je platný JSON.");
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new ApiError(400, "invalid_json", "Očakávaný JSON objekt.");
}

export function queryString(url: URL, ...keys: string[]) {
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value?.trim()) return value.trim();
  }
  return "";
}

export async function handleBotRoute(
  request: Request,
  run: (actor: BotActor) => Promise<Response>,
) {
  try {
    const actor = await requireBot(request);
    return await run(actor);
  } catch (error) {
    return jsonError(error);
  }
}
