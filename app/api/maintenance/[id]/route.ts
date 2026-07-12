/**
 * GET    /api/maintenance/:id
 * PUT    /api/maintenance/:id
 * DELETE /api/maintenance/:id
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, notFound, serverError, noContent,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import {
  getMaintenanceById,
  updateMaintenance,
  deleteMaintenance,
} from "@/lib/services/maintenanceService";

export const runtime = "nodejs";

const updateMaintenanceSchema = z.object({
  scheduledDate: z.string().optional(),
  description: z.string().min(1).max(255).optional(),
  notes: z.string().optional(),
  technician: z.string().max(100).optional(),
  cost: z.number().min(0).optional(),
  frequency: z.enum(["Monthly","Quarterly","Half-Yearly","Yearly","One-Time"]).optional(),
  status: z.enum(["Scheduled","In Progress","Completed","Cancelled","Reported"]).optional(),
  completedDate: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.MAINTENANCE_READ);
  if (isAuthError(authResult)) return authResult;

  try {
    const { id } = await params;
    const record = await getMaintenanceById(parseInt(id, 10));
    if (!record) return notFound("Maintenance record not found.");
    return ok(record);
  } catch (err) {
    return serverError(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.MAINTENANCE_UPDATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const bodyResult = await parseBody(req, updateMaintenanceSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const { id } = await params;
    const updated = await updateMaintenance(
      parseInt(id, 10),
      bodyResult.data,
      session.user.employeeId,
      session.user.fullName
    );
    return ok(updated);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return notFound(err.message);
    }
    return serverError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.MAINTENANCE_DELETE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  try {
    const { id } = await params;
    await deleteMaintenance(parseInt(id, 10), session.user.employeeId);
    return noContent();
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return notFound(err.message);
    }
    return serverError(err);
  }
}
