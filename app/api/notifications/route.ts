import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError, parseBody, isParseError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getSystemSettings, updateSystemSetting } from "@/lib/services/notificationService";
import { z } from "zod";

export const runtime = "nodejs";

const putSchema = z.object({
  adminEmails: z.string(),
  managerEmails: z.string(),
});

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.NOTIFICATIONS_READ);
  if (isAuthError(authResult)) return authResult;

  try {
    const [items, settings] = await Promise.all([
      prisma.notificationQueue.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      getSystemSettings(),
    ]);

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
        sentAt: (item.sentAt || item.createdAt).toISOString(),
        recipient: item.recipient || "Admin",
        recipientType: item.recipientType || "Admin",
        status: item.status,
        anomalyMeta: meta,
      };
    });

    return ok({
      data: formatted,
      adminEmails: settings["admin_emails"] || "",
      managerEmails: settings["manager_emails"] || "",
      adminNames: settings["admin_names"] || "",
    });
  } catch (err) {
    return serverError(err);
  }
}

export async function PUT(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.SETTINGS_WRITE);
  if (isAuthError(authResult)) return authResult;

  const bodyResult = await parseBody(req, putSchema);
  if (isParseError(bodyResult)) return bodyResult;

  const { adminEmails, managerEmails } = bodyResult.data;

  try {
    // Resolve full names of the system administrators from the DB
    const emailsList = adminEmails
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const admins = await prisma.user.findMany({
      where: {
        email: { in: emailsList },
        isDeleted: false,
      },
      select: {
        fullName: true,
      },
    });

    const adminNames = admins.map((a) => a.fullName).join(", ");

    // Save settings to system_settings DB table
    await Promise.all([
      updateSystemSetting("admin_emails", adminEmails),
      updateSystemSetting("manager_emails", managerEmails),
      updateSystemSetting("admin_names", adminNames),
    ]);

    return ok({
      data: {
        adminEmails,
        managerEmails,
      },
      names: adminNames,
    });
  } catch (err) {
    return serverError(err);
  }
}

