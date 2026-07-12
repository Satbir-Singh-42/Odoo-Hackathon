/**
 * Vendor Service
 * Prisma-based business logic ported from server/routes/other-routes.js (vendor section)
 */

import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

export interface VendorListParams {
  search?: string;
  isBlocked?: boolean;
  isDeleted?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateVendorData {
  id: string; // VendorID e.g. "VND001"
  vendorName: string;
}

// =============================================
// LIST VENDORS
// =============================================

export async function listVendors(params: VendorListParams = {}) {
  const {
    search,
    isBlocked,
    isDeleted = false,
    page = 1,
    pageSize = 100,
  } = params;

  const where: Prisma.VendorWhereInput = { isDeleted };
  if (isBlocked !== undefined) where.isBlocked = isBlocked;

  if (search) {
    where.OR = [
      { id: { contains: search, mode: "insensitive" } },
      { vendorName: { contains: search, mode: "insensitive" } },
    ];
  }

  const skip = (page - 1) * pageSize;
  const [vendors, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { vendorName: "asc" },
    }),
    prisma.vendor.count({ where }),
  ]);

  return { vendors, total, page, pageSize };
}

// =============================================
// CREATE VENDOR
// =============================================

export async function createVendor(data: CreateVendorData, performedBy: string) {
  const existing = await prisma.vendor.findUnique({ where: { id: data.id } });
  if (existing) throw new Error(`Vendor ID "${data.id}" already exists.`);

  const vendor = await prisma.vendor.create({ data });

  await writeAuditLog({
    tableName: "vendors",
    recordId: vendor.id,
    action: "INSERT",
    changedBy: performedBy,
    newValues: { vendorName: vendor.vendorName },
  });

  return vendor;
}

// =============================================
// UPDATE VENDOR
// =============================================

export async function updateVendor(
  id: string,
  data: Partial<CreateVendorData> & { isBlocked?: boolean },
  performedBy: string
) {
  const existing = await prisma.vendor.findFirst({
    where: { id, isDeleted: false },
  });
  if (!existing) throw new Error("Vendor not found.");

  const updated = await prisma.vendor.update({
    where: { id },
    data: {
      vendorName: data.vendorName,
      isBlocked: data.isBlocked,
    },
  });

  await writeAuditLog({
    tableName: "vendors",
    recordId: id,
    action: "UPDATE",
    changedBy: performedBy,
    oldValues: { vendorName: existing.vendorName },
    newValues: { vendorName: updated.vendorName },
  });

  return updated;
}

// =============================================
// DELETE VENDOR (soft)
// =============================================

export async function deleteVendor(id: string, performedBy: string) {
  const existing = await prisma.vendor.findFirst({
    where: { id, isDeleted: false },
  });
  if (!existing) throw new Error("Vendor not found.");

  const usedByAssets = await prisma.asset.count({
    where: { vendorId: id, isDeleted: false },
  });
  if (usedByAssets > 0) {
    throw new Error(
      `Cannot delete vendor used by ${usedByAssets} asset(s).`
    );
  }

  await prisma.vendor.update({
    where: { id },
    data: { isDeleted: true },
  });

  await writeAuditLog({
    tableName: "vendors",
    recordId: id,
    action: "DELETE",
    changedBy: performedBy,
    oldValues: { vendorName: existing.vendorName },
  });
}

// =============================================
// TOGGLE VENDOR BLOCK
// =============================================

export async function toggleVendorBlock(id: string, performedBy: string) {
  const existing = await prisma.vendor.findFirst({
    where: { id, isDeleted: false },
  });
  if (!existing) throw new Error("Vendor not found.");

  const newBlocked = !existing.isBlocked;
  const updated = await prisma.vendor.update({
    where: { id },
    data: { isBlocked: newBlocked },
  });

  await writeAuditLog({
    tableName: "vendors",
    recordId: id,
    action: "UPDATE",
    changedBy: performedBy,
    oldValues: { isBlocked: existing.isBlocked },
    newValues: { isBlocked: newBlocked },
  });

  return { isBlocked: newBlocked, vendor: updated };
}

// =============================================
// BULK CREATE VENDORS
// =============================================

export async function bulkCreateVendors(
  vendors: Array<{ vendorId?: string; id?: string; vendorName: string }>,
  performedBy: string
) {
  let createdCount = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const v of vendors) {
    const id = (v.id || v.vendorId)?.trim();
    const vendorName = v.vendorName?.trim();
    if (!id || !vendorName) {
      errors.push(`Missing ID or Name for vendor "${vendorName || id}"`);
      skipped++;
      continue;
    }
    try {
      const existing = await prisma.vendor.findUnique({ where: { id } });
      if (existing) {
        skipped++;
        continue;
      }
      await prisma.vendor.create({
        data: { id, vendorName },
      });
      await writeAuditLog({
        tableName: "vendors",
        recordId: id,
        action: "INSERT",
        changedBy: performedBy,
        newValues: { vendorName },
      });
      createdCount++;
    } catch (err: any) {
      errors.push(`Failed to import "${id}": ${err.message}`);
      skipped++;
    }
  }

  return { created: createdCount, skipped, errors };
}
