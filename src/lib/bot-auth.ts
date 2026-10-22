import { createHash, timingSafeEqual } from "crypto";
import {
  findApiTokenByHash,
  isApiTokenHashRevoked,
  touchApiTokenLastUsed,
} from "./db";

export type BotActor = {
  id: string;
  name: string;
};

type EnvBot = BotActor & {
  token?: string;
  tokenHash?: string;
};

const BUILTIN_BOTS: Array<{
  id: string;
  name: string;
  tokenEnv: string;
  hashEnv: string;
}> = [
  {
    id: "servis",
    name: "Servis bot",
    tokenEnv: "SERVIS_BOT_API_TOKEN",
    hashEnv: "SERVIS_BOT_API_TOKEN_HASH",
  },
  {
    id: "hotline",
    name: "Hotline bot",
    tokenEnv: "HOTLINE_BOT_API_TOKEN",
    hashEnv: "HOTLINE_BOT_API_TOKEN_HASH",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs hotline",
    tokenEnv: "ELEVENLABS_BOT_API_TOKEN",
    hashEnv: "ELEVENLABS_BOT_API_TOKEN_HASH",
  },
];

export function hashApiToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function safeEqualHex(left: string, right: string) {
  try {
    const a = Buffer.from(left, "hex");
    const b = Buffer.from(right, "hex");
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function safeEqualString(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseBearerToken(header: string | null) {
  if (!header) return "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

export function disabledBotIds() {
  return new Set(
    (process.env.API_BOT_DISABLED ?? "")
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function loadEnvBots(): EnvBot[] {
  const bots: EnvBot[] = [];

  for (const spec of BUILTIN_BOTS) {
    const token = process.env[spec.tokenEnv]?.trim();
    const tokenHash = process.env[spec.hashEnv]?.trim().toLowerCase();
    if (!token && !tokenHash) continue;
    bots.push({
      id: spec.id,
      name: spec.name,
      token,
      tokenHash,
    });
  }

  const extra = process.env.API_BOT_TOKENS?.trim();
  if (extra) {
    try {
      const parsed = JSON.parse(extra) as Array<{
        id?: unknown;
        name?: unknown;
        token?: unknown;
        tokenHash?: unknown;
      }>;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const id = String(item.id ?? "").trim();
          const name = String(item.name ?? "").trim();
          const token = String(item.token ?? "").trim();
          const tokenHash = String(item.tokenHash ?? "")
            .trim()
            .toLowerCase();
          if (!id || !name || (!token && !tokenHash)) continue;
          bots.push({ id, name, token: token || undefined, tokenHash });
        }
      }
    } catch {
      // ignore malformed extra list — builtin tokens still work
    }
  }

  return bots;
}

function matchEnvBot(token: string, bot: EnvBot): boolean {
  if (bot.tokenHash && safeEqualHex(hashApiToken(token), bot.tokenHash)) {
    return true;
  }
  if (bot.token && safeEqualString(token, bot.token)) {
    return true;
  }
  return false;
}

export async function authenticateBot(
  authorizationHeader: string | null,
): Promise<BotActor | null> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) return null;

  const tokenHash = hashApiToken(token);
  if (await isApiTokenHashRevoked(tokenHash)) {
    return null;
  }

  const disabled = disabledBotIds();
  for (const bot of loadEnvBots()) {
    if (disabled.has(bot.id.toLowerCase())) continue;
    if (matchEnvBot(token, bot)) {
      return { id: bot.id, name: bot.name };
    }
  }

  const row = await findApiTokenByHash(tokenHash);
  if (!row || row.revokedAt) return null;
  if (disabled.has(row.id.toLowerCase())) return null;
  await touchApiTokenLastUsed(row.id);
  return { id: row.id, name: row.name };
}

export function hasAnyBotTokenConfigured() {
  return loadEnvBots().length > 0;
}
