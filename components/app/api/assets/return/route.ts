/**
 * POST /api/assets/return — return an allocated asset
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, notFound, serverError, badRequest,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { returnAsset } from "@/lib/services/assetService";

export const runtime = "nodejs";

const returnSchema = z.object({
  assetId: z.union([z.number(), z.string()]),
  returnDate: z.string().optional().nullable(),
  returnNotes: z.string().optional().nullable(),
  conditionAtReturn: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"]).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_RETURN);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const bodyResult = await parseBody(req, returnSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const rawAssetId = bodyResult.data.assetId;
    const numericAssetId = typeof rawAssetId === "number" ? rawAssetId : parseInt(rawAssetId, 10);
    if (Number.isNaN(numericAssetId)) {
      return badRequest("Invalid assetId");
    }

    await returnAsset(
      {
        assetId: numericAssetId,
        returnNotes: bodyResult.data.returnNotes || undefined,
        conditionAtReturn: (bodyResult.data.conditionAtReturn as any) || "GOOD",
      },
      session.user.employeeId,
      session.user.fullName
    );
    return ok({ success: true, assetId: numericAssetId });
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return notFound(err.message);
    }
    return serverError(err);
  }
}
