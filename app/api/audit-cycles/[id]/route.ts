import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, serverError, notFound, badRequest,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { getAuditCycleById, logItemAudit, resolveDiscrepancy, closeAuditCycle } from "@/lib/services/auditService";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

const auditActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("verify"),
    assetId: z.number(),
    status: z.enum(["PENDING", "VERIFIED", "MISSING", "DAMAGED"]),
    notes: z.string().optional(),
  }),
  z.object({
    action: z.literal("resolve"),
    assetId: z.number(),
    resolutionNotes: z.string().min(1),
  }),
  z.object({
    action: z.literal("close"),
  }),
]);

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;

  const { id } = await params;
  const cycleId = parseInt(id, 10);
  if (isNaN(cycleId)) return notFound();

  try {
    const cycle = await getAuditCycleById(cycleId);
    if (!cycle) return notFound();
    return ok(cycle);
  } catch (err) {
    return serverError(err);
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const { id } = await params;
  const cycleId = parseInt(id, 10);
  if (isNaN(cycleId)) return notFound();

  const bodyResult = await parseBody(req, auditActionSchema);
  if (isParseError(bodyResult)) return bodyResult;

  const data = bodyResult.data;

  try {
    const cycle = await getAuditCycleById(cycleId);
    if (!cycle) return notFound();

    if (data.action === "verify") {
      // Check if user is an assigned auditor or Admin/Manager
      const isAuditor = cycle.auditors.some(a => a.auditorId === session.user.employeeId);
      const isPrivileged = session.user.role === "Admin" || session.user.role === "Manager";
      
      if (!isAuditor && !isPrivileged) {
        return badRequest("You are not assigned as an auditor for this cycle.");
      }

      const result = await logItemAudit({
        auditCycleId: cycleId,
        assetId: data.assetId,
        status: data.status,
        notes: data.notes,
        verifiedById: session.user.employeeId,
      }, session.user.employeeId);

      revalidatePath("/audits");
      revalidatePath("/dashboard");
      return ok(result);

    } else if (data.action === "resolve") {
      // Resolving discrepancies requires Admin/Manager role
      const isPrivileged = session.user.role === "Admin" || session.user.role === "Manager";
      if (!isPrivileged) {
        return badRequest("Only Admins or Managers can resolve audit discrepancies.");
      }

      const result = await resolveDiscrepancy({
        auditCycleId: cycleId,
        assetId: data.assetId,
        resolutionNotes: data.resolutionNotes,
      }, session.user.employeeId);

      revalidatePath("/audits");
      return ok(result);

    } else if (data.action === "close") {
      // Closing cycle requires Admin/Manager role
      const isPrivileged = session.user.role === "Admin" || session.user.role === "Manager";
      if (!isPrivileged) {
        return badRequest("Only Admins or Managers can close audit cycles.");
      }

      const result = await closeAuditCycle(cycleId, session.user.employeeId);

      revalidatePath("/audits");
      revalidatePath("/assets");
      revalidatePath("/dashboard");
      return ok(result);
    }

    return badRequest("Invalid action");
  } catch (err) {
    if (err instanceof Error) {
      return badRequest(err.message);
    }
    return serverError(err);
  }
}
