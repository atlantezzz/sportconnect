import { NextRequest, NextResponse } from "next/server";
const apiUrl = process.env.API_INTERNAL_URL ?? "http://api:8000";
export async function POST(request: NextRequest) {
  try {
    const response = await fetch(`${apiUrl}/friends/respond`, {
      method: "POST", headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") ?? "" },
      body: JSON.stringify(await request.json()), cache: "no-store"
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch { return NextResponse.json({ detail: "De actie kon niet worden uitgevoerd." }, { status: 502 }); }
}
