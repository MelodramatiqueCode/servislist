import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  authenticateBot,
  disabledBotIds,
  hashApiToken,
  loadEnvBots,
  parseBearerToken,
  safeEqualHex,
  safeEqualString,
} from "../src/lib/bot-auth";

const ENV_KEYS = [
  "SERVIS_BOT_API_TOKEN",
  "SERVIS_BOT_API_TOKEN_HASH",
  "HOTLINE_BOT_API_TOKEN",
  "HOTLINE_BOT_API_TOKEN_HASH",
  "ELEVENLABS_BOT_API_TOKEN",
  "ELEVENLABS_BOT_API_TOKEN_HASH",
  "API_BOT_TOKENS",
  "API_BOT_DISABLED",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
] as const;

const snapshot = new Map<string, string | undefined>();
for (const key of ENV_KEYS) {
  snapshot.set(key, process.env[key]);
}

function resetEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = snapshot.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("bot-auth", () => {
  test("parsuje Bearer token", () => {
    assert.equal(parseBearerToken("Bearer abc"), "abc");
    assert.equal(parseBearerToken("bearer abc"), "abc");
    assert.equal(parseBearerToken("Basic abc"), "");
    assert.equal(parseBearerToken(null), "");
  });

  test("porovná reťazce a hashe bezpečne", () => {
    assert.equal(safeEqualString("abc", "abc"), true);
    assert.equal(safeEqualString("abc", "abd"), false);
    assert.equal(safeEqualString("abc", "ab"), false);
    const hash = hashApiToken("tajne");
    assert.equal(hash.length, 64);
    assert.equal(safeEqualHex(hash, hashApiToken("tajne")), true);
    assert.equal(safeEqualHex(hash, hashApiToken("ine")), false);
  });

  test("načíta builtin tokeny z env", () => {
    resetEnv();
    process.env.SERVIS_BOT_API_TOKEN = "servis-secret";
    process.env.HOTLINE_BOT_API_TOKEN_HASH = hashApiToken("hotline-secret");
    process.env.ELEVENLABS_BOT_API_TOKEN = "elevenlabs-secret";
    const bots = loadEnvBots();
    assert.equal(bots.length, 3);
    assert.equal(bots[0].id, "servis");
    assert.equal(bots[1].name, "Hotline bot");
    assert.equal(bots[2].id, "elevenlabs");
    assert.equal(bots[2].name, "ElevenLabs hotline");
  });

  test("bez ELEVENLABS_BOT_API_TOKEN je identita vypnutá", () => {
    resetEnv();
    process.env.SERVIS_BOT_API_TOKEN = "servis-secret";
    const bots = loadEnvBots();
    assert.equal(bots.some((bot) => bot.id === "elevenlabs"), false);
  });

  test("overí plaintext aj hash token", async () => {
    resetEnv();
    process.env.SERVIS_BOT_API_TOKEN = "servis-secret";
    process.env.HOTLINE_BOT_API_TOKEN_HASH = hashApiToken("hotline-secret");
    process.env.ELEVENLABS_BOT_API_TOKEN = "elevenlabs-secret";

    const servis = await authenticateBot("Bearer servis-secret");
    assert.deepEqual(servis, { id: "servis", name: "Servis bot" });

    const hotline = await authenticateBot("Bearer hotline-secret");
    assert.deepEqual(hotline, { id: "hotline", name: "Hotline bot" });

    const elevenlabs = await authenticateBot("Bearer elevenlabs-secret");
    assert.deepEqual(elevenlabs, {
      id: "elevenlabs",
      name: "ElevenLabs hotline",
    });

    assert.equal(await authenticateBot("Bearer zly"), null);
    assert.equal(await authenticateBot("Bearer "), null);
  });

  test("API_BOT_DISABLED odoberie bota", async () => {
    resetEnv();
    process.env.SERVIS_BOT_API_TOKEN = "servis-secret";
    process.env.API_BOT_DISABLED = "servis";
    assert.deepEqual([...disabledBotIds()], ["servis"]);
    assert.equal(await authenticateBot("Bearer servis-secret"), null);
  });

  test("API_BOT_TOKENS pridá extra bota", async () => {
    resetEnv();
    process.env.API_BOT_TOKENS = JSON.stringify([
      {
        id: "sklad",
        name: "Sklad bot",
        tokenHash: hashApiToken("sklad-secret"),
      },
    ]);
    const actor = await authenticateBot("Bearer sklad-secret");
    assert.deepEqual(actor, { id: "sklad", name: "Sklad bot" });
  });
});
