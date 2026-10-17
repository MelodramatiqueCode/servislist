import { NextResponse } from "next/server";
import { searchCatalog } from "@/lib/search";
import { listDevices, listPrevadzkaProfiles, listTickets } from "@/lib/store";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const [tickets, stores, devices] = await Promise.all([
    listTickets({ status: "vsetky", archived: "all", q: "" }),
    listPrevadzkaProfiles(),
    listDevices(),
  ]);
  return NextResponse.json(searchCatalog({ q, tickets, stores, devices }));
}
