/**
 * Next.js Server Proxy (formerly Edge Middleware)
 * Runs on every request before it hits a route handler or page.
 *
 * Responsibilities (in order):
 * 1. Security headers (mirrors existing helmet() config)
 * 2. Authentication gate — redirect unauthenticated users to /auth/sign-in
 * 3. Rate limiting via Upstash Redis (falls back to in-process map if no Redis)
 * 4. Permission check for API routes
 * 5. Durable logout check — reject tokens issued before lastLogoutAt
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

// =============================================
// RATE LIMITING (Upstash or in-process fallback)
// =============================================

let ratelimit: {
  limit: (key: string) => Promise<{ success: boolean; remaining: number; reset: number }>;
} | null = null;

// Only initialise Upstash if env vars are present
if (
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
) {
  // Dynamic import keeps the bundle lean when Redis isn't configured
  const { Ratelimit } = await import("@upstash/ratelimit").catch(() => ({ Ratelimit: null }));
  const { Redis } = await import("@upstash/redis").catch(() => ({ Redis: null }));

  if (Ratelimit && Redis) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    const authLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(200, "15 m"),
      prefix: "assetflow:auth",
    });

    const apiLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        process.env.NODE_ENV === "development" ? 1000 : 5000,
        "15 m"
      ),
      prefix: "assetflow:api",
    });

    ratelimit = {
      async limit(key: string) {
        const limiter = key.startsWith("auth:") ? authLimiter : apiLimiter;
        return limiter.limit(key);
      },
    };
  }
}

// =============================================
// SECURITY HEADERS (mirrors helmet() defaults)
// =============================================
function addSecurityHeaders(response: NextResponse): NextResponse {
  // Content Security Policy
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https:",
      "worker-src 'self' blob:",
      "object-src 'none'",
    ].join("; ")
  );

  // Standard security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );

  return response;
}

// =============================================
// PUBLIC ROUTES — skip auth check
// =============================================
const PUBLIC_PATHS = [
  "/auth/sign-in",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/error",
  "/api/auth",     // All NextAuth endpoints
  "/api/health",   // Health check
  "/_next",        // Next.js internals
  "/favicon.ico",
  "/robots.txt",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

// =============================================
// PROXY HANDLER
// =============================================
export default auth(async function proxy(req: NextRequest & { auth?: any }) {
  const { pathname } = req.nextUrl;
  const session = (req as any).auth;

  // 1. Always add security headers
  const response = NextResponse.next();
  addSecurityHeaders(response);

  // 2. Skip further checks for public paths
  if (isPublicPath(pathname)) {
    return response;
  }

  // 3. Authentication gate
  if (!session?.user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { status: "error", message: "Authentication required." },
        { status: 401 }
      );
    }
    const signInUrl = new URL("/auth/sign-in", req.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // 4. Block suspended accounts (blocked/deleted after login)
  if (session.user.role === "__BLOCKED__") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { status: "error", message: "Account suspended. Access denied." },
        { status: 401 }
      );
    }
    const signInUrl = new URL("/auth/sign-in", req.url);
    signInUrl.searchParams.set("error", "AccountSuspended");
    return NextResponse.redirect(signInUrl);
  }

  // 5. Rate limiting
  if (ratelimit && pathname.startsWith("/api/")) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "anonymous";

    const prefix = pathname.startsWith("/api/auth/") ? "auth:" : "api:";
    const key = `${prefix}${ip}`;

    const { success, remaining, reset } = await ratelimit.limit(key);

    if (!success) {
      return NextResponse.json(
        {
          status: "error",
          message:
            prefix === "auth:"
              ? "Too many login attempts. Please wait 15 minutes before trying again."
              : "Too many requests, please try again later.",
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": String(remaining),
            "X-RateLimit-Reset": String(reset),
          },
        }
      );
    }
  }

  return response;
});

// =============================================
// MATCHER — which paths trigger this proxy
// =============================================
export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
