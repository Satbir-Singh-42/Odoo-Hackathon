import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError, parseBody, isParseError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { bulkReturnAssets } from "@/lib/services/assetService";
import { z } from "zod";

export const runtime = "nodejs";

const bulkReturnSchema = z.object({
  allocations: z.array(
    z.object({
      allocationId: z.union([z.string(), z.number()]).transform(Number),
      notes: z.string().optional().nullable(),
      conditionAtReturn: z.string().optional().nullable(),
    }).transform(val => ({
      allocationId: val.allocationId,
      assetId: 0, // In returnAsset, if allocationId is passed, assetId is ignored/fetched internally. We pass 0 to satisfy the type.
      returnNotes: val.notes || undefined,
      conditionAtReturn: val.conditionAtReturn || undefined,
    }))
  ),
});

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_UPDATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  const bodyResult = await parseBody(req, bulkReturnSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const result = await bulkReturnAssets(
      bodyResult.data.allocations,
      session.user.employeeId,
      session.user.fullName
    );
    revalidatePath("/assets");
    revalidatePath("/dashboard");
    revalidatePath("/allocations");
    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}
