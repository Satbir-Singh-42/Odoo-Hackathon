/**
 * Audit Logger
 * Ported from server/middleware/auditLogger.js
 * Writes to the AuditLog table via Prisma.
 */

import { prisma } from "@/lib/prisma";
import type { AuditAction } from "@prisma/client";

interface AuditParams {
  tableName: string;
  recordId?: string | number | null;
  action: AuditAction;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  changedBy?: string | null;
  additionalInfo?: Record<string, unknown> | string | null;
}

/**
 * Write a single audit log entry. Non-fatal — errors are logged but not thrown.
 */
export async function writeAuditLog(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tableName: params.tableName,
        recordId: params.recordId != null ? String(params.recordId) : null,
        action: params.action,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        changedBy: params.changedBy ?? null,
        additionalInfo:
          params.additionalInfo != null
            ? typeof params.additionalInfo === "string"
              ? params.additionalInfo
              : JSON.stringify(params.additionalInfo)
            : null,
      },
    });
  } catch (err) {
    // Audit failures must never break business operations
    console.error("[AuditLog] Failed to write audit entry:", err);
  }
}

/**
 * Convenience wrapper for asset-related audit entries.
 */
export async function auditAsset(
  action: AuditAction,
  assetId: number | string,
  changedBy: string,
  options?: {
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    additionalInfo?: Record<string, unknown>;
  }
): Promise<void> {
  await writeAuditLog({
    tableName: "assets",
    recordId: String(assetId),
    action,
    changedBy,
    ...options,
  });
}

/**
 * Convenience wrapper for user-related audit entries.
 */
export async function auditUser(
  action: AuditAction,
  userId: string,
  changedBy: string,
  options?: {
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    additionalInfo?: Record<string, unknown>;
  }
): Promise<void> {
  await writeAuditLog({
    tableName: "users",
    recordId: userId,
    action,
    changedBy,
    ...options,
  });
}
