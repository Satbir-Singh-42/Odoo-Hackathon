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

export async function queueEmail(data: QueueEmailData) {
  return prisma.notificationQueue.create({
    data: {
      recipient: data.recipient,
      subject: data.subject,
      body: data.body,
      type: data.type,
      cc: data.cc,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      maintenanceId: data.maintenanceId,
      maintenanceEmailType: data.maintenanceEmailType,
      recipientType: data.recipientType,
      recipientLabel: data.recipientLabel,
      scheduledFor: data.scheduledFor ?? new Date(),
      status: "PENDING",
    },
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
