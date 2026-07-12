/**
 * POST /api/assets/allocate-license — allocate a software license to an employee or asset
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, notFound, serverError, conflict, badRequest,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { allocateAsset } from "@/lib/services/assetService";

export const runtime = "nodejs";

const allocateSchema = z.object({
  assetId: z.union([z.number(), z.string()]),
  employeeId: z.string().max(20).optional().nullable(),
  parentAssetId: z.union([z.number(), z.string()]).optional().nullable(),
  installationLocation: z.string().max(150).optional().nullable(),
  ipAddress: z.string().max(45).optional().nullable(),
  operatingSystem: z.string().max(50).optional().nullable(),
  condition: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR"]).optional().nullable(),
  quantity: z.number().int().min(1).optional().nullable(),
  licenseCount: z.number().int().min(1).optional().nullable(),
  notes: z.string().optional().nullable(),
  targetUnitId: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  macAddress: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_ALLOCATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const bodyResult = await parseBody(req, allocateSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const rawAssetId = bodyResult.data.assetId;
    const numericAssetId = typeof rawAssetId === "number" ? rawAssetId : parseInt(rawAssetId, 10);
    if (Number.isNaN(numericAssetId)) {
      return badRequest("Invalid assetId");
    }

    let numericParentId: number | undefined;
    if (bodyResult.data.parentAssetId != null) {
      numericParentId = typeof bodyResult.data.parentAssetId === "number"
        ? bodyResult.data.parentAssetId
        : parseInt(bodyResult.data.parentAssetId, 10);
      if (Number.isNaN(numericParentId)) numericParentId = undefined;
    }

    const allocation = await allocateAsset(
      {
        assetId: numericAssetId,
        employeeId: bodyResult.data.employeeId || undefined,
        parentAssetId: numericParentId,
        installationLocation: bodyResult.data.installationLocation || undefined,
        ipAddress: bodyResult.data.ipAddress || undefined,
        operatingSystem: bodyResult.data.operatingSystem || undefined,
        conditionAtAllocation: (bodyResult.data.condition as any) || "GOOD",
        quantity: bodyResult.data.quantity || bodyResult.data.licenseCount || 1,
      },
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
