/**
 * POST /api/assets/:id/allocate — allocate an asset to an employee or parent asset
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, notFound, serverError, conflict,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { allocateAsset } from "@/lib/services/assetService";

export const runtime = "nodejs";

const allocateSchema = z.object({
  employeeId: z.string().max(20).optional(),
  parentAssetId: z.number().int().positive().optional(),
  installationLocation: z.string().max(150).optional(),
  ipAddress: z.string().max(45).optional(),
  operatingSystem: z.string().max(50).optional(),
  conditionAtAllocation: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR"]).optional(),
  quantity: z.number().int().min(1).optional(),
}).refine(
  (d) => d.employeeId || d.parentAssetId || d.installationLocation,
  { message: "Must specify employeeId, parentAssetId, or installationLocation." }
);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_ALLOCATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const bodyResult = await parseBody(req, allocateSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const { id } = await params;
    const allocation = await allocateAsset(
      { assetId: parseInt(id, 10), ...bodyResult.data },
      session.user.employeeId,
      session.user.fullName
    );
    return ok(allocation, 201);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("not found")) return notFound(err.message);
      if (err.message.includes("already")) return conflict(err.message);
    }
    return serverError(err);
  }
}
