import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError, parseBody, isParseError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { bulkImportAssets } from "@/lib/services/assetService";
import { z } from "zod";

export const runtime = "nodejs";

const bulkImportSchema = z.object({
  assets: z.array(z.record(z.string(), z.any())),
});

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_CREATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  const bodyResult = await parseBody(req, bulkImportSchema);
  if (isParseError(bodyResult)) return bodyResult;
  try {
    const result = await bulkImportAssets(bodyResult.data.assets, session.user.employeeId);
    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}
