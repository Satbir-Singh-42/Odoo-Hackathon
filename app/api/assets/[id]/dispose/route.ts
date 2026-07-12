/**
 * POST /api/assets/:id/dispose — dispose of an asset
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, notFound, serverError,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { disposeAsset } from "@/lib/services/assetService";

export const runtime = "nodejs";

const disposeSchema = z.object({
  disposalReason: z.string().min(1).max(255),
  disposalDate: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_DISPOSE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const bodyResult = await parseBody(req, disposeSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const { id } = await params;
    await disposeAsset(
      { assetId: parseInt(id, 10), ...bodyResult.data },
      session.user.employeeId,
      session.user.fullName
    );
    return ok({ status: "success", message: "Asset disposed successfully." });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("not found")) return notFound(err.message);
    }
    return serverError(err);
  }
}
