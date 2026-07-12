import { revalidatePath } from "next/cache";
/**
 * POST /api/assets/dispose — dispose of an asset
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, notFound, serverError, badRequest,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { disposeAsset } from "@/lib/services/assetService";

export const runtime = "nodejs";

const disposeSchema = z.object({
  assetId: z.union([z.number(), z.string()]),
  disposalDate: z.string().optional().nullable(),
  disposalReason: z.string().optional().nullable(),
  disposalMethod: z.string().optional().nullable(),
  disposalNotes: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_DISPOSE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const bodyResult = await parseBody(req, disposeSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const rawAssetId = bodyResult.data.assetId;
    const numericAssetId = typeof rawAssetId === "number" ? rawAssetId : parseInt(rawAssetId, 10);
    if (Number.isNaN(numericAssetId)) {
      return badRequest("Invalid assetId");
    }

    await disposeAsset(
      {
        assetId: numericAssetId,
        disposalDate: bodyResult.data.disposalDate || new Date().toISOString(),
        disposalReason: bodyResult.data.disposalReason || "END_OF_LIFE",
      },
      session.user.employeeId,
      session.user.fullName
    );
    revalidatePath("/assets");
    revalidatePath("/dashboard");
    revalidatePath("/allocations");
    return ok({ success: true, assetId: numericAssetId });
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return notFound(err.message);
    }
    return serverError(err);
  }
}
