/**
 * PUT  /api/inapp-notifications/[id]/read  — mark a single notification as read
 * DELETE /api/inapp-notifications/[id]     — soft-delete a single notification
 */
import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import {
  requireAuth,
  isAuthError,
  noContent,
  notFound,
  serverError,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { markNotificationsRead, deleteInAppNotification } from "@/lib/services/notificationService";
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
    revalidatePath("/dashboard");
    return noContent();
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(
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

    await deleteInAppNotification(notifId, session.user.employeeId);
    revalidatePath("/dashboard");
    return noContent();
  } catch (err) {
    return serverError(err);
  }
}
