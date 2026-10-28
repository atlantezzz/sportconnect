import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiUrl =
      process.env.API_INTERNAL_URL ?? "http://api:8000";

    const response = await fetch(`${apiUrl}/sports`, {
      cache: "no-store",
    });

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
    });
  } catch {
    return NextResponse.json(
      { error: "Sporten konden niet worden opgehaald." },
      { status: 502 },
    );
  }
}
