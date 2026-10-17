import { NextResponse } from "next/server";
import { KONTROLA_COOKIE, kontrolaCookieOptions } from "@/lib/kontrola-auth";
import { attemptKontrolaLogin } from "@/lib/kontrola-session";

export async function POST(request: Request) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const origin = new URL(request.url).origin;
  const result = await attemptKontrolaLogin(password);
  if (result.ok) {
    const res = NextResponse.redirect(new URL("/kontrola", origin), 303);
    if (result.token) {
      res.cookies.set(KONTROLA_COOKIE, result.token, kontrolaCookieOptions());
    }
    return res;
  }
  return NextResponse.redirect(new URL("/kontrola?chyba=1", origin), 303);
}
