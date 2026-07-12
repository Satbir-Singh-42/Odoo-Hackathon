import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { getInAppNotifications, markNotificationsRead, deleteInAppNotification } from "@/lib/services/notificationService";
import { z } from "zod";
import { parseBody, isParseError, noContent } from "@/lib/api-helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.NOTIFICATIONS_READ);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  try {
    const sp = req.nextUrl.searchParams;
    const result = await getInAppNotifications(session.user.employeeId, {
      unreadOnly: sp.get("unreadOnly") === "true",
      page: sp.get("page") ? parseInt(sp.get("page")!, 10) : 1,
      pageSize: sp.get("pageSize") ? parseInt(sp.get("pageSize")!, 10) : 30,
    });
    revalidatePath("/dashboard");
    return ok(result);
  } catch (err) { return serverError(err); }
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.NOTIFICATIONS_READ);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  const schema = z.object({ ids: z.array(z.number()).optional() });
  const bodyResult = await parseBody(req, schema);
  if (isParseError(bodyResult)) return bodyResult;
  try {
    await markNotificationsRead(session.user.employeeId, bodyResult.data.ids);
    return noContent();
  } catch (err) { return serverError(err); }
}
