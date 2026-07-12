/**
 * GET /api/asset-types/:categoryId — list asset types for a category
 */

import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;

  try {
    const { categoryId } = await params;
    const types = await prisma.assetType.findMany({
      where: {
        categoryName: {
          equals: decodeURIComponent(categoryId),
          mode: "insensitive",
        },
      },
      orderBy: { typeName: "asc" },
    });

    const formatted = types.map((item) => ({
      value: String(item.id),
      label: item.typeName,
      categoryName: item.categoryName,
    }));

    return ok({ data: formatted });
  } catch (err) {
    return serverError(err);
  }
}
