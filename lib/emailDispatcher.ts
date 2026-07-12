/**
 * lib/emailDispatcher.ts
 * Processes the NotificationQueue table and sends pending emails via Nodemailer.
 * Called from the /api/notifications/send/[id] and /api/notifications/dispatch routes.
 */

import { sendEmail, buildEmailHtml, getAdminEmails } from "@/lib/email";
import {
  getPendingEmails,
  markEmailSent,
  markEmailFailed,
  getSystemSettings,
  isWithinActiveTimeWindow,
  notifyAllAdmins
} from "@/lib/services/notificationService";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

function getAnomalySubtype(item: any) {
  if (!item) return null;
  const typeValue = String(item.type || "").toUpperCase();
  if (typeValue.startsWith("ANOMALY_")) return typeValue.replace("ANOMALY_", "");
  
  try {
    const metadata = item.metadata ? JSON.parse(item.metadata) : {};
    if (metadata?.anomalyType) {
      return String(metadata.anomalyType).toUpperCase().replace(/[^A-Z0-9_]/g, "");
    }
  } catch (e) {}
  return null;
}

/** Send one queued email by its queue ID. Returns true on success. */
export async function dispatchQueuedEmail(queueId: number, changedBy = "System"): Promise<boolean> {
  const item = await prisma.notificationQueue.findUnique({ where: { id: queueId } });
  if (!item) throw new Error(`Queue item ${queueId} not found`);
  if (item.status === "SENT" || item.status === "SUPPRESSED") return true;

  try {
    const recipients = item.recipient
      ? item.recipient.split(",").map((r) => r.trim()).filter(Boolean)
      : await getAdminEmails();

    if (recipients.length === 0) {
      await markEmailFailed(queueId, "No recipient email configured");
      return false;
    }

    await sendEmail({
      to: recipients,
      subject: item.subject,
      html: item.body?.includes("<html") ? item.body : buildEmailHtml({
        title: item.subject,
        body: item.body || "",
      }),
      cc: item.cc ? item.cc.split(",").map((c) => c.trim()).filter(Boolean) : undefined,
    });

    await markEmailSent(queueId);

    // Audit Logging
    try {
      const meta = item.metadata ? JSON.parse(item.metadata) : {};
      if (meta.auditEntries && Array.isArray(meta.auditEntries)) {
        for (const entry of meta.auditEntries) {
          await writeAuditLog({
            tableName: entry.tableName || "notificationQueue",
            recordId: entry.recordId,
            action: "EMAIL_SENT" as any,
            newValues: { ...entry.newValues, recipients: item.recipient },
            changedBy
          });
        }
      }
    } catch(e) {}

    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await markEmailFailed(queueId, message);
    return false;
  }
}

/** Process all pending emails in the queue (up to `limit`). Returns counts. */
export async function processPendingEmails(limit = 50): Promise<{
  sent: number;
  failed: number;
  skipped: number;
  reason?: string;
}> {
  const settings = await getSystemSettings();
  
  if (settings.enableEmailNotifications !== "true") {
    return { sent: 0, failed: 0, skipped: 0, reason: "global_disabled" };
  }
  if (settings.enableActiveTimeWindow === "true" && !isWithinActiveTimeWindow(settings)) {
    return { sent: 0, failed: 0, skipped: 0, reason: "outside_window" };
  }

  const pending = await getPendingEmails(limit);
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of pending) {
    if (item.status !== "PENDING") { skipped++; continue; }

    const isAnomaly = String(item.type || "").toUpperCase().startsWith("ANOMALY");
    if (isAnomaly) {
      if (settings.enableAnomalyAlerts !== "true") { skipped++; continue; }
      
      const subtype = getAnomalySubtype(item);
      if (subtype === "HOARDER" && settings.enableHoarderAlerts !== "true") { skipped++; continue; }
      if (subtype === "LEMON" && settings.enableLemonAlerts !== "true") { skipped++; continue; }
      if (subtype === "SOFTWARE_DUPLICATE" && settings.enableSoftwareDuplicateAlerts !== "true") { skipped++; continue; }
      if (subtype === "GHOST_ASSET" && settings.enableGhostAssetAlerts !== "true") { skipped++; continue; }
    }

    const success = await dispatchQueuedEmail(item.id);
    if (success) {
      sent++;
      if (isAnomaly) {
        await notifyAllAdmins({
          title: "Anomaly Alert Sent",
          message: "An anomaly alert was automatically dispatched to the target user.",
          type: "ANOMALY",
          linkPath: "/settings/notifications"
        }).catch(() => {});
      }
    } else {
      failed++;
    }
  }

  return { sent, failed, skipped };
}

export async function approveQueuedAnomaly(queueId: number, changedBy = "System") {
  const item = await prisma.notificationQueue.findUnique({ where: { id: queueId } });
  if (!item) throw new Error("Queued notification not found.");
  if (!String(item.type || "").toUpperCase().startsWith("ANOMALY")) {
    throw new Error("Only anomaly notifications can be approved here.");
  }
  if (item.status !== "PENDING") {
    throw new Error("Notification has already been processed.");
  }

  await dispatchQueuedEmail(queueId, changedBy);
  
  await notifyAllAdmins({
    title: "Anomaly Alert Sent",
    message: "An anomaly alert was sent to admin.",
    type: "ANOMALY",
    linkPath: "/settings/notifications"
  }).catch(() => {});

  return { success: true };
}

export async function suppressQueuedAnomaly(queueId: number, changedBy = "System") {
  const item = await prisma.notificationQueue.findUnique({ where: { id: queueId } });
  if (!item) throw new Error("Queued notification not found.");
  if (!String(item.type || "").toUpperCase().startsWith("ANOMALY")) {
    throw new Error("Only anomaly notifications can be suppressed here.");
  }
  if (item.status !== "PENDING") {
    throw new Error("Notification has already been processed.");
  }

  await prisma.notificationQueue.update({
    where: { id: queueId },
    data: {
      status: "SUPPRESSED",
      sentAt: new Date(),
      errorMessage: null,
      suppressedBy: changedBy,
      suppressedAt: new Date()
    }
  });

  try {
    const meta = item.metadata ? JSON.parse(item.metadata) : {};
    if (meta.auditEntries && Array.isArray(meta.auditEntries)) {
      for (const entry of meta.auditEntries) {
        await writeAuditLog({
          tableName: entry.tableName || "notificationQueue",
          recordId: entry.recordId,
          action: "EMAIL_SUPPRESSED" as any,
          newValues: { ...entry.newValues, suppressedBy: changedBy, suppressedAt: new Date().toISOString() },
          changedBy
        });
      }
    }
  } catch(e) {}

  await notifyAllAdmins({
    title: "Anomaly Alert Suppressed",
    message: "An anomaly alert was manually suppressed.",
    type: "ANOMALY",
    linkPath: "/settings/notifications"
  }).catch(() => {});

  return { success: true };
}

/**
 * Queue and immediately send a maintenance notification email.
 * Used after maintenance is created/updated.
 */
export async function sendMaintenanceEmail(params: {
  assetName: string;
  assetCode: string;
  scheduledDate: string;
  description: string;
  technician?: string | null;
  adminEmails: string[];
  type?: "SCHEDULED" | "UPDATED" | "COMPLETED" | "CANCELLED";
}) {
  const { assetName, assetCode, scheduledDate, description, technician, adminEmails, type = "SCHEDULED" } = params;

  const typeLabel: Record<string, string> = {
    SCHEDULED: "Maintenance Scheduled",
    UPDATED: "Maintenance Updated",
    COMPLETED: "Maintenance Completed",
    CANCELLED: "Maintenance Cancelled",
  };

  const subject = `[AssetFlow] ${typeLabel[type]} – ${assetName} (${assetCode})`;
  const body = buildEmailHtml({
    title: typeLabel[type],
    body: `
      <p>A maintenance record for <strong>${assetName}</strong> (${assetCode}) has been ${type.toLowerCase()}.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;">
        <tr style="background:#f8fafc;">
          <td style="padding:8px 12px;font-weight:600;color:#374151;width:40%;">Scheduled Date</td>
          <td style="padding:8px 12px;color:#1e293b;">${scheduledDate}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;font-weight:600;color:#374151;">Description</td>
          <td style="padding:8px 12px;color:#1e293b;">${description}</td>
        </tr>
        ${technician ? `
        <tr style="background:#f8fafc;">
          <td style="padding:8px 12px;font-weight:600;color:#374151;">Assigned Technician</td>
          <td style="padding:8px 12px;color:#1e293b;">${technician}</td>
        </tr>` : ""}
      </table>
    `,
  });

  if (adminEmails.length > 0) {
    await sendEmail({ to: adminEmails, subject, html: body });
  }
}

/**
 * Send a license expiry warning email.
 */
export async function sendLicenseExpiryEmail(params: {
  assetName: string;
  assetCode: string;
  expiryDate: string;
  daysLeft: number;
  adminEmails: string[];
}) {
  const { assetName, assetCode, expiryDate, daysLeft, adminEmails } = params;
  const urgency = daysLeft <= 1 ? "⚠️ URGENT" : daysLeft <= 7 ? "⚠️ Warning" : "📢 Notice";
  const subject = `[AssetFlow] ${urgency}: License Expiring in ${daysLeft} day${daysLeft !== 1 ? "s" : ""} – ${assetName}`;

  const html = buildEmailHtml({
    title: `License Expiry ${urgency}`,
    body: `
      <p>The software license for <strong>${assetName}</strong> (${assetCode}) 
         will expire in <strong>${daysLeft} day${daysLeft !== 1 ? "s" : ""}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;">
        <tr style="background:#fef2f2;">
          <td style="padding:8px 12px;font-weight:600;color:#374151;width:40%;">Asset</td>
          <td style="padding:8px 12px;color:#1e293b;">${assetName} (${assetCode})</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;font-weight:600;color:#374151;">Expiry Date</td>
          <td style="padding:8px 12px;color:#dc2626;font-weight:700;">${expiryDate}</td>
        </tr>
        <tr style="background:#fef2f2;">
          <td style="padding:8px 12px;font-weight:600;color:#374151;">Days Remaining</td>
          <td style="padding:8px 12px;color:#dc2626;font-weight:700;">${daysLeft}</td>
        </tr>
      </table>
      <p style="margin-top:16px;color:#6b7280;font-size:13px;">
        Please renew the license before it expires to avoid service interruption.
      </p>
    `,
  });

  if (adminEmails.length > 0) {
    await sendEmail({ to: adminEmails, subject, html });
  }
}
