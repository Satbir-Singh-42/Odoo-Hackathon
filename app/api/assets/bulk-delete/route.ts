import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError, parseBody, isParseError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { bulkDeleteAssets } from "@/lib/services/assetService";
import { z } from "zod";

export const runtime = "nodejs";

const bulkDeleteSchema = z.object({
  assetIds: z.array(z.number()),
});

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_DELETE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  const bodyResult = await parseBody(req, bulkDeleteSchema);
  if (isParseError(bodyResult)) return bodyResult;
  try {
    const result = await bulkDeleteAssets(bodyResult.data.assetIds, session.user.employeeId);
    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}
