import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError, parseBody, isParseError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { createAsset } from "@/lib/services/assetService";
import { z } from "zod";

export const runtime = "nodejs";

const createBulkAssetSchema = z.object({
  assetCode: z.string().min(1),
  assetName: z.string().min(1),
  assetTypeId: z.number().int().positive(),
  totalQuantity: z.number().int().min(1).optional(),
}).passthrough();

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_CREATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  const bodyResult = await parseBody(req, createBulkAssetSchema);
  if (isParseError(bodyResult)) return bodyResult;
  try {
    const asset = await createAsset({
      ...bodyResult.data,
      isBulkOrder: true,
    } as any, session.user.employeeId);
    return ok({ parentId: asset.id, data: asset });
  } catch (err) {
    return serverError(err);
  }
}
