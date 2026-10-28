import { NextResponse } from "next/server";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://api:8000";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const response = await fetch(`${apiUrl}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // For rate limiting per client in the backend. Behind Cloudflare the
        // visitor's address is in CF-Connecting-IP (X-Forwarded-For can be spoofed).
        "x-forwarded-for": request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "",
      },
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
