import { NextResponse } from "next/server";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://api:8000";

export async function GET(request: Request) {
  try {
    const cookie = request.headers.get("cookie") ?? "";

    const response = await fetch(`${apiUrl}/auth/me`, {
      headers: { cookie },
      cache: "no-store",
    });

    // "Not logged in" is a normal answer for this check, not an error:
    // return 200 with user null so browsers don't log a failed request.
    if (response.status === 401) {
      return NextResponse.json({ user: null });
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { detail: "De backend is momenteel niet bereikbaar." },
      { status: 502 },
    );
  }
}
