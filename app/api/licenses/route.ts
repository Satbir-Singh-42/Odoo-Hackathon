/**
 * GET /api/licenses — list license allocations and unit allocations (paginated/filtered)
 */

import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;

  try {
    const { searchParams } = new URL(req.url);
    const assetId = searchParams.get("assetId");
    const limitParam = searchParams.get("limit");
    const status = searchParams.get("status");

    const where: Prisma.AllocationWhereInput = {
      isDeleted: false,
    };

    if (assetId) {
      const parsedAssetId = Number(assetId);
      if (!Number.isNaN(parsedAssetId)) {
        where.assetId = parsedAssetId;
      }
    }

    if (status) {
      where.status = status as any;
    }

    const take = limitParam ? Number(limitParam) : 10000;

    const allocations = await prisma.allocation.findMany({
      where,
      orderBy: { allocationDate: "desc" },
      take: Number.isNaN(take) ? 10000 : take,
      include: {
        asset: {
          select: {
            id: true,
            assetCode: true,
            assetName: true,
            licenseType: true,
            licenseExpiryDate: true,
            assetType: {
              select: {
                categoryName: true,
                typeName: true,
              },
            },
          },
        },
        employee: {
          select: {
            id: true,
            fullName: true,
            department: true,
            email: true,
          },
        },
        parentAsset: {
          select: {
            id: true,
            assetCode: true,
            assetName: true,
          },
        },
      },
    });

    const formatted = allocations.map((alloc) => ({
      id: String(alloc.id),
      assetId: String(alloc.assetId),
      employeeId: alloc.employeeId || null,
      parentAssetId: alloc.parentAssetId ? Number(alloc.parentAssetId) : null,
      allocationDate: alloc.allocationDate.toISOString(),
      returnDate: alloc.returnDate ? alloc.returnDate.toISOString() : null,
      installationLocation: alloc.installationLocation || null,
      ipAddress: alloc.ipAddress || null,
      operatingSystem: alloc.operatingSystem || null,
      conditionAtAllocation: alloc.conditionAtAllocation,
      conditionAtReturn: alloc.conditionAtReturn || null,
      status: alloc.status,
      returnNotes: alloc.returnNotes || null,
      assignedBy: alloc.assignedBy || null,
      returnedBy: alloc.returnedBy || null,
      createdAt: alloc.createdAt.toISOString(),
      asset: alloc.asset ? {
        id: String(alloc.asset.id),
        assetCode: alloc.asset.assetCode,
        assetName: alloc.asset.assetName,
        categoryName: alloc.asset.assetType?.categoryName || "Software Licenses",
        licenseType: alloc.asset.licenseType || null,
        licenseExpiryDate: alloc.asset.licenseExpiryDate ? alloc.asset.licenseExpiryDate.toISOString() : null,
      } : null,
      employee: alloc.employee ? {
        id: alloc.employee.id,
        fullName: alloc.employee.fullName,
        department: alloc.employee.department,
        email: alloc.employee.email,
      } : null,
      parentAsset: alloc.parentAsset ? {
        id: String(alloc.parentAsset.id),
        assetCode: alloc.parentAsset.assetCode,
        assetName: alloc.parentAsset.assetName,
      } : null,
    }));

    return ok({ data: formatted, total: formatted.length });
  } catch (err) {
    return serverError(err);
  }
}
