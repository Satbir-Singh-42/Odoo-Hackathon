/**
 * GET /api/categories — list distinct asset categories
 */

import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;

  try {
    const distinct = await prisma.assetType.findMany({
      distinct: ["categoryName"],
      select: { categoryName: true },
      orderBy: { categoryName: "asc" },
    });

    const categories = distinct.map((item) => ({
      id: item.categoryName,
      name: item.categoryName,
    }));

    return ok({ data: categories });
  } catch (err) {
    return serverError(err);
  }
}
