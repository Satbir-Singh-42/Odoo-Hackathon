import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, created, serverError, badRequest,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
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
    // Return recent transfers from AssetHistory
    const histories = await prisma.assetHistory.findMany({
      where: { actionType: "TRANSFER" },
      orderBy: { actionDate: "desc" },
      take: 50,
      include: {
        asset: { select: { id: true, assetCode: true, assetName: true } },
        employee: { select: { id: true, fullName: true, email: true } }
      }
    });

    const result = {
      data: histories.map(h => ({
        id: h.id,
        assetId: h.assetId,
        requesterId: h.employeeId,
        currentHolderId: h.performedBy,
        status: "COMPLETED",
        reason: h.notes,
        createdAt: h.actionDate,
        asset: h.asset,
        requester: h.employee
      }))
    };
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
    const { assetId, reason } = bodyResult.data;
    
    // 1. Find active allocation
    const activeAlloc = await prisma.allocation.findFirst({
      where: { assetId, status: "ACTIVE", isDeleted: false }
    });

    if (!activeAlloc) {
      return badRequest("Asset is not currently allocated to anyone.");
    }

    // 2. Perform Transfer Transaction
    const transfer = await prisma.$transaction(async (tx) => {
      // Return old
      await tx.allocation.update({
        where: { id: activeAlloc.id },
        data: { status: "RETURNED", returnDate: new Date(), returnNotes: "Transferred" }
      });

      // Create new
      const newAlloc = await tx.allocation.create({
        data: {
          assetId,
          employeeId: session.user.employeeId,
          status: "ACTIVE",
          assignedBy: session.user.employeeId,
          allocationDate: new Date()
        }
      });

      // Log History
      await tx.assetHistory.create({
        data: {
          assetId,
          employeeId: session.user.employeeId,
          actionType: "TRANSFER",
          performedBy: activeAlloc.employeeId || "System",
          notes: reason || "Direct Transfer"
        }
      });

      return newAlloc;
    });

    revalidatePath("/allocations");
    revalidatePath("/dashboard");

    return created({
      id: transfer.id,
      assetId: transfer.assetId,
      status: "COMPLETED"
    });
  } catch (err) {
    if (err instanceof Error) {
      return badRequest(err.message);
    }
    return serverError(err);
  }
}
