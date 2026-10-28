
import { NextResponse } from "next/server";

const apiUrl = () =>
  process.env.API_INTERNAL_URL ?? "http://api:8000";

export async function GET() {
  try {
    const response = await fetch(`${apiUrl()}/activities`, {
      cache: "no-store",
    });

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
    });
  } catch {
    return NextResponse.json(
      { error: "De backend is momenteel niet bereikbaar." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const response = await fetch(`${apiUrl()}/activities`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("cookie")
          ? { cookie: request.headers.get("cookie")! }
          : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
    });
  } catch {
    return NextResponse.json(
      { error: "De backend is momenteel niet bereikbaar." },
      { status: 502 },
    );
  }
}

