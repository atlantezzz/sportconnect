import { NextRequest, NextResponse } from "next/server";

// One proxy for every backend call: forwards the browser's cookie (and the
// client IP for rate limiting) to FastAPI and passes Set-Cookie back.
// The Geoapify routes under /api/geocode have their own route files, which
// take precedence over this catch-all.

const apiUrl = process.env.API_INTERNAL_URL ?? "http://api:8000";

// Only these backend areas are reachable through the proxy (not /docs etc.).
const ALLOWED_ROOTS = new Set([
  "activities",
  "auth",
  "chats",
  "friends",
  "messages",
  "notification-preferences",
  "notifications",
  "profile",
  "sports",
  "users",
]);

type Context = { params: Promise<{ path: string[] }> };

function errorResponse(detail: string, status: number) {
  return NextResponse.json({ detail }, { status });
}

async function proxy(request: NextRequest, context: Context) {
  const { path } = await context.params;

  if (!ALLOWED_ROOTS.has(path[0]) || path.some((segment) => segment === "." || segment === "..")) {
    return errorResponse("Deze pagina bestaat niet.", 404);
  }

  const backendPath = `/${path.map(encodeURIComponent).join("/")}`;
  const headers: Record<string, string> = {
    cookie: request.headers.get("cookie") ?? "",
    // Behind Cloudflare the visitor's address is in CF-Connecting-IP
    // (X-Forwarded-For can be spoofed).
    "x-forwarded-for":
      request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "",
  };
  const hasBody = request.method !== "GET" && request.method !== "DELETE";
  if (hasBody) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(`${apiUrl}${backendPath}${request.nextUrl.search}`, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      cache: "no-store",
    });
  } catch {
    return errorResponse("De backend is momenteel niet bereikbaar.", 502);
  }

  // "Not logged in" is a normal answer for the session check, not an error:
  // return 200 with user null so browsers don't log a failed request.
  if (backendPath === "/auth/me" && response.status === 401) {
    return NextResponse.json({ user: null });
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    // FastAPI answers a crash with plain text "Internal Server Error".
    return errorResponse("Er ging iets mis op de server. Probeer het later opnieuw.", response.status >= 400 ? response.status : 502);
  }

  // FastAPI's own validation errors are an English list; the frontend shows data.detail as text.
  if (response.status === 422 && data && typeof data === "object" && Array.isArray((data as { detail?: unknown }).detail)) {
    data = { detail: "Controleer je invoer en probeer het opnieuw." };
  }

  const result = NextResponse.json(data, { status: response.status });
  for (const cookie of response.headers.getSetCookie()) {
    result.headers.append("set-cookie", cookie);
  }
  return result;
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
