import { NextRequest, NextResponse } from "next/server";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://api:8000";

export async function GET(request: NextRequest) {
  try {
    const cookie = request.headers.get("cookie");

    const response = await fetch(`${apiUrl}/activities/joined`, {
      method: "GET",
      headers: cookie ? { cookie } : {},
      cache: "no-store",
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { detail: "De backend is momenteel niet bereikbaar." },
      { status: 502 },
    );
  }
}

