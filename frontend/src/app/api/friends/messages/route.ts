import { NextRequest, NextResponse } from "next/server";
const apiUrl = process.env.API_INTERNAL_URL ?? "http://api:8000";
export async function GET(request: NextRequest) {
  try {
    const friendId = request.nextUrl.searchParams.get("friend_id") ?? "";
    const response = await fetch(`${apiUrl}/friends/messages?friend_id=${encodeURIComponent(friendId)}`, { headers: { cookie: request.headers.get("cookie") ?? "" }, cache: "no-store" });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch { return NextResponse.json({ detail: "Privéberichten konden niet worden geladen." }, { status: 502 }); }
}
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await fetch(`${apiUrl}/friends/messages`, { method: "POST", headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") ?? "" }, body: JSON.stringify(body), cache: "no-store" });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch { return NextResponse.json({ detail: "Privébericht kon niet worden verzonden." }, { status: 502 }); }
}
