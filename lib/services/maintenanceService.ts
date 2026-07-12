/**
 * Maintenance Service
 * Prisma-based business logic ported from server/routes/maintenance.js
 */

import { prisma } from "@/lib/prisma";
import { auditAsset, writeAuditLog } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

// =============================================
// TYPES
// =============================================

export interface MaintenanceListParams {
  search?: string;
  status?: string;
  assetId?: number;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  managedCategories?: string[];
}

export interface CreateMaintenanceData {
  assetId: number;
  scheduledDate: string;
  description: string;
  notes?: string;
  technician?: string;
  cost?: number;
  frequency?: string;
  status?: string;
}

export interface UpdateMaintenanceData {
  scheduledDate?: string;
  description?: string;
  notes?: string;
  technician?: string;
  cost?: number;
  frequency?: string;
  status?: string;
  completedDate?: string;
}

// =============================================
// LIST MAINTENANCE RECORDS
// =============================================

export async function listMaintenance(params: MaintenanceListParams) {
  const {
    search,
    status,
    assetId,
    page = 1,
    pageSize = 50,
    sortBy = "updatedAt",
    sortOrder = "desc",
    managedCategories = ["ALL"],
  } = params;

  const where: Prisma.MaintenanceWhereInput = {
    isDeleted: false,
  };

  if (assetId) where.assetId = assetId;
  if (status) where.status = status as any;

  if (search) {
    where.OR = [
      { description: { contains: search, mode: "insensitive" } },
      { technician: { contains: search, mode: "insensitive" } },
      { asset: { assetCode: { contains: search, mode: "insensitive" } } },
      { asset: { assetName: { contains: search, mode: "insensitive" } } },
    ];
  }

  // CBAC filter — Managers can only see their assigned categories
  if (!managedCategories.includes("ALL")) {
    where.asset = {
      assetType: { categoryName: { in: managedCategories } },
    };
  }

  const skip = (page - 1) * pageSize;
  const validSortFields: Record<string, boolean> = {
    scheduledDate: true,
    completedDate: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    cost: true,
  };
  const orderByField = validSortFields[sortBy] ? sortBy : "updatedAt";

  const [records, total] = await Promise.all([
    prisma.maintenance.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { [orderByField]: sortOrder },
      include: {
        asset: {
          select: {
            assetCode: true,
            assetName: true,
            assetType: { select: { categoryName: true, typeName: true } },
          },
        },
        reporter: { select: { fullName: true } },
      },
    }),
    prisma.maintenance.count({ where }),
  ]);

  return {
    records,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// =============================================
// GET MAINTENANCE BY ID
// =============================================

export async function getMaintenanceById(id: number) {
  return prisma.maintenance.findFirst({
    where: { id, isDeleted: false },
    include: {
      asset: {
        include: {
          assetType: true,
          vendor: true,
        },
      },
      reporter: { select: { fullName: true, email: true } },
    },
  });
}

// =============================================
// CREATE MAINTENANCE
// =============================================

export async function createMaintenance(
  data: CreateMaintenanceData,
  performedBy: string,
  performedByName: string
) {
  const asset = await prisma.asset.findFirst({
    where: { id: data.assetId, isDeleted: false },
  });
  if (!asset) throw new Error("Asset not found.");

  const status = (data.status as any) ?? "Scheduled";

  const record = await prisma.maintenance.create({
    data: {
      assetId: data.assetId,
      scheduledDate: new Date(data.scheduledDate),
      description: data.description,
      notes: data.notes,
      technician: data.technician,
      cost: data.cost ?? 0,
      frequency: data.frequency as any,
      status,
      reportedBy: performedBy,
    },
    include: {
      asset: { select: { assetCode: true, assetName: true } },
    },
  });

  // Update asset status to Under Maintenance if not already
  if (
    status === "Scheduled" &&
    asset.status !== "Under_Maintenance"
  ) {
    await prisma.asset.update({
      where: { id: data.assetId },
      data: { status: "Under_Maintenance" },
    });
  }

  await prisma.assetHistory.create({
    data: {
      assetId: data.assetId,
      actionType: "MAINTENANCE_SCHEDULE",
      performedBy: performedByName,
      notes: `Maintenance scheduled: ${data.description}`,
    },
  });

  await writeAuditLog({
    tableName: "maintenance",
    recordId: record.id,
    action: "MAINTENANCE_SCHEDULE",
    changedBy: performedBy,
    newValues: { description: data.description, scheduledDate: data.scheduledDate },
  });

  return record;
}

// =============================================
// UPDATE MAINTENANCE
// =============================================

export async function updateMaintenance(
  id: number,
  data: UpdateMaintenanceData,
  performedBy: string,
  performedByName: string
) {
  const existing = await prisma.maintenance.findFirst({
    where: { id, isDeleted: false },
    include: { asset: true },
  });
  if (!existing) throw new Error("Maintenance record not found.");

  const oldStatus = existing.status;
  const newStatus = (data.status as any) ?? oldStatus;

  const updated = await prisma.maintenance.update({
    where: { id },
    data: {
      scheduledDate: data.scheduledDate
        ? new Date(data.scheduledDate)
        : undefined,
      description: data.description,
      notes: data.notes,
      technician: data.technician,
      cost: data.cost,
      frequency: data.frequency as any,
      status: newStatus,
      completedDate: data.completedDate
        ? new Date(data.completedDate)
        : undefined,
    },
    include: {
      asset: { select: { assetCode: true, assetName: true } },
    },
  });

  // Handle asset status transitions based on maintenance status changes
  if (oldStatus !== newStatus) {
    let assetAction: string | null = null;
    let newAssetStatus: string | null = null;

    if (newStatus === "In_Progress") {
      assetAction = "MAINTENANCE_START";
    } else if (newStatus === "Completed" || newStatus === "Cancelled") {
      assetAction = newStatus === "Completed" ? "MAINTENANCE_END" : "MAINTENANCE_CANCEL";
      // Restore asset to Available when maintenance ends
      const activeAlloc = await prisma.allocation.findFirst({
        where: { assetId: existing.assetId, status: "ACTIVE", isDeleted: false },
      });
      newAssetStatus = activeAlloc ? "Allocated" : "Available";
    }

    if (newAssetStatus) {
      await prisma.asset.update({
        where: { id: existing.assetId },
        data: { status: newAssetStatus as any },
      });
    }

    if (assetAction) {
      await prisma.assetHistory.create({
        data: {
          assetId: existing.assetId,
          actionType: assetAction,
          performedBy: performedByName,
          notes: `Maintenance status: ${oldStatus} → ${newStatus}`,
        },
      });
    }
  }

  await writeAuditLog({
    tableName: "maintenance",
    recordId: id,
    action: "MAINTENANCE_UPDATE",
    changedBy: performedBy,
    oldValues: { status: oldStatus },
    newValues: { status: newStatus },
  });

  return updated;
}

// =============================================
// DELETE MAINTENANCE (soft)
// =============================================

export async function deleteMaintenance(id: number, performedBy: string) {
  const existing = await prisma.maintenance.findFirst({
    where: { id, isDeleted: false },
  });
  if (!existing) throw new Error("Maintenance record not found.");

  await prisma.maintenance.update({
    where: { id },
    data: { isDeleted: true },
  });

  await writeAuditLog({
    tableName: "maintenance",
    recordId: id,
    action: "DELETE",
    changedBy: performedBy,
  });
}

// =============================================
// UPCOMING MAINTENANCE (for notifications)
// =============================================

export async function getUpcomingMaintenance(daysAhead = 7) {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + daysAhead);

  return prisma.maintenance.findMany({
    where: {
      isDeleted: false,
      status: "Scheduled",
      scheduledDate: { gte: now, lte: future },
    },
    include: {
      asset: {
        select: {
          assetCode: true,
          assetName: true,
          assetType: { select: { categoryName: true } },
        },
      },
      reporter: { select: { fullName: true, email: true } },
    },
    orderBy: { scheduledDate: "asc" },
  });
}

export async function createBulkMaintenance(
  data: CreateMaintenanceData & { bulkParentId: number; skipAssetIds?: number[] },
  performedBy: string,
  performedByName: string
) {
  const parent = await prisma.asset.findUnique({
    where: { id: data.bulkParentId },
    include: { bulkChildren: true },
  });

  if (!parent) throw new Error("Bulk parent asset not found");
  if (!parent.isBulkOrder) throw new Error("Asset is not a bulk order parent");

  const skipSet = new Set(data.skipAssetIds || []);
  const assetsToMaintain = parent.bulkChildren.filter(c => !skipSet.has(c.id));

  // Also include the parent itself if it's not skipped
  if (!skipSet.has(parent.id)) {
    assetsToMaintain.unshift(parent as any);
  }

  if (assetsToMaintain.length === 0) {
    throw new Error("No valid assets selected for bulk maintenance");
  }

  const results = [];
  const errors: string[] = [];

  for (const asset of assetsToMaintain) {
    try {
      const result = await createMaintenance(
        { ...data, assetId: asset.id },
        performedBy,
        performedByName
      );
      results.push(result);
    } catch (err: any) {
      errors.push(`Failed to create maintenance for asset ID ${asset.id}: ${err.message}`);
    }
  }

  // We return the maintenance record of the parent (or first item) as a representative, 
  // with a message indicating how many were created vs skipped.
  const mainRecord = results.find(r => r.assetId === parent.id) || results[0];
  
  if (!mainRecord) {
    throw new Error(`Bulk maintenance failed: ${errors.join(', ')}`);
  }

  return {
    ...mainRecord,
    message: `Created maintenance for ${results.length} units. ${errors.length ? `${errors.length} failed.` : ''} ${skipSet.size > 0 ? `${skipSet.size} skipped.` : ''}`,
  };
}

export async function reportTroubleshootIssue(
  assetId: number,
  reason: string,
  reportedBy: string
) {
  // First, check if the asset exists
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new Error("Asset not found");

  // Create a pending maintenance record or log the issue
  const result = await prisma.maintenance.create({
    data: {
      assetId,
      scheduledDate: new Date(),
      status: "Scheduled",
      description: "Troubleshooting Issue Reported",
      notes: reason,
      reportedBy,
    },
    include: {
      asset: {
        select: {
          assetCode: true,
          assetName: true,
          assetType: { select: { categoryName: true } },
        },
      },
      reporter: { select: { fullName: true, email: true } },
    },
  });

  // Log in asset history
  await prisma.assetHistory.create({
    data: {
      assetId,
      actionType: "UPDATE",
      performedBy: reportedBy,
      notes: `Troubleshoot reported: ${reason}`,
    },
  });

  return result;
}
