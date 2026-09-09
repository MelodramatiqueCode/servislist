import { NextResponse } from "next/server";
import { importBalenaDevices } from "@/lib/store";
import type { BalenaDeviceRaw } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const list = Array.isArray(body) ? body : body?.devices;
    if (!Array.isArray(list)) {
      return NextResponse.json(
        { error: "Očakávané pole zariadení (Balena export JSON)." },
        { status: 400 },
      );
    }

    const result = await importBalenaDevices(list as BalenaDeviceRaw[]);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Import zlyhal.",
      },
      { status: 500 },
    );
  }
}
