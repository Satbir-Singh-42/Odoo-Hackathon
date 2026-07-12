import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError, parseBody, isParseError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { createBulkMaintenance } from "@/lib/services/maintenanceService";
import { z } from "zod";

export const runtime = "nodejs";

const bulkMaintenanceSchema = z.object({
  bulkParentId: z.union([z.string(), z.number()]).transform(Number),
  scheduledDate: z.string(),
  description: z.string().min(1),
  status: z.string().optional().default("Scheduled"),
  completionDate: z.string().optional().nullable(),
  technician: z.string().optional().nullable(),
  cost: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  frequency: z.string().optional().nullable(),
  skipAssetIds: z.array(z.union([z.string(), z.number()]).transform(Number)).optional(),
}).transform(val => ({
  ...val,
  completionDate: val.completionDate || undefined,
  technician: val.technician || undefined,
  cost: val.cost || undefined,
  notes: val.notes || undefined,
  frequency: val.frequency || undefined,
}));

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.MAINTENANCE_UPDATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  const bodyResult = await parseBody(req, bulkMaintenanceSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const result = await createBulkMaintenance(
      {
        ...bodyResult.data,
        assetId: bodyResult.data.bulkParentId, // dummy ID since createBulkMaintenance overwrites it for each
      },
      session.user.employeeId,
      session.user.fullName
    );
    return ok({ data: result, message: result.message });
  } catch (err) {
    return serverError(err);
  }
}
