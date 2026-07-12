import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError, parseBody, isParseError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { addUnitsToParent } from "@/lib/services/assetService";
import { z } from "zod";

export const runtime = "nodejs";

const addUnitsSchema = z.object({
  count: z.number().int().positive(),
  unitPrice: z.number().optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_UPDATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  const bodyResult = await parseBody(req, addUnitsSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const { id } = await params;
    const parentId = parseInt(id, 10);
    if (isNaN(parentId)) throw new Error("Invalid parent ID");

    const result = await addUnitsToParent(
      parentId,
      bodyResult.data.count,
      session.user.employeeId,
      bodyResult.data.unitPrice || undefined
    );
    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}
