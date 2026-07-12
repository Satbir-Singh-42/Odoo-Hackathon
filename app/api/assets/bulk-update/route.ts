import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError, parseBody, isParseError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { bulkUpdateAssets } from "@/lib/services/assetService";
import { z } from "zod";

export const runtime = "nodejs";

const bulkUpdateSchema = z.object({
  assetIds: z.array(z.number()),
  updates: z.record(z.string(), z.any()),
});

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_UPDATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  const bodyResult = await parseBody(req, bulkUpdateSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const result = await bulkUpdateAssets(
      bodyResult.data.assetIds,
      bodyResult.data.updates,
      session.user.employeeId
    );
    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}
