/**
 * API Route Helpers
 * Shared utilities for all Next.js API route handlers.
 * Provides auth guards, Zod validation, and standardised error responses.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { ZodSchema, ZodError } from "zod";

// =============================================
// STANDARDISED RESPONSES
// =============================================

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function badRequest(message: string, details?: unknown): NextResponse {
  return NextResponse.json(
    { status: "error", message, ...(details ? { details } : {}) },
    { status: 400 }
  );
}

export function unauthorized(message = "Authentication required."): NextResponse {
  return NextResponse.json({ status: "error", message }, { status: 401 });
}

export function forbidden(message = "Access denied."): NextResponse {
  return NextResponse.json({ status: "error", message }, { status: 403 });
}

export function notFound(message = "Resource not found."): NextResponse {
  return NextResponse.json({ status: "error", message }, { status: 404 });
}

export function conflict(message: string): NextResponse {
  return NextResponse.json({ status: "error", message }, { status: 409 });
}

export function serverError(error: unknown): NextResponse {
  console.error("[API Error]", error);
  const message =
    process.env.NODE_ENV === "development"
      ? String(error instanceof Error ? error.message : error)
      : "Internal server error.";
  return NextResponse.json({ status: "error", message }, { status: 500 });
}

// =============================================
// AUTH + PERMISSION GUARD
// =============================================

type AuthedSession = {
  user: {
    id: string;
    employeeId: string;
    fullName: string;
    role: string;
    managedCategories: string;
    permissions: string[];
  };
};

/**
 * Retrieve the current session and verify a required permission.
 * Returns { session } on success, or a NextResponse error.
 */
export async function requireAuth(
  requiredPermission?: string
): Promise<{ session: AuthedSession } | NextResponse> {
  const session = await auth();

  if (!session?.user) {
    return unauthorized();
  }

  if ((session.user as any).role === "__BLOCKED__") {
    return unauthorized("Account suspended. Access denied.");
  }

  if (
    requiredPermission &&
    !hasPermission(session.user.permissions, requiredPermission)
  ) {
    return forbidden(
      `Access denied. Required permission: ${requiredPermission}. Your role: ${session.user.role}`
    );
  }

  return { session: session as unknown as AuthedSession };
}

/**
 * Type guard to check if requireAuth returned an error response.
 */
export function isAuthError(
  result: { session: AuthedSession } | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}

// =============================================
// ZOD VALIDATION
// =============================================

/**
 * Parse and validate a request body with a Zod schema.
 * Returns { data } on success or a 400 NextResponse on failure.
 */
export async function parseBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): Promise<{ data: T } | NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const details = result.error.flatten().fieldErrors;
    return badRequest("Validation failed.", details);
  }

  return { data: result.data };
}

export function isParseError(
  result: { data: unknown } | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}

// =============================================
// PAGINATION HELPERS
// =============================================

export function getPagination(searchParams: URLSearchParams): {
  page: number;
  pageSize: number;
  skip: number;
} {
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10))
  );
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

// =============================================
// CATEGORY ACCESS (CBAC for Managers)
// =============================================

/**
 * Parse the managedCategories claim from the session.
 * Returns ["ALL"] for Admin/Viewer, or the specific category array for Managers.
 */
export function getManagedCategories(
  session: AuthedSession,
  viewerMode = false
): string[] {
  if (viewerMode) return ["ALL"];
  const raw = session.user.managedCategories ?? "ALL";
  if (!raw || raw === "ALL") return ["ALL"];
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

export function hasAllCategoryAccess(categories: string[]): boolean {
  return categories.includes("ALL");
}
