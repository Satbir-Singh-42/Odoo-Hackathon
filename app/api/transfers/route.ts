import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, created, serverError, badRequest,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { listTransferRequests, createTransferRequest } from "@/lib/services/transferService";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

const createTransferSchema = z.object({
  assetId: z.number(),
  reason: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;
  try {
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status") ?? undefined;
    const requesterId = sp.get("requesterId") ?? undefined;
    const currentHolderId = sp.get("currentHolderId") ?? undefined;

    const result = await listTransferRequests({ status, requesterId, currentHolderId });
    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const bodyResult = await parseBody(req, createTransferSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const transfer = await createTransferRequest({
      assetId: bodyResult.data.assetId,
      requesterId: session.user.employeeId,
      reason: bodyResult.data.reason,
    }, session.user.employeeId);

    // Revalidate paths
    revalidatePath("/allocations");
    revalidatePath("/dashboard");

    return created(transfer);
  } catch (err) {
    if (err instanceof Error) {
      return badRequest(err.message);
    }
    return serverError(err);
  }
}
