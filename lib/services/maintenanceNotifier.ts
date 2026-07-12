/**
 * lib/services/maintenanceNotifier.ts
 * Ported from server/services/maintenanceNotifier.js
 *
 * Orchestrates daily maintenance & license-expiry email notifications,
 * anomaly detection (Hoarder, Lemon, Software Duplicate, Ghost Asset),
 * and license-status maintenance.
 *
 * Smart Routing:
 *   - Technician assigned with email → email goes to technician
 *   - Otherwise → Operations Manager (falls back to Admin)
 *   - Overdue / Action-Today emails always CC the Manager when sent to a technician
 */

import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import {
  notifyAllAdmins,
  queueEmail,
  cancelPendingSimilarAnomalies,
  getSystemSettings,
  isWithinActiveTimeWindow,
} from "@/lib/services/notificationService";
import {
  getAdminEmails,
  buildMaintenanceReminderPayload,
  buildMaintenanceActionTodayPayload,
  buildMaintenanceOverduePayload,
  buildLicenseExpiryReminderPayload,
  buildAnomalyEmail,
} from "@/lib/email";
import { AssetStatus, MaintenanceStatus } from "@prisma/client";

// =============================================
// CONSTANTS
// =============================================

const ANOMALY_APPROVAL_DELAY_MINUTES = 4;
const BULK_CHUNK = 250;

// =============================================
// TYPES
// =============================================

interface MaintenanceRecord {
  id: number;
  assetCode: string;
  assetName: string;
  categoryName: string;
  scheduledDate: Date;
  description: string;
  technician?: string;
  technicianEmail?: string | null;
  isBulkGroupRecord: boolean;
  childUnitCount?: number;
}

interface TechGroup {
  technicianEmail: string;
  technicianName: string | null;
  records: MaintenanceRecord[];
}

interface EmailPayload {
  to: string;
  cc?: string | null;
  subject: string;
  html: string;
}

// =============================================
// HELPERS
// =============================================

function chunkArray<T>(arr: T[], size = BULK_CHUNK): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

/**
 * Group maintenance records by technician email.
 * Records without a valid email go into unassignedRecords.
 */
function getTechnicianGroups(records: MaintenanceRecord[]): {
  techGroups: TechGroup[];
  unassignedRecords: MaintenanceRecord[];
} {
  const groups: Record<string, TechGroup> = {};
  const unassigned: MaintenanceRecord[] = [];

  for (const r of records) {
    const email = r.technicianEmail?.trim();
    if (email) {
      if (!groups[email]) {
        groups[email] = { technicianEmail: email, technicianName: r.technician ?? null, records: [] };
      }
      groups[email].records.push(r);
    } else {
      unassigned.push(r);
    }
  }
  return { techGroups: Object.values(groups), unassignedRecords: unassigned };
}

function groupRecordsByCategory<T extends { categoryName: string }>(
  records: T[],
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const r of records) {
    const cat = r.categoryName || "Uncategorized";
    if (!result[cat]) result[cat] = [];
    result[cat].push(r);
  }
  return result;
}

function toEmailList(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value.join(",") : value;
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

/**
 * Build a CC email list by removing primaries from the cc list.
 */
function buildCcList(primaryEmails: string, ccEmails?: string | null): string | null {
  const primary = new Set(toEmailList(primaryEmails).map((e) => e.toLowerCase()));
  const cc = toEmailList(ccEmails).filter((e) => !primary.has(e.toLowerCase()));
  return cc.length > 0 ? cc.join(", ") : null;
}

/**
 * Filter emails by category using system settings (Operations Manager category assignment).
 * Falls back to all emails if no category filter is configured.
 */
async function filterEmailsByCategory(emails: string, categoryName: string): Promise<string> {
  // For now, return all emails — category filtering can be layered from SystemSettings
  // if `managed_categories` per-manager is stored there.
  return emails;
}

/**
 * Get Operations Manager emails from system settings, with Admin fallback.
 */
async function getOperationsManagerEmailsWithFallbackInfo(): Promise<{
  emails: string;
  isFallback: boolean;
}> {
  try {
    const settings = await getSystemSettings();
    const mgr = settings["operations_manager_emails"]?.trim();
    if (mgr) return { emails: mgr, isFallback: false };

    // Fallback to admin
    const adminList = await getAdminEmails();
    return { emails: adminList.join(", "), isFallback: true };
  } catch {
    const adminList = await getAdminEmails();
    return { emails: adminList.join(", "), isFallback: true };
  }
}

function getEmailResumeDateCutoff(settings: Record<string, string>): Date | null {
  const raw = (settings["emailResumeDate"] ?? settings["email_resume_date"] ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(raw);
  return null;
}

function buildAnomalyToastMeta(type: string, payload: Record<string, unknown>) {
  const delayLabel = `${ANOMALY_APPROVAL_DELAY_MINUTES} min`;
  switch (type) {
    case "HOARDER":
      return {
        title: "Anomaly detected: Hoarder",
        message: `${payload.userName || "Employee"} has ${payload.activeCount} active ${payload.assetType}(s). Auto-send in ${delayLabel}.`,
      };
    case "SOFTWARE_DUPLICATE":
      return {
        title: "Anomaly detected: Duplicate software",
        message: `${payload.userName || "Employee"} has ${payload.duplicateCount} active "${payload.softwareType}" license(s). Auto-send in ${delayLabel}.`,
      };
    case "LEMON":
      return {
        title: "Anomaly detected: Lemon hardware",
        message: `${payload.assetCode || payload.assetName || "Asset"} repaired again after ${payload.daysSinceLast} day(s). Auto-send in ${delayLabel}.`,
      };
    case "GHOST_ASSET":
      return {
        title: "Anomaly detected: Ghost assets",
        message: `${payload.assetCount} dormant asset(s) detected. Auto-send in ${delayLabel}.`,
      };
    default:
      return {
        title: "Anomaly detected",
        message: `An anomaly alert is pending review. Auto-send in ${delayLabel}.`,
      };
  }
}

// =============================================
// ANOMALY QUEUEING
// =============================================

export async function queueAnomalyApproval(params: {
  anomalyType: string;
  payload: Record<string, unknown>;
  auditEntries: Array<{
    tableName: string;
    recordId: string | number;
    newValues: Record<string, unknown>;
  }>;
  recipientEmails: string;
  recipientNames?: string;
  allocatedBy?: string | null;
}): Promise<{ queued: boolean; queueId?: number | null; reason?: string }> {
  const { anomalyType, payload, auditEntries, recipientEmails, recipientNames, allocatedBy = null } = params;

  const built = buildAnomalyEmail(anomalyType, payload);
  if (!built) return { queued: false, reason: "unsupported_type" };

  const normalizedType = anomalyType.toUpperCase().replace(/[^A-Z0-9_]/g, "");
  const queueType = normalizedType ? `ANOMALY_${normalizedType}` : "ANOMALY";

  const toastMeta = buildAnomalyToastMeta(anomalyType, payload);
  const scheduledFor = new Date(Date.now() + ANOMALY_APPROVAL_DELAY_MINUTES * 60 * 1000);

  const firstRecordId = auditEntries[0]?.recordId ?? null;
  if (firstRecordId != null) {
    try {
      await cancelPendingSimilarAnomalies(normalizedType, String(firstRecordId));
    } catch (e: any) {
      console.error("[AnomalyDebounce] Failed to cancel pending similar anomalies:", e.message);
    }
  }

  const result = await queueEmail({
    recipient: recipientEmails,
    subject: built.subject,
    body: built.html,
    type: queueType,
    scheduledFor,
    metadata: {
      anomalyType,
      payload,
      toastTitle: toastMeta.title,
      toastMessage: toastMeta.message,
      recipients: recipientNames ?? "Admin",
      recipientType: "Admin",
      allocatedBy,
      auditEntries: auditEntries.map((e) => ({
        tableName: e.tableName,
        recordId: e.recordId,
        newValues: e.newValues,
      })),
    },
  });

  return { queued: !!result?.id, queueId: result?.id ?? null };
}

// =============================================
// MAINTENANCE: TOMORROW REMINDER
// =============================================

export async function checkTomorrowReminder(): Promise<{
  sent: number; skipped?: boolean; reason?: string; error?: string;
}> {
  try {
    const settings = await getSystemSettings();
    if (settings.enableEmailNotifications !== "true" || settings.enableMaintenanceAlerts !== "true") {
      return { sent: 0, skipped: true, reason: "maintenance_alerts_disabled" };
    }

    const emailResumeDate = getEmailResumeDateCutoff(settings);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    const tomorrowEnd = new Date(tomorrowStart.getTime() + 86400000);

    // Find maintenance items scheduled for tomorrow
    const items = await prisma.maintenance.findMany({
      where: {
        isDeleted: false,
        status: "Scheduled",
        scheduledDate: { gte: tomorrowStart, lt: tomorrowEnd },
        ...(emailResumeDate ? { scheduledDate: { gte: emailResumeDate, lt: tomorrowEnd } } : {}),
        // Exclude already sent reminders today
        NOT: {
          notifications: {
            some: {
              status: { in: ["SENT", "SUPPRESSED"] },
              maintenanceEmailType: "REMINDER",
              sentAt: {
                gte: new Date(new Date().setHours(0, 0, 0, 0)),
                lt: new Date(new Date().setHours(23, 59, 59, 999)),
              },
            },
          },
        },
      },
      include: {
        asset: { include: { assetType: true } },
      },
    });

    if (items.length === 0) return { sent: 0 };

    // Resolve technician emails
    const records = await resolveTechnicianEmails(items);
    const { emails: managerEmails, isFallback } = await getOperationsManagerEmailsWithFallbackInfo();
    let totalSent = 0;
    const { techGroups, unassignedRecords } = getTechnicianGroups(records);

    // Unassigned → Manager
    if (unassignedRecords.length > 0 && managerEmails) {
      const byCategory = groupRecordsByCategory(unassignedRecords);
      for (const [catName, catRecords] of Object.entries(byCategory)) {
        const catEmails = await filterEmailsByCategory(managerEmails, catName);
        if (!catEmails) continue;
        const payload = buildMaintenanceReminderPayload(catRecords, catEmails, null);
        if (payload) {
          const label = isFallback ? "Admin" : "Operations Manager";
          await queueEmail({
            recipient: payload.to as string,
            cc: payload.cc ?? undefined,
            subject: payload.subject,
            body: payload.html,
            type: "MAINTENANCE_REMINDER",
            maintenanceEmailType: "REMINDER",
            recipientType: isFallback ? "Admin" : "Manager",
            recipientLabel: label,
            metadata: {
              emailType: "REMINDER",
              recipients: label,
              recipientType: isFallback ? "Admin" : "Manager",
              maintenanceIds: catRecords.map((r) => r.id),
            },
          });
          totalSent += catRecords.length;
        }
      }
    }

    // Technician groups
    for (const group of techGroups) {
      const byCategory = groupRecordsByCategory(group.records);
      for (const [, catRecords] of Object.entries(byCategory)) {
        const payload = buildMaintenanceReminderPayload(catRecords, group.technicianEmail, null);
        if (payload) {
          await queueEmail({
            recipient: payload.to as string,
            cc: payload.cc ?? undefined,
            subject: payload.subject,
            body: payload.html,
            type: "MAINTENANCE_REMINDER",
            maintenanceEmailType: "REMINDER",
            recipientType: "Technician",
            recipientLabel: group.technicianName ?? "Technician",
            metadata: {
              emailType: "REMINDER",
              recipients: group.technicianName ?? "Technician",
              recipientType: "Technician",
              maintenanceIds: catRecords.map((r) => r.id),
            },
          });
          totalSent += catRecords.length;
        }
      }
    }

    if (totalSent > 0) {
      await notifyAllAdmins({
        title: "Maintenance Reminder",
        message: `${totalSent} maintenance task(s) are scheduled for tomorrow.`,
        type: "MAINTENANCE",
        linkPath: records.length === 1 ? `/maintenance/${records[0].id}` : "/maintenance",
      }).catch(() => {});
    }

    return { sent: totalSent };
  } catch (err: any) {
    return { sent: 0, error: err.message };
  }
}

// =============================================
// MAINTENANCE: ACTION TODAY
// =============================================

export async function checkActionToday(): Promise<{
  sent: number; skipped?: boolean; reason?: string; error?: string;
}> {
  try {
    const settings = await getSystemSettings();
    if (settings.enableEmailNotifications !== "true" || settings.enableMaintenanceAlerts !== "true") {
      return { sent: 0, skipped: true, reason: "maintenance_alerts_disabled" };
    }

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const emailResumeDate = getEmailResumeDateCutoff(settings);

    const items = await prisma.maintenance.findMany({
      where: {
        isDeleted: false,
        status: "Scheduled",
        scheduledDate: { gte: todayStart, lt: todayEnd },
        ...(emailResumeDate ? { scheduledDate: { gte: emailResumeDate } } : {}),
        NOT: {
          notifications: {
            some: {
              status: { in: ["SENT", "SUPPRESSED"] },
              maintenanceEmailType: "ACTION_TODAY",
              sentAt: { gte: todayStart, lt: todayEnd },
            },
          },
        },
      },
      include: {
        asset: { include: { assetType: true } },
      },
    });

    if (items.length === 0) return { sent: 0 };

    const records = await resolveTechnicianEmails(items);
    const { emails: managerEmails, isFallback } = await getOperationsManagerEmailsWithFallbackInfo();
    let totalSent = 0;
    const { techGroups, unassignedRecords } = getTechnicianGroups(records);

    // Unassigned → Manager (no CC needed)
    if (unassignedRecords.length > 0 && managerEmails) {
      const byCategory = groupRecordsByCategory(unassignedRecords);
      for (const [catName, catRecords] of Object.entries(byCategory)) {
        const catEmails = await filterEmailsByCategory(managerEmails, catName);
        if (!catEmails) continue;
        const payload = buildMaintenanceActionTodayPayload(catRecords, catEmails, null);
        if (payload) {
          const label = isFallback ? "Admin" : "Operations Manager";
          await queueEmail({
            recipient: payload.to as string,
            cc: payload.cc ?? undefined,
            subject: payload.subject,
            body: payload.html,
            type: "MAINTENANCE_ACTION_TODAY",
            maintenanceEmailType: "ACTION_TODAY",
            recipientType: isFallback ? "Admin" : "Manager",
            recipientLabel: label,
            metadata: {
              emailType: "ACTION_TODAY",
              recipients: label,
              recipientType: isFallback ? "Admin" : "Manager",
              maintenanceIds: catRecords.map((r) => r.id),
            },
          });
          totalSent += catRecords.length;
        }
      }
    }

    // Technicians (CC manager for Action Today)
    for (const group of techGroups) {
      const byCategory = groupRecordsByCategory(group.records);
      for (const [catName, catRecords] of Object.entries(byCategory)) {
        const catManagerEmails = managerEmails
          ? await filterEmailsByCategory(managerEmails, catName)
          : "";
        const cc = buildCcList(group.technicianEmail, catManagerEmails);
        const hasCc = Boolean(cc);
        const payload = buildMaintenanceActionTodayPayload(catRecords, group.technicianEmail, cc);
        if (payload) {
          const label = hasCc ? `${group.technicianName} + Manager` : (group.technicianName ?? "Technician");
          await queueEmail({
            recipient: payload.to as string,
            cc: payload.cc ?? undefined,
            subject: payload.subject,
            body: payload.html,
            type: "MAINTENANCE_ACTION_TODAY",
            maintenanceEmailType: "ACTION_TODAY",
            recipientType: hasCc ? "Technician & Manager" : "Technician",
            recipientLabel: label,
            metadata: {
              emailType: "ACTION_TODAY",
              recipients: label,
              recipientType: hasCc ? "Technician & Manager" : "Technician",
              maintenanceIds: catRecords.map((r) => r.id),
            },
          });
          totalSent += catRecords.length;
        }
      }
    }

    if (totalSent > 0) {
      await notifyAllAdmins({
        title: "Action Required Today",
        message: `${totalSent} maintenance task(s) are scheduled for today.`,
        type: "MAINTENANCE",
        linkPath: records.length === 1 ? `/maintenance/${records[0].id}` : "/maintenance",
      }).catch(() => {});
    }

    return { sent: totalSent };
  } catch (err: any) {
    return { sent: 0, error: err.message };
  }
}

// =============================================
// MAINTENANCE: OVERDUE
// =============================================

export async function checkOverdueMaintenance(): Promise<{
  sent: number; skipped?: boolean; reason?: string; error?: string;
}> {
  try {
    const settings = await getSystemSettings();
    if (settings.enableEmailNotifications !== "true" || settings.enableMaintenanceAlerts !== "true") {
      return { sent: 0, skipped: true, reason: "maintenance_alerts_disabled" };
    }

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const emailResumeDate = getEmailResumeDateCutoff(settings);

    const items = await prisma.maintenance.findMany({
      where: {
        isDeleted: false,
        status: "Scheduled",
        scheduledDate: { lt: todayStart },
        ...(emailResumeDate ? { scheduledDate: { gte: emailResumeDate } } : {}),
        NOT: {
          notifications: {
            some: {
              status: { in: ["SENT", "SUPPRESSED"] },
              maintenanceEmailType: "OVERDUE",
              sentAt: { gte: todayStart },
            },
          },
        },
      },
      include: {
        asset: { include: { assetType: true } },
      },
    });

    if (items.length === 0) return { sent: 0 };

    const records = await resolveTechnicianEmails(items);
    const { emails: managerEmails, isFallback } = await getOperationsManagerEmailsWithFallbackInfo();
    let totalSent = 0;
    const { techGroups, unassignedRecords } = getTechnicianGroups(records);

    // Unassigned → Manager
    if (unassignedRecords.length > 0 && managerEmails) {
      const byCategory = groupRecordsByCategory(unassignedRecords);
      for (const [catName, catRecords] of Object.entries(byCategory)) {
        const catEmails = await filterEmailsByCategory(managerEmails, catName);
        if (!catEmails) continue;
        const payload = buildMaintenanceOverduePayload(catRecords, catEmails, null);
        if (payload) {
          const label = isFallback ? "Admin" : "Operations Manager";
          await queueEmail({
            recipient: payload.to as string,
            cc: payload.cc ?? undefined,
            subject: payload.subject,
            body: payload.html,
            type: "MAINTENANCE_OVERDUE",
            maintenanceEmailType: "OVERDUE",
            recipientType: isFallback ? "Admin" : "Manager",
            recipientLabel: label,
            metadata: {
              emailType: "OVERDUE",
              recipients: label,
              recipientType: isFallback ? "Admin" : "Manager",
              maintenanceIds: catRecords.map((r) => r.id),
            },
          });
          totalSent += catRecords.length;
        }
      }
    }

    // Technicians (always CC manager for overdue)
    for (const group of techGroups) {
      const byCategory = groupRecordsByCategory(group.records);
      for (const [catName, catRecords] of Object.entries(byCategory)) {
        const catManagerEmails = managerEmails
          ? await filterEmailsByCategory(managerEmails, catName)
          : "";
        const cc = buildCcList(group.technicianEmail, catManagerEmails);
        const hasCc = Boolean(cc);
        const payload = buildMaintenanceOverduePayload(catRecords, group.technicianEmail, cc);
        if (payload) {
          const label = hasCc ? `${group.technicianName} + Manager` : (group.technicianName ?? "Technician");
          await queueEmail({
            recipient: payload.to as string,
            cc: payload.cc ?? undefined,
            subject: payload.subject,
            body: payload.html,
            type: "MAINTENANCE_OVERDUE",
            maintenanceEmailType: "OVERDUE",
            recipientType: hasCc ? "Technician & Manager" : "Technician",
            recipientLabel: label,
            metadata: {
              emailType: "OVERDUE",
              recipients: label,
              recipientType: hasCc ? "Technician & Manager" : "Technician",
              maintenanceIds: catRecords.map((r) => r.id),
            },
          });
          totalSent += catRecords.length;
        }
      }
    }

    if (totalSent > 0) {
      await notifyAllAdmins({
        title: "Overdue Maintenance Alert",
        message: `${totalSent} maintenance task(s) have passed their scheduled date.`,
        type: "MAINTENANCE",
        linkPath: records.length === 1 ? `/maintenance/${records[0].id}` : "/maintenance",
      }).catch(() => {});
    }

    return { sent: totalSent };
  } catch (err: any) {
    return { sent: 0, error: err.message };
  }
}

// =============================================
// LICENSE EXPIRY NOTIFICATIONS
// =============================================

export async function checkLicenseExpiry(): Promise<{
  sent: number; skipped?: boolean; reason?: string; milestones?: any[]; error?: string;
}> {
  try {
    const settings = await getSystemSettings();
    if (settings.enableEmailNotifications !== "true" || settings.enableLicenseExpiryAlerts !== "true") {
      return { sent: 0, skipped: true, reason: "license_expiry_alerts_disabled" };
    }

    const { emails: managerEmails } = await getOperationsManagerEmailsWithFallbackInfo();
    if (!managerEmails) return { sent: 0, skipped: true, reason: "no_operations_manager_emails" };

    const adminList = await getAdminEmails();
    const emailResumeDate = getEmailResumeDateCutoff(settings);
    const isMonday = new Date().getDay() === 1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Load assets with license expiry
    const assets = await prisma.asset.findMany({
      where: {
        isDeleted: false,
        licenseExpiryDate: { not: null },
        status: { not: "Disposed" },
        ...(emailResumeDate ? { licenseExpiryDate: { gt: emailResumeDate } } : {}),
      },
      include: { assetType: true, bulkParent: true },
    });

    // Group by logical asset (bulk parent or individual)
    const groups: Record<string, {
      groupAssetId: number;
      assetCode: string;
      assetName: string;
      categoryName: string;
      licenseExpiryDate: Date;
      daysUntilExpiry: number;
      isBulkGroup: boolean;
      unitCount: number;
    }> = {};

    for (const asset of assets) {
      const groupId = asset.bulkOrderParentId ?? asset.id;
      const expiryDate = asset.licenseExpiryDate!;
      const daysUntil = Math.round((expiryDate.getTime() - today.getTime()) / 86400000);

      if (!groups[groupId] || expiryDate > groups[groupId].licenseExpiryDate) {
        groups[groupId] = {
          groupAssetId: groupId,
          assetCode: asset.bulkParent?.assetCode ?? asset.assetCode,
          assetName: asset.bulkParent?.assetName ?? asset.assetName,
          categoryName: asset.assetType.categoryName,
          licenseExpiryDate: expiryDate,
          daysUntilExpiry: daysUntil,
          isBulkGroup: !!asset.bulkOrderParentId,
          unitCount: 1,
        };
      } else if (groups[groupId]) {
        groups[groupId].unitCount++;
      }
    }

    // Filter to milestone assets only
    const milestoneGroups = Object.values(groups).filter((g) => {
      if (g.daysUntilExpiry < 0) return true; // EXPIRED
      if (g.daysUntilExpiry === 1) return true; // 1D
      if (g.daysUntilExpiry <= 30 && g.daysUntilExpiry > 1 && isMonday) return true; // WEEKLY
      return false;
    });

    // Dedup: exclude groups already emailed today (via AuditLog)
    const todayStr = today.toISOString().split("T")[0];
    const sentToday = await prisma.auditLog.findMany({
      where: {
        tableName: "LicenseExpiryEmail",
        action: "EMAIL_SENT",
        changedAt: { gte: today },
      },
      select: { recordId: true, newValues: true },
    });

    const sentSet = new Set(
      sentToday.map((l) => {
        try {
          const nv = JSON.parse(l.newValues ?? "{}");
          return `${l.recordId}::${nv.category}::${nv.licenseExpiryDateString}`;
        } catch { return ""; }
      }).filter(Boolean),
    );

    const pending = milestoneGroups.filter((g) => {
      const cat = g.daysUntilExpiry < 0 ? "EXPIRED" : g.daysUntilExpiry === 1 ? "1D" : "WEEKLY";
      const expiryStr = g.licenseExpiryDate.toISOString().split("T")[0];
      return !sentSet.has(`${g.groupAssetId}::${cat}::${expiryStr}`);
    });

    if (pending.length === 0) return { sent: 0, milestones: [] };

    let totalSent = 0;
    const milestoneResults: any[] = [];

    for (const milestone of ["WEEKLY", "1D", "EXPIRED"] as const) {
      const catRecords = pending
        .filter((g) => {
          if (milestone === "EXPIRED") return g.daysUntilExpiry < 0;
          if (milestone === "1D") return g.daysUntilExpiry === 1;
          return g.daysUntilExpiry <= 30 && g.daysUntilExpiry > 1;
        })
        .map((g) => ({
          ...g,
          assetName: g.isBulkGroup ? `${g.assetName} (${g.unitCount} units)` : g.assetName,
          licenseExpiryDateString: g.licenseExpiryDate.toISOString().split("T")[0],
          category: milestone,
        }));

      if (catRecords.length === 0) continue;

      const byCategory = groupRecordsByCategory(catRecords);
      for (const [assetCategory, assetCategoryRecords] of Object.entries(byCategory)) {
        const catManagerEmails = await filterEmailsByCategory(managerEmails, assetCategory);
        const catAdminEmails = await filterEmailsByCategory(adminList.join(","), assetCategory);

        // For 1D and EXPIRED, Admin is primary; for WEEKLY, Manager is primary
        const isPrioritized = milestone === "1D" || milestone === "EXPIRED";
        const primaryRecipient = isPrioritized ? (catAdminEmails || catManagerEmails) : catManagerEmails;
        const ccRecipient = isPrioritized ? catManagerEmails : null;
        const primaryName = isPrioritized ? "Admin" : "Operations Manager";
        const ccName = isPrioritized ? "Operations Manager" : null;
        const recipientLabel = ccName ? `${primaryName} + ${ccName}` : primaryName;

        const payload = buildLicenseExpiryReminderPayload(
          assetCategoryRecords,
          primaryRecipient,
          milestone,
          ccRecipient ?? undefined,
        );

        if (payload) {
          await queueEmail({
            recipient: payload.to as string,
            cc: (payload.cc as string | null | undefined) ?? undefined,
            subject: payload.subject,
            body: payload.html,
            type: "LICENSE_EXPIRY",
            metadata: {
              emailCategory: milestone,
              auditEntries: assetCategoryRecords.map((r) => ({
                tableName: "LicenseExpiryEmail",
                recordId: String(r.groupAssetId),
                action: "EMAIL_SENT",
                newValues: {
                  assetId: String(r.groupAssetId),
                  assetCode: r.assetCode,
                  assetName: r.assetName,
                  licenseExpiryDate: r.licenseExpiryDate,
                  licenseExpiryDateString: r.licenseExpiryDateString,
                  daysUntilExpiry: r.daysUntilExpiry,
                  category: milestone,
                  recipients: recipientLabel,
                  recipientType: ccName ? "Primary & CC" : "Primary",
                },
                changedBy: "System",
              })),
            },
          });
        }
      }

      // Bell notification per milestone
      const milestoneTitle =
        milestone === "EXPIRED" ? "License Expired" :
        milestone === "1D" ? "License Expiring Tomorrow" :
        "License Expiry Warning";
      const milestoneMsg =
        milestone === "EXPIRED" ? `${catRecords.length} software license(s) have expired.` :
        milestone === "1D" ? `${catRecords.length} software license(s) expire tomorrow.` :
        `${catRecords.length} software license(s) expire within 30 days.`;
      await notifyAllAdmins({
        title: milestoneTitle,
        message: milestoneMsg,
        type: "LICENSE",
        linkPath: catRecords.length === 1 ? `/assets/${catRecords[0].groupAssetId}` : "/assets",
      }).catch(() => {});

      totalSent += catRecords.length;
      milestoneResults.push({ milestone, sent: catRecords.length });
    }

    return { sent: totalSent, milestones: milestoneResults };
  } catch (err: any) {
    return { sent: 0, error: err.message };
  }
}

// =============================================
// LICENSE STATUS MAINTENANCE
// =============================================

export async function checkAndUpdateExpiredLicenseStatuses(): Promise<{
  updated: number; error?: string;
}> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiredAssets = await prisma.asset.findMany({
      where: {
        isDeleted: false,
        licenseExpiryDate: { not: null, lt: today },
        status: { in: ["Available", "Partially_Allocated"] },
      },
      include: { assetType: true },
    });

    if (expiredAssets.length === 0) return { updated: 0 };

    // Update statuses in bulk
    const ids = expiredAssets.map((a) => a.id);
    await prisma.asset.updateMany({
      where: { id: { in: ids }, status: { in: ["Available", "Partially_Allocated"] } },
      data: { status: "License_Expired", updatedAt: new Date() },
    });

    // Also update child assets of bulk parents
    const bulkParentIds = expiredAssets.filter((a) => a.isBulkOrder).map((a) => a.id);
    if (bulkParentIds.length > 0) {
      await prisma.asset.updateMany({
        where: {
          bulkOrderParentId: { in: bulkParentIds },
          isDeleted: false,
          status: { in: ["Available", "Partially_Allocated"] },
        },
        data: { status: "License_Expired", updatedAt: new Date() },
      });
    }

    // Write history + audit in chunks
    for (const chunk of chunkArray(expiredAssets)) {
      await prisma.$transaction(
        chunk.map((asset) =>
          prisma.assetHistory.create({
            data: {
              assetId: asset.id,
              actionType: "LICENSE_EXPIRED",
              performedBy: "System",
              notes: `License expired. Status changed from ${asset.status} to License Expired.`,
            },
          })
        )
      );

      for (const asset of chunk) {
        await writeAuditLog({
          tableName: "assets",
          recordId: String(asset.id),
          action: "UPDATE",
          oldValues: { status: asset.status, licenseExpiryDate: asset.licenseExpiryDate },
          newValues: { status: "License Expired", event: "LICENSE_EXPIRED", licenseExpiryDate: asset.licenseExpiryDate },
          changedBy: "System",
          additionalInfo: { source: "maintenanceNotifier" },
        });
      }
    }

    return { updated: expiredAssets.length };
  } catch (err: any) {
    return { updated: 0, error: err.message };
  }
}

export async function restoreExpiredLicenseStatus(
  assetId: number,
  changedBy = "System",
): Promise<{ restored: boolean; assetId?: number; status?: string; reason?: string; error?: string }> {
  try {
    const asset = await prisma.asset.findUnique({
      where: { id: assetId, isDeleted: false },
    });
    if (!asset) return { restored: false, reason: "not_found" };
    if (asset.status !== "License_Expired") return { restored: false, reason: "status_not_license_expired" };

    const now = new Date();
    const renewedExpiry = asset.licenseExpiryDate;
    const isPerpetual = asset.licenseType === "PERPETUAL";
    const isRenewed = isPerpetual || (renewedExpiry != null && renewedExpiry >= now);
    if (!isRenewed) return { restored: false, reason: "license_not_renewed" };

    const newStatus: AssetStatus =
      asset.allocatedQuantity >= asset.totalQuantity ? "Allocated" :
      asset.allocatedQuantity > 0 ? "Partially_Allocated" :
      "Available";

    await prisma.asset.update({
      where: { id: assetId },
      data: { status: newStatus, updatedAt: now },
    });

    // Restore child assets if this is a bulk parent
    if (asset.isBulkOrder) {
      await prisma.asset.updateMany({
        where: { bulkOrderParentId: assetId, isDeleted: false, status: "License_Expired" },
        data: { status: "Available", updatedAt: now },
      });
    }

    await prisma.assetHistory.create({
      data: {
        assetId,
        actionType: "LICENSE_RENEWED",
        performedBy: changedBy,
        notes: `License renewed. Status restored to ${newStatus.replace("_", " ")}.`,
      },
    });

    await writeAuditLog({
      tableName: "assets",
      recordId: String(assetId),
      action: "LICENSE_RENEWED",
      oldValues: { status: "License Expired", licenseExpiryDate: asset.licenseExpiryDate },
      newValues: { status: newStatus, event: "LICENSE_RENEWED", licenseExpiryDate: renewedExpiry },
      changedBy,
    });

    return { restored: true, assetId, status: newStatus.replace("_", " ") };
  } catch (err: any) {
    return { restored: false, error: err.message };
  }
}

// =============================================
// MASTER RUN
// =============================================

export async function runMaintenanceCheck(): Promise<{
  reminder: any;
  actionToday: any;
  overdue: any;
  license: any;
  licenseStatus: any;
}> {
  const [reminder, actionToday, overdue, license, licenseStatus] = await Promise.allSettled([
    checkTomorrowReminder(),
    checkActionToday(),
    checkOverdueMaintenance(),
    checkLicenseExpiry(),
    checkAndUpdateExpiredLicenseStatuses(),
  ]);

  return {
    reminder: reminder.status === "fulfilled" ? reminder.value : { error: (reminder as any).reason?.message },
    actionToday: actionToday.status === "fulfilled" ? actionToday.value : { error: (actionToday as any).reason?.message },
    overdue: overdue.status === "fulfilled" ? overdue.value : { error: (overdue as any).reason?.message },
    license: license.status === "fulfilled" ? license.value : { error: (license as any).reason?.message },
    licenseStatus: licenseStatus.status === "fulfilled" ? licenseStatus.value : { error: (licenseStatus as any).reason?.message },
  };
}

// =============================================
// INTERNAL: Resolve technician emails via DB
// =============================================

async function resolveTechnicianEmails(
  items: Array<{
    id: number;
    scheduledDate: Date;
    description: string;
    technician: string | null;
    isBulkGroupRecord: boolean;
    unitCount?: number | null;
    asset: {
      assetCode: string;
      assetName: string;
      assetType: { categoryName: string };
      bulkChildren?: Array<{ id: number }>;
    };
  }>
): Promise<MaintenanceRecord[]> {
  const techNames = [
    ...new Set(items.map((i) => i.technician).filter(Boolean) as string[]),
  ];
  const techUsers =
    techNames.length > 0
      ? await prisma.user.findMany({
          where: { fullName: { in: techNames }, isDeleted: false },
          select: { fullName: true, email: true },
        })
      : [];

  const techEmailMap = new Map(techUsers.map((u) => [u.fullName, u.email ?? null]));

  return items.map((item) => {
    const childCount = item.unitCount ?? 0;
    const isBulk = item.isBulkGroupRecord;
    const techName = item.technician ?? undefined;

    return {
      id: item.id,
      assetCode: item.asset.assetCode,
      assetName: isBulk
        ? `${item.asset.assetName} (${childCount} units)`
        : item.asset.assetName,
      categoryName: item.asset.assetType.categoryName,
      scheduledDate: item.scheduledDate,
      description: item.description,
      technician: techName,
      technicianEmail: techName ? (techEmailMap.get(techName) ?? null) : null,
      isBulkGroupRecord: isBulk,
      childUnitCount: childCount,
    };
  });
}
