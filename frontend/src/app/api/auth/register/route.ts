import { NextResponse } from "next/server";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://api:8000";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const response = await fetch(`${apiUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await response.json();
    const result = NextResponse.json(data, { status: response.status });
    const cookie = response.headers.get("set-cookie");

    if (cookie) {
      result.headers.set("set-cookie", cookie);
    }

    return result;
  } catch {
    return NextResponse.json(
      { detail: "De backend is momenteel niet bereikbaar." },
      { status: 502 },
    );
  }
}
