import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.AUDIT_VIEW);
  if (isAuthError(authResult)) return authResult;
  try {
    const sp = req.nextUrl.searchParams;
    const page = parseInt(sp.get("page") ?? "1", 10);
    const pageSize = Math.min(200, parseInt(sp.get("pageSize") ?? "50", 10));
    const skip = (page - 1) * pageSize;
    const action = sp.get("action") ?? undefined;
    const tableName = sp.get("table") ?? undefined;
    const changedBy = sp.get("changedBy") ?? undefined;

    const where: any = {};
    if (action) where.action = action;
    if (tableName) where.tableName = tableName;
    if (changedBy) where.changedBy = { contains: changedBy, mode: "insensitive" };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { changedAt: "desc" },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return ok({ logs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    return serverError(err);
  }
}
