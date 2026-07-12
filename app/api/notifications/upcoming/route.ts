/**
 * GET /api/notifications/upcoming — fetch scheduled upcoming notification queue items
 */

import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.NOTIFICATIONS_READ);
  if (isAuthError(authResult)) return authResult;

  try {
    const items = await prisma.notificationQueue.findMany({
      where: {
        status: "PENDING",
        scheduledFor: { gt: new Date() },
      },
      orderBy: { scheduledFor: "asc" },
      take: 100,
    });

    const formatted = items.map((item) => {
      let meta: Record<string, unknown> | null = null;
      if (item.metadata) {
        try {
          meta = JSON.parse(item.metadata);
        } catch {
          meta = null;
        }
      }

      return {
        id: item.id,
        category:
          item.type === "MAINTENANCE" ||
          item.type === "LICENSE" ||
          item.type === "ANOMALY" ||
          item.type === "SYSTEM_AUDIT"
            ? item.type
            : "ANOMALY",
        type: item.type,
        assetId: String(meta?.assetId || item.maintenanceId || ""),
        assetCode: meta?.assetCode ? String(meta.assetCode) : "",
        assetName: item.subject,
        sentAt: item.scheduledFor.toISOString(),
        recipient: item.recipient || "Admin",
        recipientType: item.recipientType || "Admin",
        status: item.status,
        anomalyMeta: meta,
      };
    });

    return ok({ data: formatted });
  } catch (err) {
    return serverError(err);
  }
}
