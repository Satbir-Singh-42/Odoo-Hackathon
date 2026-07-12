/**
 * POST /api/notifications/cancel/[id] — cancel / suppress a scheduled notification
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, notFound, serverError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  try {
    const { id } = await params;
    const queueId = parseInt(id, 10);
    if (isNaN(queueId)) return notFound("Invalid notification ID");

    const item = await prisma.notificationQueue.findUnique({ where: { id: queueId } });
    if (!item) return notFound("Notification not found");

    if (item.status === "SENT") {
      return ok({ success: false, message: "Cannot cancel an already-sent notification." });
    }

    await prisma.notificationQueue.update({
      where: { id: queueId },
      data: {
        status: "SUPPRESSED",
        suppressedBy: session.user.employeeId,
        suppressedAt: new Date(),
      },
    });

    return ok({ success: true, message: "Notification cancelled successfully." });
  } catch (err) {
    return serverError(err);
  }
}
