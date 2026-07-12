import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError, parseBody, isParseError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { reportTroubleshootIssue } from "@/lib/services/maintenanceService";
import { z } from "zod";

export const runtime = "nodejs";

const troubleshootSchema = z.object({
  assetId: z.union([z.string(), z.number()]).transform(Number),
  reason: z.string().min(1),
});

export async function POST(req: NextRequest) {
  // Troubleshooting can be reported by any user with READ permission (since they are users of the asset)
  // or specifically ASSET_READ depending on how it's used. Let's use ASSET_READ.
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  const bodyResult = await parseBody(req, troubleshootSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const result = await reportTroubleshootIssue(
      bodyResult.data.assetId,
      bodyResult.data.reason,
      session.user.employeeId
    );
    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}
