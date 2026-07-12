/**
 * GET /api/audit-logs/exports/[filename]
 * Downloads a specific audit log export file by filename.
 * Currently returns 404 — implement blob-storage download when needed.
 */
import { NextRequest } from "next/server";
import {
  requireAuth,
  isAuthError,
  notFound,
  serverError,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const authResult = await requireAuth(PERMISSIONS.AUDIT_VIEW);
  if (isAuthError(authResult)) return authResult;

  try {
    const { filename } = await params;
    // TODO: When blob storage is configured, fetch and stream the file matching
    // `filename` from the storage bucket.
    console.warn(`[audit-logs/exports] Download requested for: ${filename} — blob storage not configured.`);
    return notFound("Export file not found or blob storage is not configured.");
  } catch (err) {
    return serverError(err);
  }
}
