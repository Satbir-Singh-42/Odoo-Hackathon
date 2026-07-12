/**
 * PUT  /api/inapp-notifications/[id]/read — mark notification read
 * (This is the exact sub-path that dataService calls: PUT /inapp-notifications/{id}/read)
 */
import { NextRequest } from "next/server";
import {
  requireAuth,
  isAuthError,
  noContent,
  notFound,
  serverError,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { markNotificationsRead } from "@/lib/services/notificationService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.NOTIFICATIONS_READ);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  try {
    const { id } = await params;
    const notifId = parseInt(id, 10);
    if (isNaN(notifId)) return notFound("Invalid notification ID");

    const existing = await prisma.inAppNotification.findFirst({
      where: { id: notifId, employeeId: session.user.employeeId, isDeleted: false },
    });
    if (!existing) return notFound("Notification not found");

    await markNotificationsRead(session.user.employeeId, [notifId]);
    return noContent();
  } catch (err) {
    return serverError(err);
  }
}
