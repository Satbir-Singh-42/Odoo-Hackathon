import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, created, serverError,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { listDepartments, createDepartment } from "@/lib/services/departmentService";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

const createDepartmentSchema = z.object({
  name: z.string().min(1).max(100),
  departmentHeadId: z.string().max(20).nullable().optional(),
  parentDepartmentId: z.number().nullable().optional(),
  status: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.SETTINGS_READ);
  if (isAuthError(authResult)) return authResult;
  try {
    const sp = req.nextUrl.searchParams;
    const result = await listDepartments({
      search: sp.get("search") ?? undefined,
      status: sp.get("status") ?? undefined,
    });
    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.SETTINGS_WRITE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  
  const bodyResult = await parseBody(req, createDepartmentSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const dept = await createDepartment(bodyResult.data, session.user.employeeId);
    
    // On-Demand Revalidation
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    
    return created(dept);
  } catch (err) {
    return serverError(err);
  }
}
