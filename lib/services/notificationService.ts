/**
 * Notification Service
 * In-app and email notification logic ported from:
 * - server/services/inappNotifier.js
 * - server/services/notificationQueue.js
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// =============================================
// IN-APP NOTIFICATIONS
// =============================================

export interface CreateInAppNotificationData {
  employeeId: string;
  title: string;
  message: string;
  type: string; // CONFIG_CHANGE | ALLOCATION | MAINTENANCE | ANOMALY
  linkPath?: string;
  assetId?: number;
}

export async function createInAppNotification(
  data: CreateInAppNotificationData
) {
  return prisma.inAppNotification.create({ data });
}

export async function notifyUser(
  employeeId: string,
  title: string,
  message: string,
  type: string,
  options?: { linkPath?: string; assetId?: number }
) {
  try {
    await createInAppNotification({
      employeeId,
      title,
      message,
      type,
      ...options,
    });
  } catch (err) {
    console.error("[InAppNotifier] Failed to create notification:", err);
  }
}

export async function getInAppNotifications(
  employeeId: string,
  params: { unreadOnly?: boolean; page?: number; pageSize?: number } = {}
) {
  const { unreadOnly = false, page = 1, pageSize = 30 } = params;

  const where: Prisma.InAppNotificationWhereInput = {
    employeeId,
    isDeleted: false,
    ...(unreadOnly ? { isRead: false } : {}),
  };

  const skip = (page - 1) * pageSize;
  const [notifications, total, unreadCount] = await Promise.all([
    prisma.inAppNotification.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.inAppNotification.count({ where }),
    prisma.inAppNotification.count({
      where: { employeeId, isDeleted: false, isRead: false },
    }),
  ]);

  return { notifications, total, unreadCount, page, pageSize };
}

export async function markNotificationsRead(
  employeeId: string,
  notificationIds?: number[]
) {
  const where: Prisma.InAppNotificationWhereInput = {
    employeeId,
    isDeleted: false,
    ...(notificationIds ? { id: { in: notificationIds } } : {}),
  };

  await prisma.inAppNotification.updateMany({
    where,
    data: { isRead: true },
  });
}

export async function deleteInAppNotification(
  id: number,
  employeeId: string
) {
  const existing = await prisma.inAppNotification.findFirst({
    where: { id, employeeId, isDeleted: false },
  });
  if (!existing) throw new Error("Notification not found.");

  await prisma.inAppNotification.update({
    where: { id },
    data: { isDeleted: true },
  });
}

export async function notifyTechnician(userName: string, options: { title: string; message: string; type: string; linkPath?: string; assetId?: number }) {
  if (!userName) return;
  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [{ fullName: userName }, { id: userName }],
        isDeleted: false,
      }
    });
    
    for (const u of users) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      
      const existing = await prisma.inAppNotification.findFirst({
        where: {
          employeeId: u.id,
          title: options.title,
          type: options.type,
          isDeleted: false,
          createdAt: { gte: startOfDay }
        }
      });
      if (!existing) {
        await createInAppNotification({
          employeeId: u.id,
          title: options.title,
          message: options.message,
          type: options.type,
          linkPath: options.linkPath,
          assetId: options.assetId
        });
      }
    }
  } catch (err) { console.error("[InAppNotifier] notifyTechnician error:", err); }
}

export async function notifyAllAdmins(options: { title: string; message: string; type: string; linkPath?: string; assetId?: number }) {
  try {
    const admins = await prisma.user.findMany({ where: { role: 'Admin', isDeleted: false } });
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    for (const a of admins) {
      const existing = await prisma.inAppNotification.findFirst({
        where: {
          employeeId: a.id,
          title: options.title,
          type: options.type,
          isDeleted: false,
          createdAt: { gte: startOfDay }
        }
      });
      if (!existing) {
        await createInAppNotification({
          employeeId: a.id,
          title: options.title,
          message: options.message,
          type: options.type,
          linkPath: options.linkPath,
          assetId: options.assetId
        });
      }
    }
  } catch (err) { console.error("[InAppNotifier] notifyAllAdmins error:", err); }
}

export async function notifyManagersOrAdminsFallback(options: {
  title: string;
  message: string;
  type: string;
  linkPath?: string;
  assetId?: number;
  actorEmployeeId?: string | null;
  excludeAdmins?: boolean;
}) {
  try {
    let recipients: string[] = [];
    let fellBackToAdmin = false;
    let actorRole: string | null = null;
    
    if (options.actorEmployeeId) {
      const actor = await prisma.user.findFirst({
        where: { id: options.actorEmployeeId, isDeleted: false }
      });
      actorRole = actor ? actor.role.toLowerCase() : null;
    }

    let categoryName: string | null = null;
    if (options.assetId) {
      const asset = await prisma.asset.findUnique({
        where: { id: options.assetId },
        include: { assetType: true }
      });
      categoryName = asset?.assetType?.categoryName || null;
    }

    const filterByCategory = (managedCategories?: string | null) => {
      if (!categoryName) return true;
      if (!managedCategories || managedCategories === 'ALL') return true;
      const categories = managedCategories.split(',').map(c => c.trim());
      return categories.includes('ALL') || categories.includes(categoryName);
    };

    if (actorRole === 'manager') {
      if (options.excludeAdmins) {
        recipients = [];
      } else {
        fellBackToAdmin = true;
        const admins = await prisma.user.findMany({ where: { role: 'Admin', isDeleted: false } });
        recipients = admins
          .filter(a => filterByCategory(a.managedCategories))
          .map(a => a.id)
          .filter(id => id !== options.actorEmployeeId);
      }
    } else if (actorRole === 'admin') {
      recipients = [];
    } else {
      const managers = await prisma.user.findMany({ where: { role: 'Manager', isDeleted: false } });
      recipients = managers
        .filter(m => filterByCategory(m.managedCategories))
        .map(m => m.id);
        
      if (recipients.length === 0 && !options.excludeAdmins) {
        fellBackToAdmin = true;
        const admins = await prisma.user.findMany({ where: { role: 'Admin', isDeleted: false } });
        recipients = admins
          .filter(a => filterByCategory(a.managedCategories))
          .map(a => a.id);
      }
    }

    if (recipients.length === 0) return { recipients: [], fellBackToAdmin: false };

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    for (const employeeId of recipients) {
      const existing = await prisma.inAppNotification.findFirst({
        where: {
          employeeId,
          title: options.title,
          type: options.type,
          isDeleted: false,
          createdAt: { gte: startOfDay }
        }
      });
      if (!existing) {
        await createInAppNotification({
          employeeId,
          title: options.title,
          message: options.message,
          type: options.type,
          linkPath: options.linkPath,
          assetId: options.assetId
        });
      }
    }
    
    return { recipients, fellBackToAdmin };
  } catch (err) {
    console.error("[InAppNotifier] notifyManagersOrAdminsFallback error:", err);
    return { recipients: [], fellBackToAdmin: false };
  }
}

export async function notifyAllocatedUsers(assetIds: number[], options: { title: string; message: string; type: string; linkPath?: string }) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) return;
  try {
    const allocations = await prisma.allocation.findMany({
      where: {
        assetId: { in: assetIds },
        status: 'ACTIVE',
        isDeleted: false
      },
      select: { employeeId: true },
      distinct: ['employeeId']
    });
    
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    for (const alloc of allocations) {
      if (!alloc.employeeId) continue;
      
      const existing = await prisma.inAppNotification.findFirst({
        where: {
          employeeId: alloc.employeeId,
          title: options.title,
          type: options.type,
          isDeleted: false,
          createdAt: { gte: startOfDay }
        }
      });
      if (!existing) {
        await createInAppNotification({
          employeeId: alloc.employeeId,
          title: options.title,
          message: options.message,
          type: options.type,
          linkPath: options.linkPath
        });
      }
    }
  } catch (err) {
    console.error("[InAppNotifier] notifyAllocatedUsers error:", err);
  }
}

// =============================================
// EMAIL NOTIFICATION QUEUE
// =============================================

export interface QueueEmailData {
  recipient: string;
  subject: string;
  body: string;
  type: string;
  cc?: string;
  metadata?: Record<string, unknown>;
  maintenanceId?: number;
  maintenanceEmailType?: string;
  recipientType?: string;
  recipientLabel?: string;
  scheduledFor?: Date;
}

export function isWithinActiveTimeWindow(settings: Record<string, string>): boolean {
  if (settings.enableActiveTimeWindow !== "true") return true;
  const startStr = settings.activeTimeStart || "08:00";
  const endStr = settings.activeTimeEnd || "18:00";

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = startStr.split(":").map(Number);
  const [endH, endM] = endStr.split(":").map(Number);
  
  const startMinutes = (startH || 0) * 60 + (startM || 0);
  const endMinutes = (endH || 0) * 60 + (endM || 0);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Overnight window (e.g. 22:00 to 06:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

export async function queueEmail(data: QueueEmailData) {
  const metadataStr = data.metadata ? JSON.stringify(data.metadata) : null;
  const scheduledAt = data.scheduledFor ?? new Date();
  const type = data.type;

  try {
    const auditEntries = data.metadata?.auditEntries as any[] | undefined;
    // Deduping for anomalies
    if (type.startsWith("ANOMALY") && auditEntries?.[0]) {
      const recordId = String(auditEntries[0].recordId);
      if (recordId && recordId !== "undefined") {
        const pendingItems = await prisma.notificationQueue.findMany({
          where: { status: "PENDING", type },
          orderBy: { createdAt: "desc" }
        });
        
        for (const item of pendingItems) {
          try {
            const meta = item.metadata ? JSON.parse(item.metadata) : {};
            if (String(meta.auditEntries?.[0]?.recordId) === recordId) {
              return await prisma.notificationQueue.update({
                where: { id: item.id },
                data: {
                  recipient: data.recipient,
                  subject: data.subject,
                  body: data.body,
                  cc: data.cc,
                  metadata: metadataStr,
                  scheduledFor: scheduledAt,
                  createdAt: new Date(),
                  errorMessage: null,
                  retryCount: 0,
                  maintenanceId: data.maintenanceId,
                  maintenanceEmailType: data.maintenanceEmailType,
                  recipientType: data.recipientType,
                  recipientLabel: data.recipientLabel
                }
              });
            }
          } catch(e) {}
        }
      }
    } 
    // Deduping for maintenance
    else if (type.startsWith("MAINTENANCE_") && data.metadata?.emailType) {
      const existing = await prisma.notificationQueue.findFirst({
        where: { status: "PENDING", type, recipient: data.recipient },
        orderBy: { createdAt: "desc" }
      });
      if (existing) {
        return await prisma.notificationQueue.update({
          where: { id: existing.id },
          data: {
            subject: data.subject,
            body: data.body,
            cc: data.cc,
            metadata: metadataStr,
            scheduledFor: scheduledAt,
            createdAt: new Date(),
            errorMessage: null,
            retryCount: 0,
            maintenanceId: data.maintenanceId,
            maintenanceEmailType: data.maintenanceEmailType,
            recipientType: data.recipientType,
            recipientLabel: data.recipientLabel
          }
        });
      }
    }
    // Deduping for license expiry
    else if (type === "LICENSE_EXPIRY" && data.metadata) {
      const emailCategory = data.metadata.emailCategory || auditEntries?.[0]?.newValues?.category || null;
      if (emailCategory) {
        const pendingItems = await prisma.notificationQueue.findMany({
          where: { status: "PENDING", type, recipient: data.recipient },
          orderBy: { createdAt: "desc" }
        });
        for (const item of pendingItems) {
          try {
            const meta = item.metadata ? JSON.parse(item.metadata) : {};
            const itemCat = meta.emailCategory || meta.auditEntries?.[0]?.newValues?.category || null;
            if (itemCat === emailCategory) {
              return await prisma.notificationQueue.update({
                where: { id: item.id },
                data: {
                  subject: data.subject,
                  body: data.body,
                  cc: data.cc,
                  metadata: metadataStr,
                  scheduledFor: scheduledAt,
                  createdAt: new Date(),
                  errorMessage: null,
                  retryCount: 0,
                  maintenanceId: data.maintenanceId,
                  maintenanceEmailType: data.maintenanceEmailType,
                  recipientType: data.recipientType,
                  recipientLabel: data.recipientLabel
                }
              });
            }
          } catch(e) {}
        }
      }
    }
  } catch (err) {
    console.warn("[NotificationQueue] Deduplication check failed, falling back to insert:", err);
  }

  return prisma.notificationQueue.create({
    data: {
      recipient: data.recipient,
      subject: data.subject,
      body: data.body,
      type: data.type,
      cc: data.cc,
      metadata: metadataStr,
      maintenanceId: data.maintenanceId,
      maintenanceEmailType: data.maintenanceEmailType,
      recipientType: data.recipientType,
      recipientLabel: data.recipientLabel,
      scheduledFor: scheduledAt,
      status: "PENDING",
    },
  });
}

export async function cancelPendingSimilarAnomalies(anomalyType: string, recordId: string | number, changedBy = "System") {
  if (!anomalyType || !recordId) return { cancelledCount: 0 };

  const normalizedType = String(anomalyType || "").toUpperCase().replace(/[^A-Z0-9_]/g, "");
  const queueType = normalizedType ? `ANOMALY_${normalizedType}` : "ANOMALY";

  const pendingItems = await prisma.notificationQueue.findMany({
    where: { status: "PENDING", type: queueType }
  });

  let cancelledCount = 0;
  for (const row of pendingItems) {
    try {
      const meta = row.metadata ? JSON.parse(row.metadata) : {};
      if (String(meta.auditEntries?.[0]?.recordId) === String(recordId)) {
        meta.mergedBy = changedBy;
        meta.mergedAt = new Date().toISOString();

        await prisma.notificationQueue.update({
          where: { id: row.id },
          data: {
            status: "SUPPRESSED",
            metadata: JSON.stringify(meta)
          }
        });
        cancelledCount++;
      }
    } catch (e) {}
  }
  return { cancelledCount };
}

export async function getPendingAnomalyApprovals(limit = 50, userRole = "Admin", userCategories: string[] = []) {
  const isGlobalAccess = userRole === "Admin" || userCategories.includes("ALL");

  const pendingItems = await prisma.notificationQueue.findMany({
    where: {
      status: "PENDING",
      type: { startsWith: "ANOMALY" }
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });

  let filteredRows = pendingItems;

  if (!isGlobalAccess) {
    if (userCategories.length === 0) return [];
    
    filteredRows = [];
    for (const row of pendingItems) {
      const metadata = row.metadata ? JSON.parse(row.metadata) : {};
      const anomalyType = String(metadata.anomalyType || "").toUpperCase();
      let categoryName: string | null = null;
      
      if (anomalyType === "HOARDER" || anomalyType === "SOFTWARE_DUPLICATE") {
         const typeName = metadata.payload?.assetType || metadata.payload?.softwareType || metadata.auditEntries?.[0]?.newValues?.assetType;
         if (typeName) {
           const typeRes = await prisma.assetType.findFirst({ where: { typeName } });
           categoryName = typeRes?.categoryName || null;
         }
      } else {
         const recordId = metadata.auditEntries?.[0]?.recordId;
         if (recordId && /^\\d+$/.test(String(recordId))) {
           const asset = await prisma.asset.findUnique({
             where: { id: Number(recordId) },
             include: { assetType: true }
           });
           categoryName = asset?.assetType?.categoryName || null;
         }
      }
      
      if (categoryName && userCategories.includes(categoryName)) {
         filteredRows.push(row);
      }
    }
  }

  return filteredRows.map((row) => {
    const metadata = row.metadata ? JSON.parse(row.metadata) : {};
    const anomalyType = metadata.anomalyType || null;

    const typeLabel = (() => {
      const t = String(anomalyType || "").toUpperCase();
      if (t === "HOARDER") return "Allocation Anomaly (Hoarder)";
      if (t === "LEMON") return "Maintenance Anomaly (Lemon Hardware)";
      if (t === "SOFTWARE_DUPLICATE") return "Software Duplicate Alert";
      if (t === "GHOST_ASSET") return "Ghost Asset Alert";
      return "Anomaly Alert";
    })();

    return {
      id: row.id,
      anomalyType,
      title: metadata.toastTitle || typeLabel,
      message: metadata.toastMessage || null,
      payload: metadata.payload || null,
      createdAt: row.createdAt,
      scheduledFor: row.scheduledFor,
      allocatedBy: metadata.allocatedBy || null,
    };
  });
}

export async function getPendingEmails(limit = 50) {
  return prisma.notificationQueue.findMany({
    where: {
      status: "PENDING",
      scheduledFor: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export async function markEmailSent(id: number) {
  await prisma.notificationQueue.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date() },
  });
}

export async function markEmailFailed(id: number, errorMessage: string) {
  await prisma.notificationQueue.update({
    where: { id },
    data: {
      status: "FAILED",
      errorMessage,
      retryCount: { increment: 1 },
    },
  });
}

export async function getNotificationQueue(params: {
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const { status, page = 1, pageSize = 50 } = params;
  const where: Prisma.NotificationQueueWhereInput = {};
  if (status) where.status = status as any;

  const skip = (page - 1) * pageSize;
  const [records, total] = await Promise.all([
    prisma.notificationQueue.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.notificationQueue.count({ where }),
  ]);

  return { records, total, page, pageSize };
}

// =============================================
// SYSTEM SETTINGS
// =============================================

export async function getSystemSettings(): Promise<Record<string, string>> {
  const settings = await prisma.systemSetting.findMany();
  return Object.fromEntries(settings.map((s) => [s.key, s.value ?? ""]));
}

export async function updateSystemSetting(key: string, value: string) {
  return prisma.systemSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function updateSystemSettings(
  updates: Record<string, string>
) {
  const ops = Object.entries(updates).map(([key, value]) =>
    prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    })
  );
  await prisma.$transaction(ops);
}
