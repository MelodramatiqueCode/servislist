import { NextResponse } from "next/server";
import { syncFromBalenaCloud } from "@/lib/store";

function authorizeCron(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** Manuálny sync z UI (tlačidlo Obnoviť). */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") !== "0";
  const result = await syncFromBalenaCloud({ force });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

/** Vercel Cron (+ voliteľný manuálny GET so secretom). */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const result = await syncFromBalenaCloud({ force });
  return NextResponse.json(result, {
    status: result.ok || !result.configured ? 200 : 400,
  });
}
