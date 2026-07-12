import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError, parseBody, isParseError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { bulkAllocateAssets } from "@/lib/services/assetService";
import { z } from "zod";

export const runtime = "nodejs";

const bulkAllocateSchema = z.object({
  allocations: z.array(
    z.object({
      assetId: z.number(),
      employeeId: z.string().optional().nullable(),
      parentAssetId: z.number().optional().nullable(),
      installationLocation: z.string().optional().nullable(),
      ipAddress: z.string().optional().nullable(),
      operatingSystem: z.string().optional().nullable(),
      conditionAtAllocation: z.string().optional().nullable(),
      quantity: z.number().optional().nullable(),
    }).transform(val => ({
      ...val,
      employeeId: val.employeeId || undefined,
      parentAssetId: val.parentAssetId || undefined,
      installationLocation: val.installationLocation || undefined,
      ipAddress: val.ipAddress || undefined,
      operatingSystem: val.operatingSystem || undefined,
      conditionAtAllocation: val.conditionAtAllocation || undefined,
      quantity: val.quantity || undefined,
    }))
  ),
});

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_UPDATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  const bodyResult = await parseBody(req, bulkAllocateSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const result = await bulkAllocateAssets(
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
