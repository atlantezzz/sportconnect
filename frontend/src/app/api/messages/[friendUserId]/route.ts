import { NextRequest, NextResponse } from "next/server";
const apiUrl = process.env.API_INTERNAL_URL ?? "http://api:8000";
type Context = { params: Promise<{ friendUserId: string }> };
export async function GET(request: NextRequest, context: Context) {
  const { friendUserId } = await context.params;
  const afterId = request.nextUrl.searchParams.get("after_id") ?? "0";
  try {
    const response = await fetch(`${apiUrl}/messages/${encodeURIComponent(friendUserId)}?after_id=${encodeURIComponent(afterId)}`, { headers: { cookie: request.headers.get("cookie") ?? "" }, cache: "no-store" });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch { return NextResponse.json({ detail: "Privéberichten zijn momenteel niet beschikbaar." }, { status: 502 }); }
}
export async function POST(request: NextRequest, context: Context) {
  const { friendUserId } = await context.params;
  try {
    const body = await request.json();
    const response = await fetch(`${apiUrl}/messages/${encodeURIComponent(friendUserId)}`, { method: "POST", headers: { cookie: request.headers.get("cookie") ?? "", "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch { return NextResponse.json({ detail: "Het bericht kon niet worden verstuurd." }, { status: 502 }); }
}
