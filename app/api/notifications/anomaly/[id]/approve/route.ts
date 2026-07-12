/**
 * POST /api/notifications/anomaly/:id/approve — approve pending anomaly action
 */

import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError, notFound } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (isAuthError(authResult)) return authResult;

  try {
    const { id } = await params;
    const queueId = Number(id);
    if (Number.isNaN(queueId)) return notFound("Invalid anomaly alert ID");

    const existing = await prisma.notificationQueue.findUnique({
      where: { id: queueId },
    });
    if (!existing) return notFound("Anomaly alert not found");

    await prisma.notificationQueue.update({
      where: { id: queueId },
      data: {
        status: "SENT",
        sentAt: new Date(),
      },
    });

    return ok({ success: true, message: "Anomaly approved successfully" });
  } catch (err) {
    return serverError(err);
  }
}
