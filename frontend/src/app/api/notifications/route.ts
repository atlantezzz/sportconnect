import { NextRequest, NextResponse } from "next/server";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://api:8000";

async function forward(request: NextRequest, path: string, method: string) {
  const headers: Record<string, string> = {
    cookie: request.headers.get("cookie") ?? "",
  };
  const init: RequestInit = {
    method,
    headers,
    cache: "no-store",
  };
  if (method === "PUT") {
    headers["content-type"] = "application/json";
    init.body = await request.text();
  }
  const response = await fetch(`${apiUrl}${path}`, init);
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function GET(request: NextRequest) {
  return forward(request, "/notifications", "GET");
}

export async function POST(request: NextRequest) {
  return forward(request, "/notifications/read-all", "POST");
}
