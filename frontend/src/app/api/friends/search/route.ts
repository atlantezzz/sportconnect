import { NextRequest, NextResponse } from "next/server";
const apiUrl = process.env.API_INTERNAL_URL ?? "http://api:8000";
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") ?? "";
    const response = await fetch(`${apiUrl}/friends/search?q=${encodeURIComponent(q)}`, { headers: { cookie: request.headers.get("cookie") ?? "" }, cache: "no-store" });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch { return NextResponse.json({ detail: "Zoeken is momenteel niet beschikbaar." }, { status: 502 }); }
}
