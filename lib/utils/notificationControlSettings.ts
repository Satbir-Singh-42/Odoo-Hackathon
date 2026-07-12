import { prisma } from "@/lib/prisma";

export interface NotificationControlSettings {
  enableEmailNotifications: boolean;
  enableManualDispatch: boolean;
  enableLocationAllocation: boolean;
  enableActiveTimeWindow: boolean;
  activeHoursStart: string;
  activeHoursEnd: string;
  activeHoursTimezone: string;
  enableMaintenanceAlerts: boolean;
  enableLicenseExpiryAlerts: boolean;
  enableAnomalyAlerts: boolean;
  enableHoarderAlerts: boolean;
  enableLemonAlerts: boolean;
  enableSoftwareDuplicateAlerts: boolean;
  enableGhostAssetAlerts: boolean;
  hoarderAlertStep: number;
  softwareDuplicateAlertStep: number;
  lemonAlertCount: number;
  lemonAlertWindowDays: number;
  ghostAssetDormantDays: number;
  enableUserCreationAlerts: boolean;
  emailResumeDate: string | null;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  _lastUpdated?: string;
}

// In-memory cache — avoids a redundant DB round-trip on every cron function call.
// Invalidated immediately inside saveNotificationControlSettings so UI changes
// propagate on the very next cron tick (at most 60 seconds later).
let _settingsCache: NotificationControlSettings | null = null;
let _settingsCacheExpiry = 0;
const SETTINGS_CACHE_TTL_MS = 60 * 1000; // 60 seconds

export const DEFAULT_NOTIFICATION_CONTROL_SETTINGS: Readonly<Omit<NotificationControlSettings, "_lastUpdated">> = Object.freeze({
  enableEmailNotifications: true,
  enableManualDispatch: true,
  enableLocationAllocation: true,
  enableActiveTimeWindow: false,
  activeHoursStart: "08:00",
  activeHoursEnd: "18:00",
  activeHoursTimezone: "",
  enableMaintenanceAlerts: true,
  enableLicenseExpiryAlerts: true,
  enableAnomalyAlerts: true,
  enableHoarderAlerts: true,
  enableLemonAlerts: true,
  enableSoftwareDuplicateAlerts: true,
  enableGhostAssetAlerts: true,
  hoarderAlertStep: 3,
  softwareDuplicateAlertStep: 2,
  lemonAlertCount: 3,
  lemonAlertWindowDays: 14,
  ghostAssetDormantDays: 365,
  enableUserCreationAlerts: true,
  emailResumeDate: null,
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: process.env.SMTP_PORT || "",
  smtpUser: process.env.EMAIL_USER || "",
  smtpPassword: process.env.EMAIL_APP_PASSWORD || "",
});

function normalizePositiveInt(value: any, fallback: number, { min = 1, max = 3650 } = {}): number {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function normalizeTimeValue(value: any, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed) ? trimmed : fallback;
}

function normalizeTimezoneValue(value: any, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  // Allow empty string to pass through as a "not yet configured" signal.
  // The frontend treats falsy timezone as "run auto-detect".
  // Non-empty values (including "UTC") are respected as explicit admin choices.
  const trimmed = value.trim();
  if (trimmed === "") return "";
  return trimmed;
}

function normalizeDateValue(value: any, fallback: string | null = null): string | null {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : fallback;
}

export function getDateStringInTimezone(timeZone: string, now = new Date()): string {
  try {
    const localized = new Date(now.toLocaleString("en-US", { timeZone }));
    const year = localized.getFullYear();
    const month = String(localized.getMonth() + 1).padStart(2, "0");
    const day = String(localized.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const day = String(now.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}

function parseMinutesFromTime(timeValue: string | undefined): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(timeValue || ""));
  if (!match) {
    return null;
  }

  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

function parseBool(val: any): boolean | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === "boolean") return val;
  const str = String(val).toLowerCase().trim();
  return str === "true";
}

export function normalizeNotificationControlSettings(value: any): NotificationControlSettings {
  // Coerce to a plain object — any non-object input (null, string, etc.) becomes {}.
  // After this line, `source` is always a truthy object, so a secondary fallback is not needed.
  const source = value && typeof value === "object" ? value : {};

  // Resolve credentials first to see if email notifications can be enabled
  const smtpUser = source.smtpUser ? String(source.smtpUser) : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.smtpUser;
  const smtpPassword = source.smtpPassword ? String(source.smtpPassword) : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.smtpPassword;

  const resolvedUser = smtpUser || process.env.EMAIL_USER || "";
  const resolvedPassword = smtpPassword || process.env.EMAIL_APP_PASSWORD || "";
  const hasCredentials = resolvedUser.trim() !== "" && resolvedPassword.trim() !== "";

  const rawEnableEmail = source.enableEmailNotifications !== undefined
    ? parseBool(source.enableEmailNotifications) ?? DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableEmailNotifications
    : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableEmailNotifications;

  const smtpHost = source.smtpHost ? String(source.smtpHost) : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.smtpHost;
  const resolvedHost = smtpHost || process.env.SMTP_HOST || "smtp.gmail.com";
  const isGmail = resolvedHost.includes("gmail.com");

  // Force off if it's Gmail and credentials are not available.
  // Internal SMTP relays (Exchange, etc.) can be unauthenticated, so we allow them.
  const enableEmailNotifications = (isGmail && !hasCredentials) ? false : rawEnableEmail;

  return {
    enableEmailNotifications,
    enableManualDispatch:
      source.enableManualDispatch !== undefined
        ? parseBool(source.enableManualDispatch) ?? DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableManualDispatch
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableManualDispatch,
    enableLocationAllocation:
      source.enableLocationAllocation !== undefined
        ? parseBool(source.enableLocationAllocation) ?? DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableLocationAllocation
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableLocationAllocation,
    enableActiveTimeWindow:
      source.enableActiveTimeWindow !== undefined
        ? parseBool(source.enableActiveTimeWindow) ?? DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableActiveTimeWindow
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableActiveTimeWindow,
    activeHoursStart: normalizeTimeValue(
      source.activeHoursStart,
      DEFAULT_NOTIFICATION_CONTROL_SETTINGS.activeHoursStart,
    ),
    activeHoursEnd: normalizeTimeValue(
      source.activeHoursEnd,
      DEFAULT_NOTIFICATION_CONTROL_SETTINGS.activeHoursEnd,
    ),
    activeHoursTimezone: normalizeTimezoneValue(
      source.activeHoursTimezone,
      DEFAULT_NOTIFICATION_CONTROL_SETTINGS.activeHoursTimezone,
    ),
    enableMaintenanceAlerts:
      source.enableMaintenanceAlerts !== undefined
        ? parseBool(source.enableMaintenanceAlerts) ?? DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableMaintenanceAlerts
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableMaintenanceAlerts,
    enableLicenseExpiryAlerts:
      source.enableLicenseExpiryAlerts !== undefined
        ? parseBool(source.enableLicenseExpiryAlerts) ?? DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableLicenseExpiryAlerts
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableLicenseExpiryAlerts,
    enableAnomalyAlerts:
      source.enableAnomalyAlerts !== undefined
        ? parseBool(source.enableAnomalyAlerts) ?? DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableAnomalyAlerts
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableAnomalyAlerts,
    enableHoarderAlerts:
      source.enableHoarderAlerts !== undefined
        ? parseBool(source.enableHoarderAlerts) ?? DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableHoarderAlerts
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableHoarderAlerts,
    enableLemonAlerts:
      source.enableLemonAlerts !== undefined
        ? parseBool(source.enableLemonAlerts) ?? DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableLemonAlerts
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableLemonAlerts,
    enableSoftwareDuplicateAlerts:
      source.enableSoftwareDuplicateAlerts !== undefined
        ? parseBool(source.enableSoftwareDuplicateAlerts) ?? DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableSoftwareDuplicateAlerts
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableSoftwareDuplicateAlerts,
    enableGhostAssetAlerts:
      source.enableGhostAssetAlerts !== undefined
        ? parseBool(source.enableGhostAssetAlerts) ?? DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableGhostAssetAlerts
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableGhostAssetAlerts,
    enableUserCreationAlerts:
      source.enableUserCreationAlerts !== undefined
        ? parseBool(source.enableUserCreationAlerts) ?? DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableUserCreationAlerts
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableUserCreationAlerts,
    hoarderAlertStep: normalizePositiveInt(
      source.hoarderAlertStep,
      DEFAULT_NOTIFICATION_CONTROL_SETTINGS.hoarderAlertStep,
      { min: 1, max: 100 },
    ),
    softwareDuplicateAlertStep: normalizePositiveInt(
      source.softwareDuplicateAlertStep,
      DEFAULT_NOTIFICATION_CONTROL_SETTINGS.softwareDuplicateAlertStep,
      { min: 2, max: 100 },
    ),
    lemonAlertCount: normalizePositiveInt(
      source.lemonAlertCount,
      DEFAULT_NOTIFICATION_CONTROL_SETTINGS.lemonAlertCount,
      { min: 2, max: 100 },
    ),
    lemonAlertWindowDays: normalizePositiveInt(
      source.lemonAlertWindowDays,
      DEFAULT_NOTIFICATION_CONTROL_SETTINGS.lemonAlertWindowDays,
      { min: 1, max: 365 },
    ),
    ghostAssetDormantDays: normalizePositiveInt(
      source.ghostAssetDormantDays,
      DEFAULT_NOTIFICATION_CONTROL_SETTINGS.ghostAssetDormantDays,
      { min: 30, max: 3650 },
    ),
    emailResumeDate: normalizeDateValue(
      source.emailResumeDate,
      DEFAULT_NOTIFICATION_CONTROL_SETTINGS.emailResumeDate,
    ),
    smtpHost: source.smtpHost ? String(source.smtpHost) : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.smtpHost,
    smtpPort: source.smtpPort ? String(source.smtpPort) : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.smtpPort,
    smtpUser,
    smtpPassword,
    _lastUpdated: source._lastUpdated,
  };
}

export function isWithinActiveTimeWindow(settings: any, now = new Date()): boolean {
  const normalized = normalizeNotificationControlSettings(settings);

  if (!normalized.enableActiveTimeWindow) {
    return true;
  }

  const startMinutes = parseMinutesFromTime(normalized.activeHoursStart);
  const endMinutes = parseMinutesFromTime(normalized.activeHoursEnd);

  if (startMinutes == null || endMinutes == null || startMinutes === endMinutes) {
    return true;
  }

  // Resolve timezone: empty string means admin hasn't configured it yet —
  // fall back to the server's OS timezone so the window check still works.
  const tz = normalized.activeHoursTimezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;

  const localizedNow = new Date(
    now.toLocaleString("en-US", { timeZone: tz }),
  );
  const nowMinutes = localizedNow.getHours() * 60 + localizedNow.getMinutes();

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

export function isOutsideActiveTimeWindow(settings: any, now = new Date()): boolean {
  return !isWithinActiveTimeWindow(settings, now);
}

export async function getNotificationControlSettings(): Promise<NotificationControlSettings> {
  // Return cached copy if still fresh
  const now = Date.now();
  if (_settingsCache && now < _settingsCacheExpiry) {
    return _settingsCache;
  }

  try {
    const settings = await prisma.systemSetting.findMany({
      where: {
        key: { not: 'AdminEmails' }
      }
    });

    const raw: Record<string, string | null> = {};
    let maxUpdatedAt = 0;
    
    for (const row of settings) {
      raw[row.key] = row.value;
      if (row.updatedAt) {
        const time = new Date(row.updatedAt).getTime();
        if (time > maxUpdatedAt) maxUpdatedAt = time;
      }
    }

    const normalized = normalizeNotificationControlSettings(raw);
    if (maxUpdatedAt > 0) {
      normalized._lastUpdated = new Date(maxUpdatedAt).toISOString();
    }

    _settingsCache = normalized;
    _settingsCacheExpiry = now + SETTINGS_CACHE_TTL_MS;
    return normalized;
  } catch (error) {
    console.error("Failed to fetch notification control settings:", error);
    return { ...DEFAULT_NOTIFICATION_CONTROL_SETTINGS };
  }
}

export async function saveNotificationControlSettings(nextSettings?: Record<string, any>): Promise<NotificationControlSettings> {
  const currentSettings = await getNotificationControlSettings();

  // If password is masked, retain the original real password from currentSettings
  if (nextSettings && nextSettings.smtpPassword === "********") {
    nextSettings.smtpPassword = currentSettings.smtpPassword;
  }

  const normalized = normalizeNotificationControlSettings({
    ...currentSettings,
    ...(nextSettings || {}),
  });

  const wasEmailEnabled = Boolean(currentSettings.enableEmailNotifications);
  const willEmailBeEnabled = Boolean(normalized.enableEmailNotifications);

  // Drop automatic backlog created while emailing was OFF.
  // Any schedule with trigger date on/before this day will be ignored.
  if (!wasEmailEnabled && willEmailBeEnabled) {
    normalized.emailResumeDate = getDateStringInTimezone(
      normalized.activeHoursTimezone,
    );
  }
  
  if (nextSettings && nextSettings._lastUpdated) {
    const clientLastUpdated = new Date(nextSettings._lastUpdated).getTime();
    const dbMax = await prisma.systemSetting.findFirst({
       orderBy: { updatedAt: 'desc' }
    });
    
    if (dbMax && dbMax.updatedAt.getTime() > clientLastUpdated) {
       throw new Error('Settings were modified by someone else. Please refresh the page.');
    }
  }

  const dataToSave = { ...normalized };
  delete dataToSave._lastUpdated;

  await prisma.$transaction(async (tx) => {
    for (const [key, val] of Object.entries(dataToSave)) {
      const strVal = val === null || val === undefined ? '' : String(val);
      await tx.systemSetting.upsert({
         where: { key },
         update: { value: strVal },
         create: { key, value: strVal }
      });
    }
  });

  // Invalidate cache so the next read picks up the new values immediately
  _settingsCache = normalized;
  _settingsCacheExpiry = Date.now() + SETTINGS_CACHE_TTL_MS;

  return normalized;
}
