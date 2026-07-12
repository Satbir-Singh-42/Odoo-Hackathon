import { prisma } from "@/lib/prisma";
import { AuditAction } from "@prisma/client";

// In Prisma, we don't necessarily need chunks for small arrays, 
// but it's good practice for large IN clauses.
const MAX_PARAMS_PER_QUERY = 500;

export function chunkArray<T>(values: T[], size = MAX_PARAMS_PER_QUERY): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

export function getCreatorAuditActions(tableName: string): AuditAction[] {
  if (tableName === "Maintenance") {
    return [AuditAction.MAINTENANCE_SCHEDULE, AuditAction.INSERT];
  }

  return [AuditAction.INSERT];
}

export async function enrichWithCreatorNames<T extends Record<string, any>>(
  records: T[],
  tableName: string,
  idField = "id"
): Promise<(T & { createdBy: string | null; createdByName: string | null })[]> {
  if (!Array.isArray(records) || records.length === 0) {
    return records as any;
  }

  try {
    const ids = [
      ...new Set(
        records
          .map((r) => r?.[idField])
          .filter((id) => id !== null && id !== undefined)
          .map((id) => String(id)),
      ),
    ];

    if (ids.length === 0) {
      return records as any;
    }

    const creatorMap: Record<string, string | null> = {};
    const creatorActions = getCreatorAuditActions(tableName);

    for (const idChunk of chunkArray(ids)) {
      const auditResult = await prisma.auditLog.findMany({
        where: {
          tableName,
          action: { in: creatorActions },
          recordId: { in: idChunk }
        },
        select: {
          recordId: true,
          changedBy: true
        },
        orderBy: { changedAt: 'asc' } // Ensure we get the earliest insert if multiple
      });

      for (const row of auditResult) {
        if (row.recordId && !Object.prototype.hasOwnProperty.call(creatorMap, row.recordId)) {
          creatorMap[row.recordId] = row.changedBy;
        }
      }
    }

    const empIds = [
      ...new Set(
        Object.values(creatorMap).filter(
          (id): id is string => !!id && id !== "System" && id !== "SYSTEM",
        ),
      ),
    ];
    const nameMap: Record<string, string> = {};

    if (empIds.length > 0) {
      for (const empChunk of chunkArray(empIds)) {
        const users = await prisma.user.findMany({
          where: {
            id: { in: empChunk } // id is EmployeeID in User model
          },
          select: {
            id: true,
            fullName: true
          }
        });

        for (const user of users) {
          nameMap[user.id] = user.fullName;
        }
      }
    }

    return records.map((record) => {
      const recordId = String(record[idField]);
      const createdBy = creatorMap[recordId] || null;

      return {
        ...record,
        createdBy,
        createdByName: (createdBy ? nameMap[createdBy] : null) || createdBy || null,
      };
    });
  } catch (error) {
    console.error(`Error enriching ${tableName} creators:`, error);
    return records as any;
  }
}
