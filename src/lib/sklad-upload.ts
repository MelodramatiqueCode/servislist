import { ApiError, asRecord, readJsonBody } from "./api-http";
import { DL_FILE_MAX_BYTES } from "./sklad";

export const DL_FILE_MIMES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

const EXT_MIME: Record<string, (typeof DL_FILE_MIMES)[number]> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".pdf": "application/pdf",
};

export type DlFileBytes = {
  name: string;
  mime: string;
  bytes: Buffer;
};

export function dlFileViewUrl(id: string) {
  return `/api/sklad/dl/${id}/subor`;
}

export function normalizeDlFileMime(mime: string, name: string) {
  const raw = mime.trim().toLowerCase();
  if ((DL_FILE_MIMES as readonly string[]).includes(raw)) {
    return raw === "image/jpg" ? "image/jpeg" : raw;
  }
  const ext = name.includes(".")
    ? name.slice(name.lastIndexOf(".")).toLowerCase()
    : "";
  return EXT_MIME[ext] ?? raw;
}

export function inspectDlFile(file: DlFileBytes): DlFileBytes {
  if (!file.bytes.length) {
    throw new ApiError(400, "validation_error", "Súbor prílohy je prázdny.", {
      subor: "Pošli JPG, PNG, WebP, HEIC alebo PDF.",
    });
  }
  if (file.bytes.length > DL_FILE_MAX_BYTES) {
    throw new ApiError(
      413,
      "payload_too_large",
      "Súbor dodacieho listu je väčší ako 4 MB.",
      { subor: "Maximálna veľkosť je 4 MB." },
    );
  }
  const mime = normalizeDlFileMime(file.mime, file.name);
  if (!(DL_FILE_MIMES as readonly string[]).includes(mime)) {
    throw new ApiError(
      400,
      "validation_error",
      "Nepodporovaný typ súboru. Pošli JPG, PNG, WebP, HEIC alebo PDF.",
      { subor: "Povolené: jpg, png, webp, heic, pdf." },
    );
  }
  const name = file.name.trim() || "priloha";
  return { name, mime, bytes: file.bytes };
}

export function parseDlFileFromJson(raw: unknown): DlFileBytes | undefined {
  if (raw == null || raw === "") return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiError(400, "validation_error", "Príloha musí byť objekt { nazov, mime, base64 }.", {
      subor: "Očakávaný objekt súboru.",
    });
  }
  const o = raw as Record<string, unknown>;
  const b64 = String(o.base64 ?? o.data ?? "").replace(/\s+/g, "");
  if (!b64) {
    throw new ApiError(400, "validation_error", "Chýba base64 obsah prílohy.", {
      subor: "Pole base64 je povinné.",
    });
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(b64, "base64");
  } catch {
    throw new ApiError(400, "validation_error", "Base64 prílohy je neplatné.", {
      subor: "Nepodarilo sa dekódovať súbor.",
    });
  }
  if (!bytes.length) {
    throw new ApiError(400, "validation_error", "Base64 prílohy je neplatné.", {
      subor: "Nepodarilo sa dekódovať súbor.",
    });
  }
  return inspectDlFile({
    name: String(o.nazov ?? o.name ?? "priloha"),
    mime: String(o.mime ?? o.type ?? ""),
    bytes,
  });
}

export async function parseDlFileFromFormData(
  form: FormData,
): Promise<DlFileBytes | undefined> {
  const raw = form.get("subor");
  if (!raw || typeof raw === "string") return undefined;
  const file = raw as File;
  if (file.size <= 0) return undefined;
  if (file.size > DL_FILE_MAX_BYTES) {
    throw new ApiError(
      413,
      "payload_too_large",
      "Súbor dodacieho listu je väčší ako 4 MB.",
      { subor: "Maximálna veľkosť je 4 MB." },
    );
  }
  return inspectDlFile({
    name: file.name || "priloha",
    mime: file.type || "",
    bytes: Buffer.from(await file.arrayBuffer()),
  });
}

export async function readPrijemRequest(request: Request): Promise<{
  body: unknown;
  file?: DlFileBytes;
}> {
  const ct = request.headers.get("content-type") || "";
  if (ct.toLowerCase().includes("multipart/form-data")) {
    const form = await request.formData();
    const dataRaw = form.get("data");
    let body: unknown = {};
    if (typeof dataRaw === "string" && dataRaw.trim()) {
      try {
        body = JSON.parse(dataRaw);
      } catch {
        throw new ApiError(400, "invalid_json", "Pole data nie je platný JSON.");
      }
    } else if (dataRaw && typeof dataRaw !== "string") {
      const text = await (dataRaw as File).text();
      if (text.trim()) {
        try {
          body = JSON.parse(text);
        } catch {
          throw new ApiError(400, "invalid_json", "Pole data nie je platný JSON.");
        }
      }
    }
    return { body, file: await parseDlFileFromFormData(form) };
  }
  const body = await readJsonBody(request);
  let file: DlFileBytes | undefined;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const rec = asRecord(body);
    if (rec.subor != null) file = parseDlFileFromJson(rec.subor);
  }
  return { body, file };
}

export async function readAttachRequest(request: Request): Promise<DlFileBytes> {
  const ct = request.headers.get("content-type") || "";
  if (ct.toLowerCase().includes("multipart/form-data")) {
    const form = await request.formData();
    const file = await parseDlFileFromFormData(form);
    if (!file) {
      throw new ApiError(400, "validation_error", "Chýba súbor prílohy.", {
        subor: "Pošli pole subor.",
      });
    }
    return file;
  }
  const body = await readJsonBody(request);
  const rec = asRecord(body);
  const file = parseDlFileFromJson(rec.subor ?? rec);
  if (!file) {
    throw new ApiError(400, "validation_error", "Chýba súbor prílohy.", {
      subor: "Pošli { nazov, mime, base64 }.",
    });
  }
  return file;
}
