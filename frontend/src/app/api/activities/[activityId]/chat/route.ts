import { NextRequest, NextResponse } from "next/server";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://api:8000";
type RouteContext = { params: Promise<{ activityId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { activityId } = await context.params;
    if (!/^\d+$/.test(activityId)) {
      return NextResponse.json({ detail: "Ongeldig activiteit-ID." }, { status: 400 });
    }

    const cookie = request.headers.get("cookie");
    const response = await fetch(`${apiUrl}/activities/${activityId}/chat`, {
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
