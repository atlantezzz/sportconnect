import { NextRequest, NextResponse } from "next/server";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://api:8000";

export async function GET(request: NextRequest) {
  const response = await fetch(`${apiUrl}/notification-preferences`, {
    headers: { cookie: request.headers.get("cookie") ?? "" },
    cache: "no-store",
  });
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function PUT(request: NextRequest) {
  const response = await fetch(`${apiUrl}/notification-preferences`, {
    method: "PUT",
    headers: {
      cookie: request.headers.get("cookie") ?? "",
      "content-type": "application/json",
    },
    body: await request.text(),
    cache: "no-store",
  });
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
