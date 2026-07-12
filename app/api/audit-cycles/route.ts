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

const createAuditSchema = z.object({
  assetId: z.number(),
  status: z.enum(["VERIFIED", "DISCREPANCY"]),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;
  try {
    // Return recent audits from AssetHistory
    const histories = await prisma.assetHistory.findMany({
      where: { 
        actionType: { in: ["AUDIT_VERIFIED", "AUDIT_DISCREPANCY"] } 
      },
      orderBy: { actionDate: "desc" },
      take: 50,
      include: {
        asset: { select: { id: true, assetCode: true, assetName: true } },
        employee: { select: { id: true, fullName: true, email: true } }
      }
    });

    return ok({ data: histories });
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_UPDATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const bodyResult = await parseBody(req, createAuditSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const { assetId, status, notes } = bodyResult.data;

    const audit = await prisma.assetHistory.create({
      data: {
        assetId,
        actionType: status === "VERIFIED" ? "AUDIT_VERIFIED" : "AUDIT_DISCREPANCY",
        notes: notes || "Audited via System",
        performedBy: session.user.employeeId,
      }
    });

    revalidatePath("/audits");
    revalidatePath("/dashboard");

    return created(audit);
  } catch (err) {
    if (err instanceof Error) {
      return badRequest(err.message);
    }
    return serverError(err);
  }
}
