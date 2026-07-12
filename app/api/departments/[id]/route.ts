import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, serverError, notFound,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { updateDepartment, deleteDepartment, getDepartmentById } from "@/lib/services/departmentService";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

const updateDepartmentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  departmentHeadId: z.string().max(20).nullable().optional(),
  parentDepartmentId: z.number().nullable().optional(),
  status: z.string().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth(PERMISSIONS.SETTINGS_READ);
  if (isAuthError(authResult)) return authResult;
  
  const { id } = await params;
  const deptId = parseInt(id, 10);
  if (isNaN(deptId)) return notFound();

  try {
    const dept = await getDepartmentById(deptId);
    if (!dept || dept.isDeleted) return notFound();
    return ok(dept);
  } catch (err) {
    return serverError(err);
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth(PERMISSIONS.SETTINGS_WRITE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const { id } = await params;
  const deptId = parseInt(id, 10);
  if (isNaN(deptId)) return notFound();

  const bodyResult = await parseBody(req, updateDepartmentSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const dept = await updateDepartment(deptId, bodyResult.data, session.user.employeeId);
    
    // On-Demand Revalidation
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    
    return ok(dept);
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth(PERMISSIONS.SETTINGS_WRITE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const { id } = await params;
  const deptId = parseInt(id, 10);
  if (isNaN(deptId)) return notFound();

  try {
    const dept = await deleteDepartment(deptId, session.user.employeeId);
    
    // On-Demand Revalidation
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    
    return ok(dept);
  } catch (err) {
    return serverError(err);
  }
}
