/**
 * GET /api/sync/status
 * Returns the latest updatedAt timestamps for key data entities.
 * Used by the frontend's 30s background polling to detect changes
 * and only fetch the specific data that has changed.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ status: "error", message: "Authentication required." }, { status: 401 });
  }

  try {
    const [latestAsset, latestAllocation, latestMaintenance, latestHistory, latestUser] =
      await Promise.all([
        prisma.asset.findFirst({
          where: { isDeleted: false },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true },
        }),
        prisma.allocation.findFirst({
          where: { isDeleted: false },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        prisma.maintenance.findFirst({
          where: { isDeleted: false },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true },
        }),
        prisma.assetHistory.findFirst({
          orderBy: { actionDate: "desc" },
          select: { actionDate: true },
        }),
        prisma.user.findFirst({
          where: { isDeleted: false },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true },
        }),
      ]);

    return NextResponse.json({
      data: {
        assets: latestAsset?.updatedAt?.toISOString() ?? null,
        allocations: latestAllocation?.createdAt?.toISOString() ?? null,
        maintenance: latestMaintenance?.updatedAt?.toISOString() ?? null,
        history: latestHistory?.actionDate?.toISOString() ?? null,
        users: latestUser?.updatedAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    console.error("[sync/status]", err);
    return NextResponse.json({ status: "error", message: "Failed to get sync status." }, { status: 500 });
  }
}
