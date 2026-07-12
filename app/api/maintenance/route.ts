/**
 * GET  /api/maintenance — list maintenance records
 * POST /api/maintenance — create maintenance record
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, created, serverError, getManagedCategories,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { listMaintenance, createMaintenance } from "@/lib/services/maintenanceService";

export const runtime = "nodejs";

const createMaintenanceSchema = z.object({
  assetId: z.number().int().positive(),
  scheduledDate: z.string().min(1),
  description: z.string().min(1).max(255),
  notes: z.string().optional(),
  technician: z.string().max(100).optional(),
  cost: z.number().min(0).optional(),
  frequency: z.enum(["Monthly","Quarterly","Half-Yearly","Yearly","One-Time"]).optional(),
  status: z.enum(["Scheduled","In Progress","Reported"]).optional(),
});

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.MAINTENANCE_READ);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  try {
    const sp = req.nextUrl.searchParams;
    const viewerMode = req.headers.get("x-viewer-mode") === "true";
    const managedCategories = getManagedCategories(session, viewerMode);

    const result = await listMaintenance({
      search: sp.get("search") ?? undefined,
      status: sp.get("status") ?? undefined,
      assetId: sp.get("assetId") ? parseInt(sp.get("assetId")!, 10) : undefined,
      page: sp.get("page") ? parseInt(sp.get("page")!, 10) : 1,
      pageSize: sp.get("pageSize") ? parseInt(sp.get("pageSize")!, 10) : 50,
      sortBy: sp.get("sortBy") ?? "updatedAt",
      sortOrder: (sp.get("sortOrder") as "asc" | "desc") ?? "desc",
      managedCategories,
    });

    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.MAINTENANCE_CREATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const bodyResult = await parseBody(req, createMaintenanceSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const record = await createMaintenance(
      bodyResult.data,
      session.user.employeeId,
      session.user.fullName
    );
    return created(record);
  } catch (err) {
    return serverError(err);
  }
}
