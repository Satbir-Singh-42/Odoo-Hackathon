import { revalidatePath } from "next/cache";
/**
 * GET    /api/users/:id
 * PUT    /api/users/:id
 * DELETE /api/users/:id
 * POST   /api/users/:id/reset-password
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, notFound, serverError, noContent, forbidden,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import {
  getUserById,
  updateUser,
  deleteUser,
  adminResetPassword,
} from "@/lib/services/userService";

export const runtime = "nodejs";

const updateUserSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
  department: z.string().max(50).optional(),
  email: z.string().email().optional(),
  role: z.enum(["Admin", "Manager", "Viewer"]).optional(),
  managedCategories: z.string().optional(),
  isBlocked: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.USER_READ);
  if (isAuthError(authResult)) return authResult;

  try {
    const { id } = await params;
    const user = await getUserById(id);
    if (!user) return notFound("User not found.");
    return ok(user);
  } catch (err) {
    return serverError(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.USER_UPDATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const bodyResult = await parseBody(req, updateUserSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const { id } = await params;
    const updated = await updateUser(id, bodyResult.data, session.user.employeeId);
    revalidatePath("/settings");
    revalidatePath("/assets");
    revalidatePath("/dashboard");
    return ok(updated);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return notFound(err.message);
    }
    return serverError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.USER_DELETE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  try {
    const { id } = await params;
    await deleteUser(id, session.user.employeeId);
    revalidatePath("/settings");
    revalidatePath("/assets");
    revalidatePath("/dashboard");
    return noContent();
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("not found")) return notFound(err.message);
      if (err.message.includes("Cannot delete")) return forbidden(err.message);
    }
    return serverError(err);
  }
}
