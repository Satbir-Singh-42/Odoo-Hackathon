import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError, parseBody, isParseError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { bulkDisposeAssets } from "@/lib/services/assetService";
import { z } from "zod";

export const runtime = "nodejs";

const bulkDisposeSchema = z.object({
  assetIds: z.array(z.number()),
  reason: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_UPDATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  const bodyResult = await parseBody(req, bulkDisposeSchema);
  if (isParseError(bodyResult)) return bodyResult;
  try {
    const result = await bulkDisposeAssets(bodyResult.data.assetIds, session.user.employeeId, bodyResult.data.reason);
    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}
