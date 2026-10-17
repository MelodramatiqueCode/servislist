import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { ApiError } from "../src/lib/api-http";
import {
  inspectDlFile,
  parseDlFileFromJson,
} from "../src/lib/sklad-upload";
import type * as BotApi from "../src/lib/bot-api";
import type * as SkladStore from "../src/lib/sklad-store";

const previous = {
  dataDir: process.env.SERVISLIST_DATA_DIR,
  databaseUrl: process.env.DATABASE_URL,
  postgresUrl: process.env.POSTGRES_URL,
  prismaUrl: process.env.POSTGRES_PRISMA_URL,
};

const jpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wAAAAD/wgARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPwB//9k=",
  "base64",
);

const actor = { id: "servis", name: "Servis bot" };

let bot: typeof BotApi;
let sklad: typeof SkladStore;

describe("sklad prijem subor", () => {
  before(async () => {
    process.env.SERVISLIST_DATA_DIR = await mkdtemp(
      path.join(tmpdir(), "servislist-dl-"),
    );
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    bot = await import("../src/lib/bot-api");
    sklad = await import("../src/lib/sklad-store");
    await sklad.ensureSkladCatalog();
  });

  after(() => {
    if (previous.dataDir === undefined) delete process.env.SERVISLIST_DATA_DIR;
    else process.env.SERVISLIST_DATA_DIR = previous.dataDir;
    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.databaseUrl;
    if (previous.postgresUrl === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = previous.postgresUrl;
    if (previous.prismaUrl === undefined) delete process.env.POSTGRES_PRISMA_URL;
    else process.env.POSTGRES_PRISMA_URL = previous.prismaUrl;
  });

  test("reject oversized and wrong mime with Slovak ApiError", () => {
    assert.throws(
      () =>
        inspectDlFile({
          name: "x.bin",
          mime: "application/octet-stream",
          bytes: Buffer.from("nope"),
        }),
      (err: unknown) =>
        err instanceof ApiError &&
        err.status === 400 &&
        /JPG, PNG, WebP, HEIC alebo PDF/.test(err.message),
    );
    assert.throws(
      () =>
        inspectDlFile({
          name: "huge.jpg",
          mime: "image/jpeg",
          bytes: Buffer.alloc(4 * 1024 * 1024 + 1),
        }),
      (err: unknown) =>
        err instanceof ApiError &&
        err.status === 413 &&
        /4 MB/.test(err.message),
    );
    const ok = inspectDlFile({
      name: "faktura.PDF",
      mime: "",
      bytes: Buffer.from("%PDF-1.4"),
    });
    assert.equal(ok.mime, "application/pdf");
  });

  test("JSON base64 subor is stored and survives reject", async () => {
    const created = await bot.botSkladPrijem(
      {
        dodavatel: "AudioTech",
        cisloDl: "DL-FILE-1",
        polozky: [
          { kod: "SD-CARD", nazov: "SD karta", kategoria: "SD karty", mnozstvo: 2 },
        ],
        subor: {
          nazov: "faktura.jpg",
          mime: "image/jpeg",
          base64: jpeg.toString("base64"),
        },
      },
      actor,
      parseDlFileFromJson({
        nazov: "faktura.jpg",
        mime: "image/jpeg",
        base64: jpeg.toString("base64"),
      }),
    );
    assert.equal(created.pending, true);
    assert.equal(created.prijem.stav, "cakajuci");
    assert.ok(created.subor);
    assert.equal(created.subor?.nazov, "faktura.jpg");
    assert.match(created.subor?.url ?? "", /\/api\/sklad\/dl\/.+\/subor/);

    const file = await sklad.getDlFile(created.prijem.id);
    assert.ok(file);
    assert.equal(file.mime, "image/jpeg");

    await sklad.resolveDodaciList(created.prijem.id, "rejected", "Martin");
    const after = await sklad.getDlFile(created.prijem.id);
    assert.ok(after);
    assert.equal(after.bytes.equals(jpeg), true);
    const row = await sklad.getDodaciList(created.prijem.id);
    assert.equal(row?.stav, "zamietnuty");
    assert.ok(row?.suborUrl);
  });

  test("JSON without file still creates pending receipt", async () => {
    const created = await bot.botSkladPrijem(
      {
        dodavatel: "AudioTech",
        cisloDl: "DL-NOFILE",
        polozky: [
          { kod: "SD-CARD", nazov: "SD karta", kategoria: "SD karty", mnozstvo: 1 },
        ],
      },
      actor,
    );
    assert.equal(created.subor, null);
    assert.equal(created.prijem.stav, "cakajuci");
  });

  test("attach endpoint adds file; second attach is 409; other bot 403", async () => {
    const created = await bot.botSkladPrijem(
      {
        dodavatel: "AudioTech",
        cisloDl: "DL-ATTACH",
        polozky: [
          { kod: "SD-CARD", nazov: "SD karta", kategoria: "SD karty", mnozstvo: 1 },
        ],
      },
      actor,
    );
    const attached = await bot.botSkladPrijemSubor(
      created.prijem.id,
      inspectDlFile({
        name: "doklad.pdf",
        mime: "application/pdf",
        bytes: Buffer.from("%PDF-1.4 test"),
      }),
      actor,
    );
    assert.ok(attached.subor);
    assert.equal(attached.subor?.nazov, "doklad.pdf");
    const stored = await sklad.getDlFile(created.prijem.id);
    assert.ok(stored);

    await assert.rejects(
      () =>
        bot.botSkladPrijemSubor(
          created.prijem.id,
          inspectDlFile({
            name: "other.pdf",
            mime: "application/pdf",
            bytes: Buffer.from("%PDF-1.4 other"),
          }),
          actor,
        ),
      (err: unknown) => err instanceof ApiError && err.status === 409,
    );
    const still = await sklad.getDlFile(created.prijem.id);
    assert.equal(still?.name, "doklad.pdf");

    await assert.rejects(
      () =>
        bot.botSkladPrijemSubor(
          created.prijem.id,
          inspectDlFile({
            name: "x.pdf",
            mime: "application/pdf",
            bytes: Buffer.from("%PDF-1.4"),
          }),
          { id: "hotline", name: "Hotline bot" },
        ),
      (err: unknown) => err instanceof ApiError && err.status === 403,
    );
  });

  test("empty prijem body is 400", async () => {
    await assert.rejects(
      () => bot.botSkladPrijem({}, actor),
      (err: unknown) =>
        err instanceof ApiError &&
        err.status === 400 &&
        /položky/.test(err.message),
    );
  });
});
