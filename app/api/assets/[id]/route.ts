/**
 * GET    /api/assets/:id  — get single asset
 * PUT    /api/assets/:id  — update asset
 * DELETE /api/assets/:id  — soft delete asset
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  isAuthError,
  parseBody,
  isParseError,
  ok,
  notFound,
  serverError,
  noContent,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import {
  getAssetById,
  updateAsset,
  deleteAsset,
} from "@/lib/services/assetService";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

const updateAssetSchema = z.object({
  assetName: z.string().min(1).max(150).optional(),
  assetTypeId: z.number().int().positive().optional(),
  invoiceNumber: z.string().max(50).optional(),
  invoiceDate: z.string().optional(),
  vendorId: z.string().max(20).optional(),
  purchasePrice: z.number().min(0).optional(),
  purchaseNumber: z.string().max(50).optional(),
  prNumber: z.string().max(50).optional(),
  model: z.string().max(50).optional(),
  ram: z.string().max(20).optional(),
  storage: z.string().max(20).optional(),
  processor: z.string().max(50).optional(),
  portCount: z.number().int().optional(),
  portSpeed: z.string().max(20).optional(),
  totalQuantity: z.number().int().min(1).optional(),
  licenseExpiryDate: z.string().optional(),
  licenseType: z
    .enum(["PERPETUAL", "SUBSCRIPTION", "SAAS", "TRIAL", "VOLUME", "ENTERPRISE"])
    .optional(),
  condition: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR"]).optional(),
});

// GET — single asset
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;

  try {
    const { id } = await params;
    const asset = await getAssetById(parseInt(id, 10));
    if (!asset) return notFound("Asset not found.");
    return ok(asset);
  } catch (err) {
    return serverError(err);
  }
}

// PUT — update asset
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_UPDATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const bodyResult = await parseBody(req, updateAssetSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const { id } = await params;
    const updated = await updateAsset(
      parseInt(id, 10),
      bodyResult.data,
      session.user.employeeId
    );
    
    revalidatePath("/assets");
    revalidatePath("/dashboard");

    return ok(updated);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return notFound(err.message);
    }
    return serverError(err);
  }
}

// DELETE — soft delete
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_DELETE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  try {
    const { id } = await params;
    await deleteAsset(parseInt(id, 10), session.user.employeeId);

    revalidatePath("/assets");
    revalidatePath("/dashboard");

    return noContent();
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return notFound(err.message);
    }
    return serverError(err);
  }
}
