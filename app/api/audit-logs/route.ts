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
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
    const pageSize = Math.min(200, parseInt(sp.get("pageSize") ?? "50", 10));
    const skip = (page - 1) * pageSize;

    const action = sp.get("action") ?? undefined;
    // dataService sends "tableName", UI may also send "table" — support both
    const tableName = sp.get("tableName") ?? sp.get("table") ?? undefined;
    const changedBy = sp.get("changedBy") ?? undefined;
    const search = sp.get("search") ?? undefined;
    const startDate = sp.get("startDate") ?? undefined;
    const endDate = sp.get("endDate") ?? undefined;

    const where: any = { isDeleted: false };
    if (action) where.action = action;
    if (tableName) where.tableName = tableName;
    if (changedBy) where.changedBy = { contains: changedBy, mode: "insensitive" };
    if (startDate || endDate) {
      where.changedAt = {};
      if (startDate) where.changedAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.changedAt.lte = end;
      }
    }
    if (search) {
      where.OR = [
        { changedBy: { contains: search, mode: "insensitive" } },
        { tableName: { contains: search, mode: "insensitive" } },
        { recordId: { contains: search, mode: "insensitive" } },
        { additionalInfo: { contains: search, mode: "insensitive" } },
      ];
    }

    const [logs, total, tableNamesRaw, actionsRaw] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { changedAt: "desc" },
      }),
      prisma.auditLog.count({ where }),
      // Fetch distinct table names for filter dropdown
      prisma.auditLog.findMany({
        where: { isDeleted: false },
        select: { tableName: true },
        distinct: ["tableName"],
        orderBy: { tableName: "asc" },
      }),
      // Fetch distinct actions for filter dropdown
      prisma.auditLog.findMany({
        where: { isDeleted: false },
        select: { action: true },
        distinct: ["action"],
        orderBy: { action: "asc" },
      }),
    ]);

    // Collect record IDs for JOIN lookups
    const assetIds: number[] = [];
    const userIds: string[] = [];
    const vendorIds: string[] = [];

    for (const log of logs) {
      if (!log.recordId) continue;
      const t = log.tableName.toLowerCase();
      if (t === "assets" || t === "maintenance" || t === "asset_history") {
        const n = parseInt(log.recordId, 10);
        if (!isNaN(n)) assetIds.push(n);
      } else if (t === "users") {
        userIds.push(log.recordId);
      } else if (t === "vendors") {
        vendorIds.push(log.recordId);
      }
    }

    // Batch fetch related entity names
    const [assets, users, vendors, changedByUsers] = await Promise.all([
      assetIds.length
        ? prisma.asset.findMany({
            where: { id: { in: assetIds } },
            select: { id: true, assetName: true, assetCode: true },
          })
        : [],
      userIds.length
        ? prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true },
          })
        : [],
      vendorIds.length
        ? prisma.vendor.findMany({
            where: { id: { in: vendorIds } },
            select: { id: true, vendorName: true },
          })
        : [],
      // Resolve changedBy IDs → full names
      prisma.user.findMany({
        where: {
          id: {
            in: logs
              .map((l) => l.changedBy)
              .filter((x): x is string => !!x),
          },
        },
        select: { id: true, fullName: true },
      }),
    ]);

    const assetMap = new Map(assets.map((a) => [a.id, a]));
    const userMap = new Map(users.map((u) => [u.id, u.fullName]));
    const vendorMap = new Map(vendors.map((v) => [v.id, v.vendorName]));
    const changedByMap = new Map(changedByUsers.map((u) => [u.id, u.fullName]));

    const data = logs.map((log) => {
      const t = log.tableName.toLowerCase();
      const recordIdNum = log.recordId ? parseInt(log.recordId, 10) : NaN;
      const asset =
        (t === "assets" || t === "maintenance" || t === "asset_history") &&
        !isNaN(recordIdNum)
          ? assetMap.get(recordIdNum)
          : undefined;

      return {
        id: String(log.id),
        table: log.tableName,
        recordId: log.recordId,
        action: log.action,
        oldValue: log.oldValues,
        newValue: log.newValues,
        performedBy: log.changedBy ?? "",
        performedByName: log.changedBy ? changedByMap.get(log.changedBy) ?? null : null,
        date: log.changedAt.toISOString(),
        additionalInfo: log.additionalInfo,
        assetName: asset?.assetName ?? null,
        assetCode: asset?.assetCode ?? null,
        targetUserName: t === "users" && log.recordId ? userMap.get(log.recordId) ?? null : null,
        targetVendorName: t === "vendors" && log.recordId ? vendorMap.get(log.recordId) ?? null : null,
      };
    });

    return ok({
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      filters: {
        tableNames: tableNamesRaw.map((r) => r.tableName),
        actions: actionsRaw.map((r) => r.action as string),
      },
    });
  } catch (err) {
    return serverError(err);
  }
}
