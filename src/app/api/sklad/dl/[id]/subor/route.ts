import { getDlFile } from "@/lib/sklad-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const file = await getDlFile(id);
  if (!file) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `inline; filename="${file.name.replace(/"/g, "")}"`,
    },
  });
}
