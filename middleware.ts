import { NextResponse, type NextRequest } from "next/server";

// Passes the requested path to server components, so a page that needs a signed-in person
// can send them to sign in and then straight back to where they were going.
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-ash-path", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api|_next|icon.svg|favicon.ico).*)"],
  runtime: "nodejs",
};
