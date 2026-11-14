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
  "/audit-logs",
  "/operations",
  "/customers",
  "/profile",
];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
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
    "/audit-logs/:path*",
    "/operations/:path*",
    "/customers/:path*",
    "/profile/:path*",
  ],
};
