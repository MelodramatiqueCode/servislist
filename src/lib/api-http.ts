import { NextResponse } from "next/server";
import { afterResponse } from "./after-response";
import { actorScope, authenticateBot, type BotActor } from "./bot-auth";

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

function normalizeBotPath(pathname: string) {
  const path = pathname.split("?")[0].replace(/\/+$/, "");
  return path || "/";
}

/**
 * Allowlist pre scope `ustredna`. `full` má všetko. Default deny.
 * GET /api/v1/* ; POST /api/v1/tickets ; POST /api/v1/tickets/:id/notes.
 */
export function isBotRouteAllowed(
  actor: Pick<BotActor, "scope">,
  method: string,
  pathname: string,
) {
  if (actorScope(actor) === "full") return true;
  const verb = method.toUpperCase();
  const path = normalizeBotPath(pathname);
  if (verb === "GET") {
    return path === "/api/v1" || path.startsWith("/api/v1/");
  }
  if (verb === "POST" && path === "/api/v1/tickets") return true;
  if (verb === "POST" && /^\/api\/v1\/tickets\/[^/]+\/notes$/.test(path)) {
    return true;
  }
  return false;
}

export async function handleBotRoute(
  request: Request,
  run: (actor: BotActor) => Promise<Response>,
) {
  const started = Date.now();
  const url = new URL(request.url);
  let actor: BotActor | null = null;
  const pending: Promise<unknown>[] = [];
  const schedule = (work: () => Promise<unknown> | unknown) => {
    const scheduled = afterResponse(work);
    if (scheduled) pending.push(scheduled);
  };
  try {
    actor = await requireBot(request);
    const caller = actor;
    if (!isBotRouteAllowed(caller, request.method, url.pathname)) {
      throw new ApiError(
        403,
        "forbidden_scope",
        "Tento bot nemá oprávnenie na túto akciu.",
      );
    }
    const response = await run(caller);
    schedule(() =>
      logBotCall(caller, request.method, url.pathname, response.status, started),
    );
    if (pending.length) await Promise.all(pending);
    return response;
  } catch (error) {
    const response = jsonError(error);
    const status = response.status;
    const caller = actor;
    const forbidden =
      error instanceof ApiError && error.code === "forbidden_scope";
    if (status >= 400) {
      schedule(async () => {
        const { captureAppError, writeAudit } = await import("./kontrola-store");
        await captureAppError({
          zdroj: "api",
          route: url.pathname,
          status,
          bot: caller?.name ?? "",
          message: error instanceof Error ? error.message : "API chyba",
          stack: error instanceof Error ? error.stack : "",
        });
        if (forbidden && caller) {
          await writeAudit({
            autor: caller.name,
            typ: "nastavenia",
            akcia: "forbidden_scope",
            entityId: caller.id,
            popis: `${caller.name} ${request.method} ${url.pathname} zamietnuté (scope ${actorScope(caller)})`,
            diff: {
              bot: caller.id,
              method: request.method,
              path: url.pathname,
              scope: actorScope(caller),
            },
          });
        }
      });
    }
    if (caller) {
      schedule(() =>
        logBotCall(caller, request.method, url.pathname, status, started),
      );
    }
    if (pending.length) await Promise.all(pending);
    return response;
  }
}

async function logBotCall(
  actor: BotActor,
  method: string,
  path: string,
  status: number,
  started: number,
) {
  try {
    const { logBotRequest } = await import("./kontrola-store");
    await logBotRequest({
      bot: actor.id,
      method,
      path,
      status,
      ms: Date.now() - started,
    });
  } catch {
    /* ignore */
  }
}
