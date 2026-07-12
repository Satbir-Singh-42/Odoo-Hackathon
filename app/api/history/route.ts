/**
 * GET /api/history — get business history logs for assets
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

    const where: Prisma.AssetHistoryWhereInput = {};
    if (assetId) {
      const parsed = Number(assetId);
      if (!Number.isNaN(parsed)) where.assetId = parsed;
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
        employee: { select: { fullName: true, department: true } },
        parentAsset: { select: { assetCode: true, assetName: true } },
      },
    });

    const formatted = history.map((item) => ({
      id: item.id,
      assetId: item.assetId,
      employeeId: item.employeeId || null,
      actionType: item.actionType,
      actionDate: item.actionDate.toISOString(),
      performedBy: item.performedBy || null,
      notes: item.notes || null,
      condition: item.condition || null,
      parentAssetId: item.parentAssetId || null,
      parentAssetName: item.parentAssetName || item.parentAsset?.assetName || null,
      employeeName: item.employee?.fullName || item.employeeId || null,
    }));

    return ok({ data: formatted });
  } catch (err) {
    return serverError(err);
  }
}
