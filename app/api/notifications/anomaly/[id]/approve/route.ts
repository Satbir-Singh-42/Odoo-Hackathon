/**
 * POST /api/notifications/anomaly/:id/approve — approve pending anomaly, send email
 */

import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError, notFound } from "@/lib/api-helpers";
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
    const queueId = Number(id);
    if (Number.isNaN(queueId)) return notFound("Invalid anomaly alert ID");

    const existing = await prisma.notificationQueue.findUnique({ where: { id: queueId } });
    if (!existing) return notFound("Anomaly alert not found");

    if (existing.status === "SUPPRESSED") {
      return ok({ success: false, message: "Alert is suppressed." });
    }

    // Re-mark PENDING so dispatcher sends it
    if (existing.status !== "PENDING") {
      await prisma.notificationQueue.update({
        where: { id: queueId },
        data: { status: "PENDING", scheduledFor: new Date(), errorMessage: null },
      });
    }

    // Actually dispatch the email
    const sent = await dispatchQueuedEmail(queueId);

    return ok({
      success: sent,
      message: sent
        ? "Anomaly alert approved and email sent successfully."
        : "Anomaly approved but email delivery failed — check SMTP settings.",
    });
  } catch (err) {
    return serverError(err);
  }
}
