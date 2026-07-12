/**
 * GET /api/notifications/anomaly-pending — fetch pending anomaly alert queue items awaiting admin review
 */

import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (isAuthError(authResult)) return authResult;

  try {
    const queueItems = await prisma.notificationQueue.findMany({
      where: {
        status: "PENDING",
        type: {
          in: ["HOARDER", "LEMON", "SOFTWARE_DUPLICATE", "GHOST_ASSET", "ANOMALY"],
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = queueItems.map((item) => {
      let payload: Record<string, unknown> | null = null;
      if (item.metadata) {
        try {
          payload = JSON.parse(item.metadata);
        } catch {
          payload = null;
        }
      }

      return {
        id: item.id,
        anomalyType: item.type,
        title: item.subject,
        message: item.body || null,
        payload,
        createdAt: item.createdAt.toISOString(),
        scheduledFor: item.scheduledFor.toISOString(),
        allocatedBy: payload && typeof payload.allocatedBy === "string" ? payload.allocatedBy : null,
      };
    });

    return ok({ data: formatted });
  } catch (err) {
    return serverError(err);
  }
}
