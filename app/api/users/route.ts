/**
 * GET  /api/users — list users
 * POST /api/users — create user
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, created, serverError, conflict,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { listUsers, createUser } from "@/lib/services/userService";

export const runtime = "nodejs";

const createUserSchema = z.object({
  id: z.string().min(1).max(20),
  fullName: z.string().min(1).max(100),
  department: z.string().max(50).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8),
  role: z.enum(["Admin", "Manager", "Viewer"]).optional(),
  managedCategories: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.USER_READ);
  if (isAuthError(authResult)) return authResult;

  try {
    const sp = req.nextUrl.searchParams;
    const result = await listUsers({
      search: sp.get("search") ?? undefined,
      role: sp.get("role") ?? undefined,
      department: sp.get("department") ?? undefined,
      isBlocked: sp.get("blocked") === "true" ? true : sp.get("blocked") === "false" ? false : undefined,
      page: sp.get("page") ? parseInt(sp.get("page")!, 10) : 1,
      pageSize: sp.get("pageSize") ? parseInt(sp.get("pageSize")!, 10) : 50,
      sortBy: sp.get("sortBy") ?? "fullName",
      sortOrder: (sp.get("sortOrder") as "asc" | "desc") ?? "asc",
    });
    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.USER_CREATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const bodyResult = await parseBody(req, createUserSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const user = await createUser(bodyResult.data, session.user.employeeId);
    return created(user);
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) {
      return conflict(err.message);
    }
    return serverError(err);
  }
}
