import { revalidatePath } from "next/cache";
/**
 * DELETE /api/audit-logs/clear?months=N
 * Clears audit logs older than N months (Admin only).
 */
import { NextRequest } from "next/server";
import {
  requireAuth,
  isAuthError,
  ok,
  badRequest,
  serverError,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.AUDIT_VIEW);
  if (isAuthError(authResult)) return authResult;

  try {
    const sp = req.nextUrl.searchParams;
    const months = parseInt(sp.get("months") ?? "0", 10);
    if (!months || months < 1) {
      return badRequest("months query parameter must be a positive integer.");
    }

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);

    const result = await prisma.auditLog.updateMany({
      where: { changedAt: { lt: cutoff }, isDeleted: false },
      data: { isDeleted: true },
    });

    revalidatePath("/settings");
    revalidatePath("/assets");
    revalidatePath("/dashboard");
    return ok({
      message: `${result.count} audit log(s) older than ${months} month(s) have been cleared.`,
      count: result.count,
    });
  } catch (err) {
    return serverError(err);
  }
}
