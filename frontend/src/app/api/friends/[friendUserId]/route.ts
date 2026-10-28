import { NextRequest, NextResponse } from "next/server";
const apiUrl = process.env.API_INTERNAL_URL ?? "http://api:8000";
export async function DELETE(request: NextRequest, context: { params: Promise<{ friendUserId: string }> }) {
  try {
    const { friendUserId } = await context.params;
    const response = await fetch(`${apiUrl}/friends/${friendUserId}`, { method: "DELETE", headers: { cookie: request.headers.get("cookie") ?? "" }, cache: "no-store" });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch { return NextResponse.json({ detail: "Vriend verwijderen is mislukt." }, { status: 502 }); }
}
