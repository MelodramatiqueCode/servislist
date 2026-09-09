import { NextResponse } from "next/server";
import { syncFromBalenaCloud } from "@/lib/store";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") !== "0";
  const result = await syncFromBalenaCloud({ force });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function GET() {
  const result = await syncFromBalenaCloud({ force: false });
  return NextResponse.json(result, { status: result.ok || !result.configured ? 200 : 400 });
}
