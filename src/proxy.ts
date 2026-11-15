import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/session-constants";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/leads",
  "/applications",
  "/credit",
  "/sanctions",
  "/disbursements",
  "/collections",
  "/tasks",
  "/authorizations",
  "/reports",
  "/users",
  "/access-control",
  "/audit-logs",
  "/operations",
  "/customers",
  "/profile",
];

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function crossSiteMutation(request: NextRequest) {
  if (!MUTATING_METHODS.has(request.method)) return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return Boolean(host && new URL(origin).host !== host);
  } catch {
    return true;
  }
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    // Same-origin enforcement for state-changing API calls (CSRF defense).
    if (crossSiteMutation(request)) {
      return NextResponse.json(
        { error: { code: "CSRF_BLOCKED", message: "Cross-site request blocked." } },
        { status: 403 },
      );
    }
    return NextResponse.next();
  }

  if (!PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/:path*",
    "/dashboard/:path*",
    "/leads/:path*",
    "/applications/:path*",
    "/credit/:path*",
    "/sanctions/:path*",
    "/disbursements/:path*",
    "/collections/:path*",
    "/tasks/:path*",
    "/authorizations/:path*",
    "/reports/:path*",
    "/users/:path*",
    "/access-control/:path*",
    "/audit-logs/:path*",
    "/operations/:path*",
    "/customers/:path*",
    "/profile/:path*",
  ],
};
