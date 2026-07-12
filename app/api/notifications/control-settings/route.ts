import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError, parseBody, isParseError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { getSystemSettings, updateSystemSetting } from "@/lib/services/notificationService";
import { DEFAULT_NOTIFICATION_CONTROL_SETTINGS } from "@/lib/dataService";
import { z } from "zod";

export const runtime = "nodejs";

const controlSettingsSchema = z.record(z.string(), z.any());

export async function GET() {
  const authResult = await requireAuth(PERMISSIONS.SETTINGS_READ);
  if (isAuthError(authResult)) return authResult;
  try {
    const raw = await getSystemSettings();
    let settings = { ...DEFAULT_NOTIFICATION_CONTROL_SETTINGS };
    if (raw["notification_control_settings"]) {
      try {
        const parsed = JSON.parse(raw["notification_control_settings"]);
        settings = { ...settings, ...parsed };
      } catch (e) {
        // Ignore parse error
      }
    } else {
      // Also check individual keys if they exist in raw
      for (const key of Object.keys(DEFAULT_NOTIFICATION_CONTROL_SETTINGS)) {
        if (raw[key] !== undefined) {
          const val = raw[key];
          if (val === "true" || val === "false") {
            (settings as any)[key] = val === "true";
          } else if (!isNaN(Number(val)) && val !== "") {
            (settings as any)[key] = Number(val);
          } else {
            (settings as any)[key] = val;
          }
        }
      }
    }
    return ok(settings);
  } catch (err) {
    return serverError(err);
  }
}

export async function PUT(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.SETTINGS_WRITE);
  if (isAuthError(authResult)) return authResult;
  const bodyResult = await parseBody(req, controlSettingsSchema);
  if (isParseError(bodyResult)) return bodyResult;
  try {
    const newSettings = {
      ...DEFAULT_NOTIFICATION_CONTROL_SETTINGS,
      ...bodyResult.data,
    };
    await updateSystemSetting(
      "notification_control_settings",
      JSON.stringify(newSettings)
    );
    return ok(newSettings);
  } catch (err) {
    return serverError(err);
  }
}
