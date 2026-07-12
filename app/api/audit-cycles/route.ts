import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, created, serverError, badRequest,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { listAuditCycles, createAuditCycle } from "@/lib/services/auditService";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

const createAuditCycleSchema = z.object({
  name: z.string().min(1).max(100),
  departmentId: z.number(),
  startDate: z.string(),
  endDate: z.string(),
  auditorIds: z.array(z.string()),
});

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;
  try {
    const result = await listAuditCycles();
    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: NextRequest) {
  // Only Managers and Admins can start verification audits
  const authResult = await requireAuth(PERMISSIONS.ASSET_UPDATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const bodyResult = await parseBody(req, createAuditCycleSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const cycle = await createAuditCycle(bodyResult.data, session.user.employeeId);

    // Revalidate paths
    revalidatePath("/audits");
    revalidatePath("/dashboard");

    return created(cycle);
  } catch (err) {
    if (err instanceof Error) {
      return badRequest(err.message);
    }
    return serverError(err);
  }
}
