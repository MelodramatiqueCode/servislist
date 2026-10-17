import { NextResponse } from "next/server";
import { isKontrolaUnlocked } from "@/lib/kontrola-session";
import { searchCatalog } from "@/lib/search";
import { listDevices, listPrevadzkaProfiles, listTickets } from "@/lib/store";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const [tickets, stores, devices, includeKontrola] = await Promise.all([
    listTickets({ status: "vsetky", archived: "all", q: "" }),
    listPrevadzkaProfiles(),
    listDevices(),
    isKontrolaUnlocked(),
  ]);
  return NextResponse.json(
    searchCatalog({ q, tickets, stores, devices, includeKontrola }),
  );
}
