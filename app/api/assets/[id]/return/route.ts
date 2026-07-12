/**
 * POST /api/assets/:id/return — return an allocated asset
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, notFound, serverError,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { returnAsset } from "@/lib/services/assetService";

export const runtime = "nodejs";

const returnSchema = z.object({
  employeeId: z.string().max(20).optional(),
  conditionAtReturn: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR"]).optional(),
  returnNotes: z.string().max(255).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_RETURN);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const bodyResult = await parseBody(req, returnSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const { id } = await params;
    await returnAsset(
      { assetId: parseInt(id, 10), ...bodyResult.data },
      session.user.employeeId,
      session.user.fullName
    );
    return ok({ status: "success", message: "Asset returned successfully." });
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return notFound(err.message);
    }
    return serverError(err);
  }
}
