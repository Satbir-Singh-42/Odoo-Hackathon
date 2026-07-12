/**
 * Asset Service
 * Prisma-based business logic ported from server/routes/assets.js
 * Pure database functions — no HTTP concepts (no req/res).
 */

import { prisma } from "@/lib/prisma";
import { writeAuditLog, auditAsset } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

// =============================================
// TYPES
// =============================================

export interface AssetListParams {
  search?: string;
  status?: string;
  category?: string;
  type?: string;
  vendorId?: string;
  condition?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  isDeleted?: boolean;
  managedCategories?: string[]; // CBAC filter
}

export interface CreateAssetData {
  assetCode: string;
  assetName: string;
  assetTypeId: number;
  invoiceNumber?: string;
  invoiceDate?: string;
  vendorId?: string;
  purchasePrice?: number;
  purchaseNumber?: string;
  prNumber?: string;
  serialNumber?: string;
  model?: string;
  ram?: string;
  storage?: string;
  processor?: string;
  macAddress?: string;
  portCount?: number;
  portSpeed?: string;
  totalQuantity?: number;
  licenseExpiryDate?: string;
  licenseType?: string;
  condition?: string;
  isBulkOrder?: boolean;
}

export interface AllocateAssetData {
  assetId: number;
  employeeId?: string;
  parentAssetId?: number;
  installationLocation?: string;
  ipAddress?: string;
  operatingSystem?: string;
  conditionAtAllocation?: string;
  quantity?: number;
}

export interface ReturnAssetData {
  allocationId?: number;
  assetId: number;
  employeeId?: string;
  conditionAtReturn?: string;
  returnNotes?: string;
}

export interface DisposeAssetData {
  assetId: number;
  disposalReason: string;
  disposalDate?: string;
}

// =============================================
// HELPERS
// =============================================

/**
 * Resolve the ultimate employee owner of an asset by walking the
 * allocation chain (asset-to-asset allocations). Max depth: 10.
 */
export async function resolveChainEmployeeOwner(
  assetId: number
): Promise<{ employeeId: string | null; assetId: number | null }> {
  const visited = new Set<number>();
  let currentAssetId = assetId;
  let depth = 0;
  const MAX_DEPTH = 10;

  while (currentAssetId && depth < MAX_DEPTH) {
    if (visited.has(currentAssetId)) break;
    visited.add(currentAssetId);

    const alloc = await prisma.allocation.findFirst({
      where: {
        assetId: currentAssetId,
        status: "ACTIVE",
        isDeleted: false,
      },
      select: { employeeId: true, parentAssetId: true },
    });

    if (!alloc) break;

    if (alloc.employeeId) {
      return { employeeId: alloc.employeeId, assetId: currentAssetId };
    }

    if (!alloc.parentAssetId) break;
    currentAssetId = alloc.parentAssetId;
    depth++;
  }

  return { employeeId: null, assetId: null };
}

/**
 * Build a Prisma where clause that applies CBAC (Category-Based Access Control)
 * for Managers. If categories includes "ALL", no filter is applied.
 */
function buildCbacWhere(
  managedCategories: string[]
): Prisma.AssetWhereInput {
  if (!managedCategories || managedCategories.includes("ALL")) return {};
  return {
    assetType: { categoryName: { in: managedCategories } },
  };
}

// =============================================
// LIST ASSETS
// =============================================

export async function listAssets(params: AssetListParams) {
  const {
    search,
    status,
    category,
    type,
    vendorId,
    condition,
    page = 1,
    pageSize = 50,
    sortBy = "updatedAt",
    sortOrder = "desc",
    isDeleted = false,
    managedCategories = ["ALL"],
  } = params;

  const where: Prisma.AssetWhereInput = {
    isDeleted,
    ...buildCbacWhere(managedCategories),
  };

  if (search) {
    where.OR = [
      { assetCode: { contains: search, mode: "insensitive" } },
      { assetName: { contains: search, mode: "insensitive" } },
      { serialNumber: { contains: search, mode: "insensitive" } },
      { model: { contains: search, mode: "insensitive" } },
      { macAddress: { contains: search, mode: "insensitive" } },
    ];
  }

  if (status) where.status = status as any;
  if (category) where.assetType = { ...where.assetType as any, categoryName: category };
  if (type) where.assetType = { ...(where.assetType as any), typeName: type };
  if (vendorId) where.vendorId = vendorId;
  if (condition) where.condition = condition as any;

  const skip = (page - 1) * pageSize;

  const validSortFields: Record<string, boolean> = {
    assetCode: true, assetName: true, status: true,
    createdAt: true, updatedAt: true, purchasePrice: true,
  };

  const orderByField = validSortFields[sortBy] ? sortBy : "updatedAt";

  const [assets, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { [orderByField]: sortOrder },
      include: {
        assetType: { select: { categoryName: true, typeName: true } },
        vendor: { select: { vendorName: true } },
        allocations: {
          where: { status: "ACTIVE", isDeleted: false },
          take: 1,
          include: {
            employee: { select: { fullName: true, department: true } },
          },
        },
      },
    }),
    prisma.asset.count({ where }),
  ]);

  return {
    assets,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// =============================================
// GET ASSET BY ID
// =============================================

export async function getAssetById(id: number) {
  return prisma.asset.findFirst({
    where: { id, isDeleted: false },
    include: {
      assetType: true,
      vendor: true,
      allocations: {
        where: { isDeleted: false },
        orderBy: { allocationDate: "desc" },
        include: {
          employee: { select: { id: true, fullName: true, department: true, email: true } },
        },
      },
      maintenance: {
        where: { isDeleted: false },
        orderBy: { scheduledDate: "desc" },
        take: 5,
      },
      history: {
        orderBy: { actionDate: "desc" },
        take: 20,
      },
      documents: true,
    },
  });
}

// =============================================
// CREATE ASSET
// =============================================

export async function createAsset(
  data: CreateAssetData,
  performedBy: string
) {
  // Check for duplicate asset code
  const existing = await prisma.asset.findUnique({
    where: { assetCode: data.assetCode },
  });
  if (existing) {
    throw new Error(`Asset code "${data.assetCode}" already exists.`);
  }

  // Check for duplicate serial number
  if (data.serialNumber) {
    const dupSerial = await prisma.asset.findFirst({
      where: { serialNumber: data.serialNumber, isDeleted: false },
    });
    if (dupSerial) {
      throw new Error(
        `Serial number "${data.serialNumber}" is already registered to asset ${dupSerial.assetCode}.`
      );
    }
  }

  // Check for duplicate MAC address
  if (data.macAddress) {
    const dupMac = await prisma.asset.findFirst({
      where: { macAddress: data.macAddress, isDeleted: false },
    });
    if (dupMac) {
      throw new Error(
        `MAC address "${data.macAddress}" is already registered to asset ${dupMac.assetCode}.`
      );
    }
  }

  const asset = await prisma.asset.create({
    data: {
      assetCode: data.assetCode,
      assetName: data.assetName,
      assetTypeId: data.assetTypeId,
      invoiceNumber: data.invoiceNumber,
      invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : null,
      vendorId: data.vendorId,
      purchasePrice: data.purchasePrice ?? 0,
      purchaseNumber: data.purchaseNumber,
      prNumber: data.prNumber,
      serialNumber: data.serialNumber,
      model: data.model,
      ram: data.ram,
      storage: data.storage,
      processor: data.processor,
      macAddress: data.macAddress,
      portCount: data.portCount,
      portSpeed: data.portSpeed,
      totalQuantity: data.totalQuantity ?? 1,
      licenseExpiryDate: data.licenseExpiryDate
        ? new Date(data.licenseExpiryDate)
        : null,
      licenseType: data.licenseType as any,
      condition: data.condition as any,
      isBulkOrder: data.isBulkOrder ?? false,
      status: "Available",
    },
    include: { assetType: true, vendor: true },
  });

  // Asset history
  await prisma.assetHistory.create({
    data: {
      assetId: asset.id,
      actionType: "CREATION",
      performedBy,
      notes: `Asset created: ${asset.assetCode}`,
    },
  });

  await auditAsset("ASSET_INSERT", asset.id, performedBy, {
    newValues: { assetCode: asset.assetCode, assetName: asset.assetName },
  });

  return asset;
}

// =============================================
// UPDATE ASSET
// =============================================

export async function updateAsset(
  id: number,
  data: Partial<CreateAssetData>,
  performedBy: string
) {
  const existing = await prisma.asset.findFirst({
    where: { id, isDeleted: false },
  });
  if (!existing) throw new Error("Asset not found.");

  const updated = await prisma.asset.update({
    where: { id },
    data: {
      assetName: data.assetName,
      assetTypeId: data.assetTypeId,
      invoiceNumber: data.invoiceNumber,
      invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : undefined,
      vendorId: data.vendorId,
      purchasePrice: data.purchasePrice,
      purchaseNumber: data.purchaseNumber,
      prNumber: data.prNumber,
      model: data.model,
      ram: data.ram,
      storage: data.storage,
      processor: data.processor,
      portCount: data.portCount,
      portSpeed: data.portSpeed,
      totalQuantity: data.totalQuantity,
      licenseExpiryDate: data.licenseExpiryDate
        ? new Date(data.licenseExpiryDate)
        : undefined,
      licenseType: data.licenseType as any,
      condition: data.condition as any,
    },
    include: { assetType: true, vendor: true },
  });

  await prisma.assetHistory.create({
    data: {
      assetId: id,
      actionType: "UPDATE",
      performedBy,
      notes: `Asset updated: ${existing.assetCode}`,
    },
  });

  await auditAsset("UPDATE", id, performedBy, {
    oldValues: { assetName: existing.assetName },
    newValues: { assetName: updated.assetName },
  });

  return updated;
}

// =============================================
// DELETE ASSET (soft)
// =============================================

export async function deleteAsset(id: number, performedBy: string) {
  const existing = await prisma.asset.findFirst({
    where: { id, isDeleted: false },
  });
  if (!existing) throw new Error("Asset not found.");

  // Cannot delete if actively allocated
  const activeAllocation = await prisma.allocation.findFirst({
    where: { assetId: id, status: "ACTIVE", isDeleted: false },
  });
  if (activeAllocation) {
    throw new Error(
      "Cannot delete an asset that is currently allocated. Return it first."
    );
  }

  await prisma.asset.update({
    where: { id },
    data: { isDeleted: true },
  });

  await prisma.assetHistory.create({
    data: {
      assetId: id,
      actionType: "DELETION",
      performedBy,
      notes: `Asset soft-deleted: ${existing.assetCode}`,
    },
  });

  await auditAsset("DELETE", id, performedBy, {
    oldValues: { assetCode: existing.assetCode, status: existing.status },
  });
}

// =============================================
// ALLOCATE ASSET
// =============================================

export async function allocateAsset(
  data: AllocateAssetData,
  performedBy: string,
  performedByName: string
) {
  const asset = await prisma.asset.findFirst({
    where: { id: data.assetId, isDeleted: false },
    include: { assetType: true },
  });
  if (!asset) throw new Error("Asset not found.");

  if (
    asset.status === "Disposed" ||
    asset.status === "Under_Maintenance"
  ) {
    throw new Error(`Cannot allocate an asset with status "${asset.status}".`);
  }

  if (asset.allocatedQuantity >= asset.totalQuantity) {
    throw new Error("All units of this asset are already allocated.");
  }

  // Check for duplicate active allocation to same target
  const existingAlloc = await prisma.allocation.findFirst({
    where: {
      assetId: data.assetId,
      status: "ACTIVE",
      isDeleted: false,
      ...(data.employeeId ? { employeeId: data.employeeId } : {}),
      ...(data.parentAssetId ? { parentAssetId: data.parentAssetId } : {}),
    },
  });
  if (existingAlloc) {
    throw new Error(
      "This asset is already actively allocated to the specified target."
    );
  }

  const newAllocatedQty = asset.allocatedQuantity + (data.quantity ?? 1);
  const newStatus =
    newAllocatedQty >= asset.totalQuantity ? "Allocated" : "Partially_Allocated";

  const [allocation] = await prisma.$transaction([
    prisma.allocation.create({
      data: {
        assetId: data.assetId,
        employeeId: data.employeeId,
        parentAssetId: data.parentAssetId,
        installationLocation: data.installationLocation,
        ipAddress: data.ipAddress,
        operatingSystem: data.operatingSystem,
        conditionAtAllocation: (data.conditionAtAllocation as any) ?? "GOOD",
        assignedBy: performedByName,
        status: "ACTIVE",
      },
    }),
    prisma.asset.update({
      where: { id: data.assetId },
      data: {
        allocatedQuantity: newAllocatedQty,
        status: newStatus as any,
      },
    }),
  ]);

  await prisma.assetHistory.create({
    data: {
      assetId: data.assetId,
      employeeId: data.employeeId,
      actionType: "ALLOCATION",
      performedBy: performedByName,
      notes: data.installationLocation
        ? `Allocated to location: ${data.installationLocation}`
        : data.parentAssetId
        ? `Allocated to parent asset #${data.parentAssetId}`
        : `Allocated to employee: ${data.employeeId}`,
      parentAssetId: data.parentAssetId,
    },
  });

  await auditAsset("ALLOCATE", data.assetId, performedBy, {
    newValues: {
      employeeId: data.employeeId,
      parentAssetId: data.parentAssetId,
      status: newStatus,
    },
  });

  return allocation;
}

// =============================================
// RETURN ASSET
// =============================================

export async function returnAsset(
  data: ReturnAssetData,
  performedBy: string,
  performedByName: string
) {
  const asset = await prisma.asset.findFirst({
    where: { id: data.assetId, isDeleted: false },
  });
  if (!asset) throw new Error("Asset not found.");

  const allocation = await prisma.allocation.findFirst({
    where: {
      assetId: data.assetId,
      status: "ACTIVE",
      isDeleted: false,
      ...(data.employeeId ? { employeeId: data.employeeId } : {}),
    },
    orderBy: { allocationDate: "desc" },
  });

  if (!allocation) {
    throw new Error("No active allocation found for this asset.");
  }

  const newAllocatedQty = Math.max(0, asset.allocatedQuantity - 1);
  const newStatus =
    newAllocatedQty === 0 ? "Available" : "Partially_Allocated";

  await prisma.$transaction([
    prisma.allocation.update({
      where: { id: allocation.id },
      data: {
        status: "RETURNED",
        returnDate: new Date(),
        conditionAtReturn: (data.conditionAtReturn as any) ?? null,
        returnNotes: data.returnNotes,
        returnedBy: performedByName,
      },
    }),
    prisma.asset.update({
      where: { id: data.assetId },
      data: {
        allocatedQuantity: newAllocatedQty,
        status: newStatus as any,
        ...(data.conditionAtReturn
          ? { condition: data.conditionAtReturn as any }
          : {}),
      },
    }),
  ]);

  await prisma.assetHistory.create({
    data: {
      assetId: data.assetId,
      employeeId: allocation.employeeId,
      actionType: "RETURN",
      performedBy: performedByName,
      condition: data.conditionAtReturn,
      notes: data.returnNotes ?? `Returned by ${performedByName}`,
    },
  });

  await auditAsset("RETURN", data.assetId, performedBy, {
    newValues: { status: newStatus, conditionAtReturn: data.conditionAtReturn },
  });
}

// =============================================
// DISPOSE ASSET
// =============================================

export async function disposeAsset(
  data: DisposeAssetData,
  performedBy: string,
  performedByName: string
) {
  const asset = await prisma.asset.findFirst({
    where: { id: data.assetId, isDeleted: false },
  });
  if (!asset) throw new Error("Asset not found.");

  if (asset.status === "Disposed") {
    throw new Error("Asset is already disposed.");
  }

  // Return all active allocations first
  const activeAllocs = await prisma.allocation.findMany({
    where: { assetId: data.assetId, status: "ACTIVE", isDeleted: false },
  });

  if (activeAllocs.length > 0) {
    await prisma.allocation.updateMany({
      where: { assetId: data.assetId, status: "ACTIVE", isDeleted: false },
      data: { status: "REVOKED", returnDate: new Date(), returnedBy: performedByName },
    });
  }

  await prisma.asset.update({
    where: { id: data.assetId },
    data: {
      status: "Disposed",
      allocatedQuantity: 0,
      disposalDate: data.disposalDate ? new Date(data.disposalDate) : new Date(),
      disposalReason: data.disposalReason,
    },
  });

  await prisma.assetHistory.create({
    data: {
      assetId: data.assetId,
      actionType: "DISPOSAL",
      performedBy: performedByName,
      notes: `Disposed: ${data.disposalReason}`,
    },
  });

  await auditAsset("DISPOSE", data.assetId, performedBy, {
    oldValues: { status: asset.status },
    newValues: { status: "Disposed", disposalReason: data.disposalReason },
  });
}

// =============================================
// ASSET HISTORY
// =============================================

export async function getAssetHistory(assetId: number, page = 1, pageSize = 50) {
  const skip = (page - 1) * pageSize;
  const [history, total] = await Promise.all([
    prisma.assetHistory.findMany({
      where: { assetId },
      orderBy: { actionDate: "desc" },
      skip,
      take: pageSize,
      include: {
        employee: { select: { fullName: true, department: true } },
        parentAsset: { select: { assetCode: true, assetName: true } },
      },
    }),
    prisma.assetHistory.count({ where: { assetId } }),
  ]);
  return { history, total, page, pageSize };
}

// =============================================
// DASHBOARD STATS
// =============================================

export async function getDashboardStats() {
  const [
    totalAssets,
    availableAssets,
    allocatedAssets,
    underMaintenance,
    disposed,
    recentActivity,
    upcomingMaintenance,
  ] = await Promise.all([
    prisma.asset.count({ where: { isDeleted: false } }),
    prisma.asset.count({ where: { isDeleted: false, status: "Available" } }),
    prisma.asset.count({ where: { isDeleted: false, status: "Allocated" } }),
    prisma.asset.count({ where: { isDeleted: false, status: "Under_Maintenance" } }),
    prisma.asset.count({ where: { isDeleted: false, status: "Disposed" } }),
    prisma.assetHistory.findMany({
      orderBy: { actionDate: "desc" },
      take: 10,
      include: {
        asset: { select: { assetCode: true, assetName: true } },
        employee: { select: { fullName: true } },
      },
    }),
    prisma.maintenance.findMany({
      where: {
        isDeleted: false,
        status: { in: ["Scheduled", "In_Progress"] },
        scheduledDate: { gte: new Date() },
      },
      orderBy: { scheduledDate: "asc" },
      take: 5,
      include: { asset: { select: { assetCode: true, assetName: true } } },
    }),
  ]);

  return {
    totalAssets,
    availableAssets,
    allocatedAssets,
    underMaintenance,
    disposed,
    utilizationRate:
      totalAssets > 0
        ? Math.round((allocatedAssets / totalAssets) * 100)
        : 0,
    recentActivity,
    upcomingMaintenance,
  };
}

// =============================================
// BULK ASSET OPERATIONS
// =============================================

export async function bulkImportAssets(
  assets: Array<Record<string, any>>,
  performedBy: string
) {
  let createdCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  const assetTypes = await prisma.assetType.findMany();
  const typeMap = new Map<string, number>();
  assetTypes.forEach(t => {
    typeMap.set(t.typeName.toLowerCase(), t.id);
    typeMap.set(String(t.id), t.id);
  });

  for (const row of assets) {
    try {
      const assetCode = String(row.assetCode || row["Asset Code"] || "").trim();
      const assetName = String(row.assetName || row["Asset Name"] || "").trim();
      const typeInput = String(row.assetTypeId || row["Type"] || row["Asset Type"] || "").trim();

      if (!assetCode || !assetName || !typeInput) {
        errors.push(`Missing Asset Code, Asset Name, or Type for row: ${assetCode || assetName || "unknown"}`);
        skippedCount++;
        continue;
      }

      const assetTypeId = typeMap.get(typeInput.toLowerCase()) || Number(typeInput);
      if (!assetTypeId || isNaN(assetTypeId)) {
        errors.push(`Invalid Asset Type "${typeInput}" for asset "${assetCode}"`);
        skippedCount++;
        continue;
      }

      const existing = await prisma.asset.findUnique({ where: { assetCode } });
      if (existing) {
        errors.push(`Asset code "${assetCode}" already exists.`);
        skippedCount++;
        continue;
      }

      await createAsset({
        assetCode,
        assetName,
        assetTypeId,
        vendorId: row.vendorId || row["Vendor Code"] || row["Vendor ID"] || undefined,
        serialNumber: row.serialNumber || row["Serial Number"] || undefined,
        model: row.model || row["Model"] || undefined,
        purchasePrice: Number(row.purchasePrice || row["Purchase Price"] || 0),
        totalQuantity: Number(row.totalQuantity || row["Quantity"] || 1),
      } as CreateAssetData, performedBy);
      createdCount++;
    } catch (err: any) {
      errors.push(`Failed to import "${row.assetCode || 'unknown'}": ${err.message}`);
      skippedCount++;
    }
  }

  return { created: createdCount, unitsCreated: createdCount, skipped: skippedCount, errors };
}

export async function bulkDisposeAssets(
  assetIds: number[],
  performedBy: string,
  reason?: string
) {
  let disposedCount = 0;
  const errors: string[] = [];
  for (const id of assetIds) {
    try {
      await prisma.asset.update({
        where: { id },
        data: { status: "Disposed" },
      });
      await prisma.assetHistory.create({
        data: {
          assetId: id,
          actionType: "DISPOSE",
          performedBy,
          notes: reason ? `Bulk disposed: ${reason}` : "Bulk disposed",
        },
      });
      disposedCount++;
    } catch (err: any) {
      errors.push(`Failed to dispose asset ID ${id}: ${err.message}`);
    }
  }
  return { disposedCount, errors };
}

export async function bulkDeleteAssets(
  assetIds: number[],
  performedBy: string
) {
  let deletedCount = 0;
  const errors: string[] = [];
  for (const id of assetIds) {
    try {
      await deleteAsset(id, performedBy);
      deletedCount++;
    } catch (err: any) {
      errors.push(`Failed to delete asset ID ${id}: ${err.message}`);
    }
  }
  return { deletedCount, errors };
}

export async function bulkUpdateAssets(
  assetIds: number[],
  updates: Record<string, any>,
  performedBy: string
) {
  let updatedCount = 0;
  const errors: string[] = [];

  for (const id of assetIds) {
    try {
      await updateAsset(id, updates, performedBy);
      updatedCount++;
    } catch (err: any) {
      errors.push(`Failed to update asset ID ${id}: ${err.message}`);
    }
  }
  return { updatedCount, errors };
}

export async function bulkAllocateAssets(
  allocations: AllocateAssetData[],
  performedBy: string,
  performedByName: string
) {
  const results = [];
  const errors: string[] = [];
  for (const alloc of allocations) {
    try {
      const result = await allocateAsset(alloc, performedBy, performedByName);
      results.push(result);
    } catch (err: any) {
      errors.push(`Failed to allocate asset ID ${alloc.assetId}: ${err.message}`);
    }
  }
  return { allocations: results, errors };
}

export async function bulkReturnAssets(
  returns: ReturnAssetData[],
  performedBy: string,
  performedByName: string
) {
  let returnedCount = 0;
  const errors: string[] = [];
  for (const ret of returns) {
    try {
      await returnAsset(ret, performedBy, performedByName);
      returnedCount++;
    } catch (err: any) {
      errors.push(`Failed to return asset ID ${ret.assetId || 'unknown'}: ${err.message}`);
    }
  }
  return { returnedCount, errors };
}

export async function addUnitsToParent(
  parentId: number,
  count: number,
  performedBy: string,
  unitPrice?: number
) {
  const parent = await getAssetById(parentId);
  if (!parent) throw new Error("Parent asset not found");
  if (!parent.isBulkOrder) throw new Error("Asset is not a bulk order parent");

  const childIds: number[] = [];
  for (let i = 0; i < count; i++) {
    const nextUnitIndex = parent.totalQuantity + i + 1;
    const childAssetCode = `${parent.assetCode}-${nextUnitIndex}`;

    const child = await prisma.asset.create({
      data: {
        assetCode: childAssetCode,
        assetName: `${parent.assetName} - Unit ${nextUnitIndex}`,
        assetTypeId: parent.assetTypeId,
        vendorId: parent.vendorId,
        purchasePrice: unitPrice ?? parent.purchasePrice,
        status: "Available",
        totalQuantity: 1,
        bulkOrderParentId: parent.id,
        bulkOrderIndex: nextUnitIndex,
      },
    });

    await prisma.assetHistory.create({
      data: {
        assetId: child.id,
        actionType: "CREATE",
        performedBy,
        notes: `Bulk child unit ${nextUnitIndex} created for ${parent.assetCode}`,
      },
    });

    childIds.push(child.id);
  }

  // Update parent quantity
  await prisma.asset.update({
    where: { id: parentId },
    data: { totalQuantity: parent.totalQuantity + count },
  });

  await prisma.assetHistory.create({
    data: {
      assetId: parentId,
      actionType: "UPDATE",
      performedBy,
      notes: `Added ${count} units. Total quantity is now ${parent.totalQuantity + count}`,
    },
  });

  return { childIds, newTotal: parent.totalQuantity + count };
}
