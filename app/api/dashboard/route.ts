import { requireAuth, isAuthError, ok, serverError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { getDashboardStats } from "@/lib/services/assetService";

export const runtime = "nodejs";

export async function GET() {
  const authResult = await requireAuth(PERMISSIONS.DASHBOARD_VIEW);
  if (isAuthError(authResult)) return authResult;
  try {
    const stats = await getDashboardStats();
    return ok(stats);
  } catch (err) {
    return serverError(err);
  }
}
