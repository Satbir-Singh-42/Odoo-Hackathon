/**
 * POST /api/notifications/send/[id] — manually dispatch a queued notification email
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, notFound, serverError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { dispatchQueuedEmail } from "@/lib/emailDispatcher";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (isAuthError(authResult)) return authResult;

  try {
    const { id } = await params;
    const queueId = parseInt(id, 10);
    if (isNaN(queueId)) return notFound("Invalid notification ID");

    const item = await prisma.notificationQueue.findUnique({ where: { id: queueId } });
    if (!item) return notFound("Notification not found");

    if (item.status === "SUPPRESSED") {
      return ok({ success: false, message: "Notification is suppressed and cannot be sent." });
    }

    // Re-mark as PENDING so dispatcher will pick it up
    if (item.status !== "PENDING") {
      await prisma.notificationQueue.update({
        where: { id: queueId },
        data: { status: "PENDING", scheduledFor: new Date(), errorMessage: null },
      });
    }

    const success = await dispatchQueuedEmail(queueId);
    return ok({
      success,
      message: success ? "Notification sent successfully." : "Failed to send notification. Check SMTP settings.",
    });
  } catch (err) {
    return serverError(err);
  }
}
