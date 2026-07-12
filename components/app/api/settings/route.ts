import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError, ok, serverError, parseBody, isParseError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { getSystemSettings, updateSystemSettings } from "@/lib/services/notificationService";

export const runtime = "nodejs";

export async function GET() {
  const authResult = await requireAuth(PERMISSIONS.SETTINGS_READ);
  if (isAuthError(authResult)) return authResult;
  try {
    const settings = await getSystemSettings();
    return ok(settings);
  } catch (err) { return serverError(err); }
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.SETTINGS_WRITE);
  if (isAuthError(authResult)) return authResult;
  const bodyResult = await parseBody(req, z.record(z.string(), z.string()));
  if (isParseError(bodyResult)) return bodyResult;
  try {
    await updateSystemSettings(bodyResult.data);
    return ok({ status: "success", message: "Settings updated." });
  } catch (err) { return serverError(err); }
}
