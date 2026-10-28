import { NextRequest, NextResponse } from "next/server";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://api:8000";

type RouteContext = {
  params: Promise<{ activityId: string }>;
};

async function proxyJoinRequest(
  request: NextRequest,
  context: RouteContext,
  method: "POST" | "DELETE",
) {
  try {
    const { activityId } = await context.params;

    if (!/^\d+$/.test(activityId)) {
      return NextResponse.json(
        { detail: "Ongeldig activiteit-ID." },
        { status: 400 },
      );
    }

    const cookie = request.headers.get("cookie");

    const response = await fetch(
      `${apiUrl}/activities/${activityId}/join`,
      {
        method,
        headers: cookie ? { cookie } : {},
        cache: "no-store",
      },
    );

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { detail: "De backend is momenteel niet bereikbaar." },
      { status: 502 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  return proxyJoinRequest(request, context, "POST");
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
) {
  return proxyJoinRequest(request, context, "DELETE");
}
