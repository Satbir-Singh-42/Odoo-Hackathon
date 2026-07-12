import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, serverError, notFound, badRequest,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { approveTransferRequest, rejectTransferRequest } from "@/lib/services/transferService";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

const updateTransferSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;

  const { id } = await params;
  const transferId = parseInt(id, 10);
  if (isNaN(transferId)) return notFound();

  try {
    const transfer = await prisma.transferRequest.findUnique({
      where: { id: transferId },
      include: {
        asset: true,
        currentHolder: true,
        requester: true,
        allocation: true,
      },
    });
    if (!transfer) return notFound();
    return ok(transfer);
  } catch (err) {
    return serverError(err);
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  // Only Managers and Admins can approve/reject asset allocations
  const authResult = await requireAuth(PERMISSIONS.ASSET_ALLOCATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const { id } = await params;
  const transferId = parseInt(id, 10);
  if (isNaN(transferId)) return notFound();

  const bodyResult = await parseBody(req, updateTransferSchema);
  if (isParseError(bodyResult)) return bodyResult;

  const { action } = bodyResult.data;

  try {
    let result;
    if (action === "approve") {
      result = await approveTransferRequest(transferId, session.user.employeeId, session.user.fullName);
    } else {
      result = await rejectTransferRequest(transferId, session.user.employeeId, session.user.fullName);
    }

    // Revalidate paths
    revalidatePath("/allocations");
    revalidatePath("/assets");
    revalidatePath("/dashboard");

    return ok(result);
  } catch (err) {
    if (err instanceof Error) {
      return badRequest(err.message);
    }
    return serverError(err);
  }
}
