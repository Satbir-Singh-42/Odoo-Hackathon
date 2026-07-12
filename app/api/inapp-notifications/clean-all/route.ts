/**
 * DELETE /api/inapp-notifications/clean-all — soft-delete ALL notifications for the current user
 */
import {
  requireAuth,
  isAuthError,
  ok,
  serverError,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE() {
  const authResult = await requireAuth(PERMISSIONS.NOTIFICATIONS_READ);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  try {
    const result = await prisma.inAppNotification.updateMany({
      where: { employeeId: session.user.employeeId, isDeleted: false },
      data: { isDeleted: true },
    });

    return ok({ cleared: result.count, message: `${result.count} notification(s) cleared.` });
  } catch (err) {
    return serverError(err);
  }
}
