import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.SETTINGS_READ);
  if (isAuthError(authResult)) return authResult;
  try {
    const users = await prisma.user.findMany({
      select: { department: true },
      distinct: ['department'],
      where: { AND: [{ department: { not: null } }, { department: { not: "" } }] },
      orderBy: { department: 'asc' }
    });
    
    const departments = users.map((u, i) => ({
      id: i + 1,
      name: u.department,
      status: "Active",
      departmentHeadId: null,
      parentDepartmentId: null
    }));
    
    return ok(departments);
  } catch (err) {
    return serverError(err);
  }
}

