/**
 * GET /api/history — get business history logs for assets
 * Returns the full AssetHistory shape including joined asset, employee, and parent data.
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
    const employeeId = searchParams.get("employeeId");
    const limitParam = searchParams.get("limit");
    const includeChain = searchParams.get("includeChain") === "true";

    const where: Prisma.AssetHistoryWhereInput = {};
    if (assetId) {
      const parsed = Number(assetId);
      if (!Number.isNaN(parsed)) {
        if (includeChain) {
          // Include records for the asset itself and any child units
          const childAssets = await prisma.asset.findMany({
            where: { bulkOrderParentId: parsed, isDeleted: false },
            select: { id: true },
          });
          const childIds = childAssets.map((a) => a.id);
          where.assetId = { in: [parsed, ...childIds] };
        } else {
          where.assetId = parsed;
        }
      }
    }
    if (employeeId) {
      where.employeeId = employeeId;
    }

    const take = limitParam ? Number(limitParam) : 200;

    const history = await prisma.assetHistory.findMany({
      where,
      orderBy: { actionDate: "desc" },
      take: Number.isNaN(take) ? 200 : take,
      include: {
        asset: {
          select: {
            assetCode: true,
            assetName: true,
            assetType: { select: { categoryName: true, typeName: true } },
          },
        },
        employee: { select: { fullName: true, department: true } },
        parentAsset: { select: { assetCode: true, assetName: true } },
      },
    });

    const formatted = history.map((item) => ({
      // Core IDs
      id: String(item.id),
      assetId: String(item.assetId),

      // Joined asset fields (what the AssetHistory interface requires)
      assetCode: item.asset?.assetCode ?? "",
      assetName: item.asset?.assetName ?? "",
      category: item.asset?.assetType?.categoryName ?? "",

      // Employee/user info
      employeeId: item.employeeId ?? null,
      userName: item.employee?.fullName ?? null,
      department: item.employee?.department ?? null,

      // Dates — map actionDate → assignedDate for the frontend interface
      assignedDate: item.actionDate.toISOString(),
      returnedDate: null,
      durationDays: null,
      status: "Active" as const,

      // Action details
      actionType: item.actionType ?? null,
      performedBy: item.performedBy ?? null,
      assignedBy: item.performedBy ?? "",
      returnedBy: null,
      changedBy: item.performedBy ?? null,
      notes: item.notes ?? null,
      changeDescription: item.notes ?? null,
      condition: item.condition ?? null,

      // Parent asset (for chain allocations)
      parentAssetId: item.parentAssetId ?? null,
      parentAssetName: item.parentAssetName ?? item.parentAsset?.assetName ?? null,
      parentAssetCode: item.parentAsset?.assetCode ?? null,

      // Denormalised employee name for backwards compat
      employeeName: item.employee?.fullName ?? item.employeeId ?? null,
    }));

    return ok({ data: formatted });
  } catch (err) {
    return serverError(err);
  }
}
