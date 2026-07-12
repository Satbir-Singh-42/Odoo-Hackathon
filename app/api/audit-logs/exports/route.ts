/**
 * GET /api/audit-logs/exports
 * Lists previously generated audit log export files.
 * Currently returns an empty list — implement blob-storage listing when needed.
 */
import {
  requireAuth,
  isAuthError,
  ok,
  serverError,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET() {
  const authResult = await requireAuth(PERMISSIONS.AUDIT_VIEW);
  if (isAuthError(authResult)) return authResult;

  try {
    // TODO: When blob storage is configured, list exported CSV files from
    // the storage bucket and return metadata (filename, createdAt, size).
    return ok({ data: [] });
  } catch (err) {
    return serverError(err);
  }
}
