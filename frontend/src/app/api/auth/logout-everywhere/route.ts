import { NextResponse } from "next/server";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://api:8000";

export async function POST(request: Request) {
  try {
    const cookie = request.headers.get("cookie");
    const response = await fetch(`${apiUrl}/auth/logout-everywhere`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: await request.text(),
      cache: "no-store",
    });

    const data = await response.json();
    const result = NextResponse.json(data, { status: response.status });
    // A new or cleared session cookie.
    const setCookie = response.headers.get("set-cookie");

    if (setCookie) {
      result.headers.set("set-cookie", setCookie);
    }

    return result;
  } catch {
    return NextResponse.json(
      { detail: "De backend is momenteel niet bereikbaar." },
      { status: 502 },
    );
  }
}
