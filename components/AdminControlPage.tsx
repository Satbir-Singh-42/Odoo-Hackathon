'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  ChevronDown,
  Clock3,
  Copy,
  Eye,
  Ghost,
  KeyRound,
  MapPin,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import { useSmartDropdownPosition } from '@/hooks/useSmartDropdownPosition';
import { toast } from "sonner";
import dataService, {
  DEFAULT_NOTIFICATION_CONTROL_SETTINGS,
  type NotificationControlSettings,
} from '@/lib/dataService';
import { getErrorMessage } from '@/lib/utils/errorHelpers';
import { openDataView } from '@/lib/utils/dataViewHelpers';
import { parseCSV } from '@/lib/utils/csvHelpers';

type ToggleKey =
  | "enableEmailNotifications"
  | "enableManualDispatch"
  | "enableActiveTimeWindow"
  | "enableMaintenanceAlerts"
  | "enableLicenseExpiryAlerts"
  | "enableAnomalyAlerts"
  | "enableHoarderAlerts"
  | "enableLemonAlerts"
  | "enableSoftwareDuplicateAlerts"
  | "enableGhostAssetAlerts"
  | "enableLocationAllocation"
  | "enableUserCreationAlerts";

type NumberSettingKey =
  | "hoarderAlertStep"
  | "softwareDuplicateAlertStep"
  | "lemonAlertCount"
  | "lemonAlertWindowDays"
  | "ghostAssetDormantDays";

type StringSettingKey = "smtpHost" | "smtpPort" | "smtpUser" | "smtpPassword";

type AdminSection = "email-channels" | "anomaly-controls" | "advanced-settings";

type TimePart = "hour" | "minute" | "period";

type TimeParts = {
  hour: string;
  minute: string;
  period: "AM" | "PM";
};

type SelectOption = {
  value: string;
  label: string;
};

const TIMEZONE_PRESETS: SelectOption[] = (() => {
  try {
    const zones = Intl.supportedValuesOf("timeZone");
    const now = new Date();

    const grouped = new Map<
      number,
      { offsetLabel: string; cities: string[]; representativeValue: string }
    >();

    for (const zone of zones) {
      try {
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: zone,
          timeZoneName: "shortOffset",
        });
        const offsetStr =
          formatter.formatToParts(now).find((p) => p.type === "timeZoneName")
            ?.value || "GMT+0:00";

        const match = offsetStr.match(/GMT([+-])(\d+)(?::(\d+))?/) || [
          "",
          "+",
          "0",
          "0",
        ];
        const sign = match[1] === "+" ? 1 : -1;
        const hours = Number.parseInt(match[2], 10);
        const mins = match[3] ? Number.parseInt(match[3], 10) : 0;
        const offsetMinutes = sign * (hours * 60 + mins);

        const utcLabel = `(UTC${match[1]}${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")})`;

        if (!grouped.has(offsetMinutes)) {
          grouped.set(offsetMinutes, {
            offsetLabel: utcLabel,
            cities: [],
            representativeValue: zone,
          });
        }

        const entry = grouped.get(offsetMinutes)!;
        const city = zone.split("/").pop()?.replace(/_/g, " ") || zone;

        if (entry.cities.length < 6 && !entry.cities.includes(city)) {
          entry.cities.push(city);
        }
      } catch { }
    }

    return Array.from(grouped.values())
      .map((data) => ({
        value: data.representativeValue,
        label: `${data.offsetLabel} ${data.cities.join(", ")}`,
      }))
      .sort((a, b) => {
        // Parse the offset from label for accurate sorting (since offsetMinutes was local to the loop)
        const getMins = (lbl: string) => {
          const m = lbl.match(/\(UTC([+-])(\d+):(\d+)\)/);
          if (!m) return 0;
          return (
            (m[1] === "+" ? 1 : -1) *
            (Number.parseInt(m[2], 10) * 60 + Number.parseInt(m[3], 10))
          );
        };
        return getMins(a.label) - getMins(b.label);
      });
  } catch {
    // Intl.supportedValuesOf() failed (very old browser).
    // Try to at least detect the local timezone for the single fallback entry.
    try {
      const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const offsetStr =
        new Intl.DateTimeFormat("en-US", {
          timeZone: localZone,
          timeZoneName: "shortOffset",
        })
          .formatToParts(new Date())
          .find((p) => p.type === "timeZoneName")?.value || "GMT+0:00";
      const match = offsetStr.match(/GMT([+-])(\d+)(?::(\d+))?/);
      const sign = match?.[1] || "+";
      const hh = String(Number.parseInt(match?.[2] || "0", 10)).padStart(
        2,
        "0",
      );
      const mm = String(Number.parseInt(match?.[3] || "0", 10)).padStart(
        2,
        "0",
      );
      const city = localZone.split("/").pop()?.replace(/_/g, " ") || localZone;
      return [{ value: localZone, label: `(UTC${sign}${hh}:${mm}) ${city}` }];
    } catch {
      return [
        { value: "UTC", label: "(UTC+00:00) Coordinated Universal Time" },
      ];
    }
  }
})();

function getTimezoneLabel(value: string) {
  if (!value) return "";
  const found = TIMEZONE_PRESETS.find((zone) => zone.value === value);
  if (found) return found.label;

  // Fallback: Try to find a matching group by offset
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: value,
      timeZoneName: "shortOffset",
    });
    const offsetStr =
      formatter.formatToParts(now).find((p) => p.type === "timeZoneName")
        ?.value || "";
    const match = offsetStr.match(/GMT([+-])(\d+)(?::(\d+))?/);
    if (match) {
      const sign = match[1];
      const hours = match[2].padStart(2, "0");
      const mins = (match[3] || "00").padStart(2, "0");
      const utcSearch = `(UTC${sign}${hours}:${mins})`;
      const groupMatch = TIMEZONE_PRESETS.find((p) =>
        p.label.startsWith(utcSearch),
      );
      if (groupMatch) return groupMatch.label;
      // Build a minimal readable label from the UTC offset + city name
      const city = value.split("/").pop()?.replace(/_/g, " ") || value;
      return `${utcSearch} ${city}`;
    }
  } catch {
    // Ignore and fallback to raw value
  }

  // Last resort: show city portion of the IANA string (e.g. "Asia/Kolkata" → "Kolkata")
  return value.split("/").pop()?.replace(/_/g, " ") || value;
}

function getTimezoneOptions(currentTimezone: string = ""): SelectOption[] {
  const current = currentTimezone.trim();
  if (!current) return TIMEZONE_PRESETS;

  // Check if current value exists as a representative value
  const exactMatch = TIMEZONE_PRESETS.find((p) => p.value === current);
  if (exactMatch) return TIMEZONE_PRESETS;

  // If not found, try to find a preset with the same UTC offset label
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: current,
      timeZoneName: "shortOffset",
    });
    const offsetStr =
      formatter.formatToParts(now).find((p) => p.type === "timeZoneName")
        ?.value || "";
    const match = offsetStr.match(/GMT([+-])(\d+)(?::(\d+))?/);

    if (match) {
      const sign = match[1];
      const hours = match[2].padStart(2, "0");
      const mins = (match[3] || "00").padStart(2, "0");
      const utcSearch = `(UTC${sign}${hours}:${mins})`;

      const groupMatch = TIMEZONE_PRESETS.find((p) =>
        p.label.startsWith(utcSearch),
      );
      if (groupMatch) {
        // Return presets but replace the group's value with the user's specific value
        // so the select box shows it as the selected option.
        return TIMEZONE_PRESETS.map((p) =>
          p.label.startsWith(utcSearch) ? { ...p, value: current } : p,
        );
      }
    }
  } catch {
    // Fallback to prepending if offset detection fails
  }

  return [
    { value: current, label: getTimezoneLabel(current) },
    ...TIMEZONE_PRESETS,
  ];
}

function parse24HourTime(value: string, fallback: string): TimeParts {
  const source = /^([01]\d|2[0-3]):([0-5]\d)$/.test(value) ? value : fallback;
  const [hourPart, minutePart] = source.split(":");
  const hour24 = Number.parseInt(hourPart, 10);
  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return {
    hour: String(hour12).padStart(2, "0"),
    minute: minutePart,
    period,
  };
}

function to24HourTime(parts: TimeParts): string {
  const parsedHour = Number.parseInt(parts.hour, 10);
  const parsedMinute = Number.parseInt(parts.minute, 10);
  const safeHour = Number.isInteger(parsedHour)
    ? Math.min(12, Math.max(1, parsedHour))
    : 12;
  const safeMinute = Number.isInteger(parsedMinute)
    ? Math.min(59, Math.max(0, parsedMinute))
    : 0;

  let hour24 = safeHour % 12;
  if (parts.period === "PM") {
    hour24 += 12;
  }

  return `${String(hour24).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
}

function ToggleRow({
  title,
  description,
  icon: Icon,
  enabled,
  disabled,
  onToggle,
}: {
  title: string;
  description: string;
  icon: typeof Bell;
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border p-3 sm:p-4 ${disabled ? "border-gray-200 bg-gray-50/70" : "border-gray-200 bg-white"
        }`}>
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={`mt-0.5 rounded-lg p-1.5 ${disabled ? "bg-gray-200" : "bg-blue-100"
            }`}>
          <Icon
            className={`w-4 h-4 ${disabled ? "text-gray-400" : "text-blue-600"}`}
          />
        </div>
        <div className="min-w-0">
          <p
            className={`text-sm font-semibold ${disabled ? "text-gray-500" : "text-gray-900"}`}>
            {title}
          </p>
          <p
            className={`text-xs mt-0.5 ${disabled ? "text-gray-400" : "text-gray-500"}`}>
            {description}
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${disabled
          ? "cursor-not-allowed bg-gray-300"
          : enabled
            ? "bg-blue-600"
            : "bg-gray-300"
          }`}>
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-6" : "translate-x-1"
            }`}
        />
      </button>
    </div>
  );
}

function ThemedSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (nextValue: string) => void;
  options: Array<string | SelectOption>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { openUpward, maxHeight } = useSmartDropdownPosition({
    isOpen: open,
    anchorRef: ref,
    menuRef: menuRef,
    preferredMaxHeight: 240,
  });

  const normalized = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  const selected = normalized.find((o) => o.value === value) ?? normalized[0];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative w-full">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`
          w-full h-10 pl-3 pr-9 rounded-lg border text-sm font-medium text-left
          flex items-center justify-between gap-2 transition-all duration-150
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0
          ${disabled
            ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
            : open
              ? "bg-white border-blue-400 shadow-[0_0_0_3px_rgba(59,130,246,0.12)] text-gray-900"
              : "bg-white border-gray-300 hover:border-blue-400 text-gray-900 cursor-pointer shadow-sm"
          }
        `}
        aria-haspopup="listbox"
        aria-expanded={open}>
        <span className="truncate">{selected?.label}</span>
        <ChevronDown
          className={`absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180 text-blue-500" : "text-gray-400"
            }`}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={menuRef}
          role="listbox"
          className="
            absolute z-50 w-full rounded-xl border border-gray-200
            bg-white shadow-xl shadow-gray-200/60
            overflow-hidden
            animate-[fadeSlideDown_0.12s_ease-out]
          "
          style={{
            animation: "fadeSlideDown 0.12s ease-out",
            maxHeight: `${maxHeight}px`,
            overflowY: "auto",
            top: openUpward ? "auto" : "100%",
            bottom: openUpward ? "100%" : "auto",
            marginTop: openUpward ? undefined : "0.375rem",
            marginBottom: openUpward ? "0.375rem" : undefined,
          }}>
          {normalized.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`
                  w-full px-3 py-2.5 text-sm text-left flex items-center gap-2.5
                  transition-colors duration-100
                  ${isSelected
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : "text-gray-700 hover:bg-gray-50 hover:text-gray-900 font-medium"
                  }
                `}>
                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                )}
                {!isSelected && <span className="w-1.5 flex-shrink-0" />}
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      {/* fadeSlideDown keyframe is defined globally in index.css */}
    </div>
  );
}

export function AdminControlPage() {
  const [settings, setSettings] = useState<NotificationControlSettings>(
    DEFAULT_NOTIFICATION_CONTROL_SETTINGS,
  );
  const [savedSettings, setSavedSettings] =
    useState<NotificationControlSettings>(
      DEFAULT_NOTIFICATION_CONTROL_SETTINGS,
    );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] =
    useState<AdminSection>("email-channels");
  const [timeWindowOpen, setTimeWindowOpen] = useState(false);
  const [anomalyThresholdsOpen, setAnomalyThresholdsOpen] = useState(false);
  const [emailServerOpen, setEmailServerOpen] = useState(false);
  const [auditLogsMonthsToDelete, setAuditLogsMonthsToDelete] = useState("6");
  const [clearingLogs, setClearingLogs] = useState(false);
  const [dataMaintenanceOpen, setDataMaintenanceOpen] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [exportsList, setExportsList] = useState<
    {
      filename: string;
      originalName: string;
      createdAt: string;
      size: number;
    }[]
  >([]);

  const isDirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(savedSettings),
    [settings, savedSettings],
  );

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await dataService.getNotificationControlSettings();
      // Auto-detect browser timezone only when no timezone has been saved yet
      // (empty string = seed default / never explicitly configured).
      // Non-empty values — including "UTC" — are treated as deliberate admin choices
      // and are NOT overwritten, so manual timezone selection is always respected.
      if (!data.activeHoursTimezone) {
        data.activeHoursTimezone =
          Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
      setSettings(data);
      setSavedSettings(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Failed to load admin controls");
    } finally {
      setLoading(false);
    }
  };

  const handleTestSmtp = async () => {
    if (!settings.smtpHost || !settings.smtpPort) {
      toast.error("SMTP Host and Port are required for testing");
      return;
    }
    try {
      setTestingSmtp(true);
      const res = await dataService.testSmtp({
        host: settings.smtpHost,
        port: settings.smtpPort,
        user: settings.smtpUser || "",
        pass: settings.smtpPassword || "",
      });
      toast.success(res.message || "SMTP connection successful");
    } catch (err: any) {
      toast.error(err.message || "Failed to connect to SMTP server");
    } finally {
      setTestingSmtp(false);
    }
  };

  // handleSave was removed — it was an unused duplicate of saveChanges.
  // All saves go through saveChanges() which also validates SMTP, clamps
  // numeric fields, and dispatches the SETTINGS_UPDATED event.

  const loadExports = async () => {
    try {
      const data = await dataService.getAuditLogExports();
      setExportsList(data);
    } catch (err) {
      console.error("Failed to load exports:", err instanceof Error ? err.message : err);
    }
  };

  useEffect(() => {
    loadSettings();
    loadExports();
  }, []);

  const [viewingExport, setViewingExport] = useState<string | null>(null);

  const handleClearAuditLogs = async () => {
    if (
      !window.confirm(
        `Are you sure you want to permanently delete all audit logs older than ${auditLogsMonthsToDelete} months? This action cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      setClearingLogs(true);
      await dataService.clearAuditLogs(parseInt(auditLogsMonthsToDelete, 10));
      toast.success(
        `Successfully deleted audit logs older than ${auditLogsMonthsToDelete} months`,
      );
      loadExports();
    } catch (err: any) {
      toast.error(err.message || "Failed to clear audit logs");
    } finally {
      setClearingLogs(false);
    }
  };

  const handleViewExport = async (filename: string, originalName: string) => {
    try {
      setViewingExport(filename);
      const csvText = await dataService.getAuditLogExportCsv(filename);
      const rows = parseCSV(csvText);
      if (rows.length === 0) {
        toast.error("Export file is empty or could not be parsed.");
        return;
      }

      const headers = rows[0];
      const dataRows = rows.slice(1);
      openDataView({
        title: originalName || filename,
        headers,
        rows: dataRows,
        filename: originalName || filename,
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to preview the export file");
    } finally {
      setViewingExport(null);
    }
  };

  const updateFlag = (key: ToggleKey) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateNumberSetting = (key: NumberSettingKey, value: string) => {
    if (value === "" || /^[0-9]+$/.test(value)) {
      setSettings((prev) => ({
        ...prev,
        [key]: value as unknown as number,
      }));
    }
  };

  const updateStringSetting = (key: StringSettingKey, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleNumberBlur = (
    key: NumberSettingKey,
    min: number,
    max: number,
  ) => {
    setSettings((prev) => {
      const val = prev[key];
      const parsed = Number.parseInt(String(val), 10);
      const fallback = DEFAULT_NOTIFICATION_CONTROL_SETTINGS[key];
      const nextValue = Number.isNaN(parsed)
        ? fallback
        : Math.min(max, Math.max(min, parsed));
      return {
        ...prev,
        [key]: nextValue,
      };
    });
  };

  const updateTimeByPart = (
    key: "activeHoursStart" | "activeHoursEnd",
    part: TimePart,
    value: string,
  ) => {
    setSettings((prev) => {
      const fallback =
        key === "activeHoursStart"
          ? DEFAULT_NOTIFICATION_CONTROL_SETTINGS.activeHoursStart
          : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.activeHoursEnd;
      const current = parse24HourTime(prev[key], fallback);
      const next: TimeParts = {
        ...current,
        [part]: part === "period" ? (value === "PM" ? "PM" : "AM") : value,
      } as TimeParts;

      return {
        ...prev,
        [key]: to24HourTime(next),
      };
    });
  };

  const updateTimezone = (value: string) => {
    setSettings((prev) => ({
      ...prev,
      activeHoursTimezone: value,
    }));
  };

  const saveChanges = async () => {
    try {
      setSaving(true);
      setError("");

      const smtpChanged =
        settings.smtpHost !== savedSettings.smtpHost ||
        settings.smtpPort !== savedSettings.smtpPort ||
        settings.smtpUser !== savedSettings.smtpUser ||
        settings.smtpPassword !== savedSettings.smtpPassword;

      if (smtpChanged && (settings.smtpHost || settings.smtpPort || settings.smtpUser || settings.smtpPassword)) {
        if (!settings.smtpHost || !settings.smtpPort) {
          toast.error("SMTP Host and Port are required to save SMTP settings");
          setSaving(false);
          return;
        }
        try {
          await dataService.testSmtp({
            host: settings.smtpHost,
            port: settings.smtpPort,
            user: settings.smtpUser || "",
            pass: settings.smtpPassword || "",
          });
        } catch (err: any) {
          toast.error(err.message || "SMTP Validation Failed. Changes not saved to prevent corruption.");
          setSaving(false);
          return;
        }
      }

      const clamp = (
        val: unknown,
        key: NumberSettingKey,
        min: number,
        max: number,
      ) => {
        const parsed = Number.parseInt(String(val), 10);
        const fallback = DEFAULT_NOTIFICATION_CONTROL_SETTINGS[key];
        return Number.isNaN(parsed)
          ? fallback
          : Math.min(max, Math.max(min, parsed));
      };

      const payload: NotificationControlSettings = {
        ...settings,
        hoarderAlertStep: clamp(
          settings.hoarderAlertStep,
          "hoarderAlertStep",
          1,
          100,
        ),
        softwareDuplicateAlertStep: clamp(
          settings.softwareDuplicateAlertStep,
          "softwareDuplicateAlertStep",
          2,
          100,
        ),
        lemonAlertCount: clamp(
          settings.lemonAlertCount,
          "lemonAlertCount",
          2,
          100,
        ),
        lemonAlertWindowDays: clamp(
          settings.lemonAlertWindowDays,
          "lemonAlertWindowDays",
          1,
          365,
        ),
        ghostAssetDormantDays: clamp(
          settings.ghostAssetDormantDays,
          "ghostAssetDormantDays",
          30,
          3650,
        ),
        activeHoursTimezone:
          (settings.activeHoursTimezone || "").trim() ||
          DEFAULT_NOTIFICATION_CONTROL_SETTINGS.activeHoursTimezone,
      };

      const updated =
        await dataService.updateNotificationControlSettings(payload);
      setSettings(updated);
      setSavedSettings(updated);
      window.dispatchEvent(
        new CustomEvent("SETTINGS_UPDATED", { detail: updated }),
      );
      toast.success("Admin controls updated");
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Failed to save admin controls");
    } finally {
      setSaving(false);
    }
  };

  const startTimeParts = parse24HourTime(
    settings.activeHoursStart,
    DEFAULT_NOTIFICATION_CONTROL_SETTINGS.activeHoursStart,
  );
  const endTimeParts = parse24HourTime(
    settings.activeHoursEnd,
    DEFAULT_NOTIFICATION_CONTROL_SETTINGS.activeHoursEnd,
  );

  const hourOptions = Array.from({ length: 12 }, (_, index) =>
    String(index + 1).padStart(2, "0"),
  );
  const minuteOptions = Array.from({ length: 60 }, (_, index) =>
    String(index).padStart(2, "0"),
  );
  const timezoneOptions = getTimezoneOptions(settings.activeHoursTimezone);
  const activeHoursEditorDisabled = loading || saving;
  const currentTimezoneLabel = getTimezoneLabel(
    settings.activeHoursTimezone ||
    DEFAULT_NOTIFICATION_CONTROL_SETTINGS.activeHoursTimezone,
  );

  return (
    <>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Admin Control
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">
              Control email notifications, anomaly rule alerts, and future
              system switches
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadSettings}
              disabled={loading || saving}
              className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all">
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 sm:p-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="rounded-lg p-1.5 bg-blue-100">
                <ShieldCheck className="w-4 h-4 text-blue-700" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-blue-900">
                  Enable Email Notifications
                </p>
                <p className="text-xs mt-0.5 text-blue-700">
                  Master switch for all maintenance, license expiry, and anomaly
                  emails
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={loading || saving}
              onClick={() => {
                const isGmail = (settings.smtpHost || "smtp.gmail.com").includes("gmail.com");
                if (!settings.enableEmailNotifications && isGmail && (!settings.smtpUser || !settings.smtpPassword)) {
                  toast.error("Cannot enable email notifications: Gmail SMTP Username and Password are required. Please configure them below.");
                  return;
                }
                updateFlag("enableEmailNotifications");
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.enableEmailNotifications
                ? "bg-blue-700"
                : "bg-blue-300"
                }`}>
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.enableEmailNotifications
                  ? "translate-x-6"
                  : "translate-x-1"
                  }`}
              />
            </button>
          </div>

          {!settings.enableEmailNotifications && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-xs sm:text-sm">
                {(() => {
                  const isGmail = (settings.smtpHost || "smtp.gmail.com").includes("gmail.com");
                  if (isGmail && (!settings.smtpUser || !settings.smtpPassword)) {
                    return (
                      <span>
                        Email delivery is disabled because <strong>Gmail SMTP credentials are not configured</strong>. Please set them up under <em>Advanced Settings &gt; Email Server (SMTP)</em> or configure your environment variables.
                      </span>
                    );
                  }
                  return (
                    <span>
                      Email delivery is disabled. Website notifications and tracking views are still available.
                    </span>
                  );
                })()}
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Configuration Sections
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setActiveSection("email-channels")}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${activeSection === "email-channels"
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}>
              <Bell className="w-4 h-4" />
              Email Channels
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("anomaly-controls")}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${activeSection === "anomaly-controls"
                ? "border-orange-200 bg-orange-50 text-orange-700"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}>
              <AlertTriangle className="w-4 h-4" />
              Anomaly Controls
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("advanced-settings")}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${activeSection === "advanced-settings"
                ? "border-purple-200 bg-purple-50 text-purple-700"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}>
              <Settings2 className="w-4 h-4" />
              Advanced Settings
            </button>
          </div>
        </div>

        {activeSection === "email-channels" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2 text-gray-900">
              <Bell className="w-4.5 h-4.5 text-blue-600" />
              <h2 className="text-base font-semibold">Email Channels</h2>
            </div>

            <ToggleRow
              title="Manual Send Now"
              description="Allow manual dispatch from Scheduled Mails"
              icon={Bell}
              enabled={settings.enableManualDispatch}
              disabled={!settings.enableEmailNotifications || loading || saving}
              onToggle={() => updateFlag("enableManualDispatch")}
            />

            <ToggleRow
              title="Active Time Window"
              description={
                settings.enableActiveTimeWindow
                  ? `Active time set: ${startTimeParts.hour}:${startTimeParts.minute} ${startTimeParts.period} to ${endTimeParts.hour}:${endTimeParts.minute} ${endTimeParts.period} (${currentTimezoneLabel})`
                  : "Disabled: notifications and manual dispatch are allowed 24 hours."
              }
              icon={Clock3}
              enabled={settings.enableActiveTimeWindow}
              disabled={!settings.enableEmailNotifications || loading || saving}
              onToggle={() => updateFlag("enableActiveTimeWindow")}
            />

            <ToggleRow
              title="Maintenance Alerts"
              description="Reminder, action-today, and overdue maintenance emails"
              icon={Wrench}
              enabled={settings.enableMaintenanceAlerts}
              disabled={!settings.enableEmailNotifications || loading || saving}
              onToggle={() => updateFlag("enableMaintenanceAlerts")}
            />

            <ToggleRow
              title="License Expiry Alerts"
              description="30-day, 7-day, and 1-day software license expiry emails"
              icon={KeyRound}
              enabled={settings.enableLicenseExpiryAlerts}
              disabled={!settings.enableEmailNotifications || loading || saving}
              onToggle={() => updateFlag("enableLicenseExpiryAlerts")}
            />

            <ToggleRow
              title="User Creation Notifications"
              description="Automatic welcome emails with login credentials for new accounts"
              icon={Users}
              enabled={settings.enableUserCreationAlerts}
              disabled={!settings.enableEmailNotifications || loading || saving}
              onToggle={() => updateFlag("enableUserCreationAlerts")}
            />
          </div>
        )}

        {activeSection === "anomaly-controls" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2 text-gray-900">
              <AlertTriangle className="w-4.5 h-4.5 text-orange-600" />
              <h2 className="text-base font-semibold">Anomaly Controls</h2>
            </div>

            <ToggleRow
              title="Anomaly Alerts"
              description="Master switch for all anomaly emails"
              icon={Settings2}
              enabled={settings.enableAnomalyAlerts}
              disabled={!settings.enableEmailNotifications || loading || saving}
              onToggle={() => updateFlag("enableAnomalyAlerts")}
            />

            <ToggleRow
              title="Hoarder Rule"
              description={`Alerts every ${settings.hoarderAlertStep || DEFAULT_NOTIFICATION_CONTROL_SETTINGS.hoarderAlertStep} same-type active allocations`}
              icon={Users}
              enabled={settings.enableHoarderAlerts}
              disabled={
                !settings.enableEmailNotifications ||
                !settings.enableAnomalyAlerts ||
                loading ||
                saving
              }
              onToggle={() => updateFlag("enableHoarderAlerts")}
            />

            <ToggleRow
              title="Lemon Rule"
              description={`Alerts when an asset breaks down ${settings.lemonAlertCount || DEFAULT_NOTIFICATION_CONTROL_SETTINGS.lemonAlertCount} times within ${settings.lemonAlertWindowDays || DEFAULT_NOTIFICATION_CONTROL_SETTINGS.lemonAlertWindowDays} days`}
              icon={Wrench}
              enabled={settings.enableLemonAlerts}
              disabled={
                !settings.enableEmailNotifications ||
                !settings.enableAnomalyAlerts ||
                loading ||
                saving
              }
              onToggle={() => updateFlag("enableLemonAlerts")}
            />

            <ToggleRow
              title="Software Duplicate Rule"
              description={`Alerts every ${settings.softwareDuplicateAlertStep || DEFAULT_NOTIFICATION_CONTROL_SETTINGS.softwareDuplicateAlertStep} duplicate active software allocations`}
              icon={Copy}
              enabled={settings.enableSoftwareDuplicateAlerts}
              disabled={
                !settings.enableEmailNotifications ||
                !settings.enableAnomalyAlerts ||
                loading ||
                saving
              }
              onToggle={() => updateFlag("enableSoftwareDuplicateAlerts")}
            />

            <ToggleRow
              title="Ghost Asset Rule"
              description={`Alerts for available assets dormant ${settings.ghostAssetDormantDays || DEFAULT_NOTIFICATION_CONTROL_SETTINGS.ghostAssetDormantDays}+ days (weekly scan)`}
              icon={Ghost}
              enabled={settings.enableGhostAssetAlerts}
              disabled={
                !settings.enableEmailNotifications ||
                !settings.enableAnomalyAlerts ||
                loading ||
                saving
              }
              onToggle={() => updateFlag("enableGhostAssetAlerts")}
            />
          </div>
        )}

        {activeSection === "advanced-settings" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
              <ToggleRow
                title="Location Allocation"
                description="Allow allocating assets directly to a location instead of a user"
                icon={MapPin}
                enabled={settings.enableLocationAllocation}
                disabled={loading || saving}
                onToggle={() => updateFlag("enableLocationAllocation")}
              />
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
              <div
                className={`rounded-xl border ${!settings.enableEmailNotifications ||
                  !settings.enableActiveTimeWindow
                  ? "border-gray-200 bg-gray-50"
                  : "border-blue-100 bg-blue-50/40"
                  }`}>
                <button
                  type="button"
                  onClick={() => setTimeWindowOpen((o) => !o)}
                  className="w-full flex items-center justify-between p-3 sm:p-3.5 text-left no-push">
                  <div>
                    <div className="flex items-center gap-2">
                      <Clock3 className="w-4 h-4 text-blue-600" />
                      <p className="text-sm font-semibold text-gray-800">
                        Active Time Window
                      </p>
                    </div>
                    {!timeWindowOpen && (
                      <p className="text-xs text-gray-500 mt-1 ml-6">
                        {startTimeParts.hour}:{startTimeParts.minute}{" "}
                        {startTimeParts.period} → {endTimeParts.hour}:
                        {endTimeParts.minute} {endTimeParts.period} ·{" "}
                        {currentTimezoneLabel}
                      </p>
                    )}
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                </button>

                {timeWindowOpen && (
                  <div className="p-3 sm:p-4 border-t border-gray-200">
                    <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-800">
                      <p className="font-semibold mb-1">Alert Dispatch Rules:</p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li><strong>Shows Immediately (Bypasses window):</strong> Password Resets, Welcome emails, Urgent Troubleshooting, and Manual sends.</li>
                        <li><strong>Stops & Queues:</strong> Maintenance alerts, License Expiry alerts, and standard notifications triggered outside active hours (they auto-dispatch when the window opens).</li>
                      </ul>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-gray-200 bg-white p-3.5 sm:p-4">
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                          Start time
                        </p>
                        <div className="grid grid-cols-[1fr_auto_1fr_1fr] gap-2.5 items-center">
                          <ThemedSelect
                            value={startTimeParts.hour}
                            onChange={(value) =>
                              updateTimeByPart(
                                "activeHoursStart",
                                "hour",
                                value,
                              )
                            }
                            options={hourOptions}
                            disabled={activeHoursEditorDisabled}
                          />
                          <span className="text-sm font-semibold text-gray-500">
                            :
                          </span>
                          <ThemedSelect
                            value={startTimeParts.minute}
                            onChange={(value) =>
                              updateTimeByPart(
                                "activeHoursStart",
                                "minute",
                                value,
                              )
                            }
                            options={minuteOptions}
                            disabled={activeHoursEditorDisabled}
                          />
                          <ThemedSelect
                            value={startTimeParts.period}
                            onChange={(value) =>
                              updateTimeByPart(
                                "activeHoursStart",
                                "period",
                                value,
                              )
                            }
                            options={["AM", "PM"]}
                            disabled={activeHoursEditorDisabled}
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-white p-3.5 sm:p-4">
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                          End time
                        </p>
                        <div className="grid grid-cols-[1fr_auto_1fr_1fr] gap-2.5 items-center">
                          <ThemedSelect
                            value={endTimeParts.hour}
                            onChange={(value) =>
                              updateTimeByPart("activeHoursEnd", "hour", value)
                            }
                            options={hourOptions}
                            disabled={activeHoursEditorDisabled}
                          />
                          <span className="text-sm font-semibold text-gray-500">
                            :
                          </span>
                          <ThemedSelect
                            value={endTimeParts.minute}
                            onChange={(value) =>
                              updateTimeByPart(
                                "activeHoursEnd",
                                "minute",
                                value,
                              )
                            }
                            options={minuteOptions}
                            disabled={activeHoursEditorDisabled}
                          />
                          <ThemedSelect
                            value={endTimeParts.period}
                            onChange={(value) =>
                              updateTimeByPart(
                                "activeHoursEnd",
                                "period",
                                value,
                              )
                            }
                            options={["AM", "PM"]}
                            disabled={activeHoursEditorDisabled}
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-white p-3.5 sm:p-4 lg:col-span-2">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                            Timezone
                          </span>
                          <button
                            type="button"
                            disabled={activeHoursEditorDisabled}
                            onClick={() => {
                              const detected =
                                Intl.DateTimeFormat().resolvedOptions()
                                  .timeZone;
                              updateTimezone(detected);
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-50 transition-all"
                            title={`Auto-detect: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}>
                            <Clock3 className="w-3 h-3" />
                            Use My Timezone
                          </button>
                        </div>
                        <div className="mt-2">
                          <ThemedSelect
                            value={settings.activeHoursTimezone}
                            onChange={updateTimezone}
                            options={timezoneOptions}
                            disabled={activeHoursEditorDisabled}
                          />
                        </div>
                        <p className="text-xs text-gray-400 mt-1.5">
                          Detected:{" "}
                          <span className="font-medium text-gray-500">
                            {Intl.DateTimeFormat().resolvedOptions().timeZone}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2.5 sm:p-3">
              <div
                className={`rounded-xl border ${!settings.enableEmailNotifications ||
                  !settings.enableAnomalyAlerts
                  ? "border-gray-200 bg-gray-50"
                  : "border-orange-100 bg-orange-50/40"
                  }`}>
                <button
                  type="button"
                  onClick={() => setAnomalyThresholdsOpen((o) => !o)}
                  className="w-full flex items-center justify-between p-3 sm:p-3.5 text-left no-push">
                  <div>
                    <div className="flex items-center gap-2">
                      <Settings2 className="w-4 h-4 text-orange-600" />
                      <p className="text-sm font-semibold text-gray-800">
                        Anomaly Thresholds
                      </p>
                    </div>
                    {!anomalyThresholdsOpen && (
                      <p className="text-xs text-gray-500 mt-1.5 ml-6">
                        Hoarder ×{settings.hoarderAlertStep} · Duplicate ×
                        {settings.softwareDuplicateAlertStep} · Lemon ×
                        {settings.lemonAlertCount} in{" "}
                        {settings.lemonAlertWindowDays}d · Ghost{" "}
                        {settings.ghostAssetDormantDays}d
                      </p>
                    )}
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                </button>

                {anomalyThresholdsOpen && (
                  <div className="p-3 sm:p-4 border-t border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="flex flex-col gap-2">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          Hoarder step{" "}
                          <span className="lowercase font-normal italic text-gray-500 ml-1">
                            (Threshold for excessive asset holding)
                          </span>
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={settings.hoarderAlertStep}
                          onChange={(e) =>
                            updateNumberSetting(
                              "hoarderAlertStep",
                              e.target.value,
                            )
                          }
                          onBlur={() =>
                            handleNumberBlur("hoarderAlertStep", 1, 100)
                          }
                          disabled={loading || saving}
                          className="px-4 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                          placeholder="e.g. 3"
                        />
                      </label>

                      <label className="flex flex-col gap-2">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          Software duplicate step{" "}
                          <span className="lowercase font-normal italic text-gray-500 ml-1">
                            (Limit for redundant software licenses)
                          </span>
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={settings.softwareDuplicateAlertStep}
                          onChange={(e) =>
                            updateNumberSetting(
                              "softwareDuplicateAlertStep",
                              e.target.value,
                            )
                          }
                          onBlur={() =>
                            handleNumberBlur(
                              "softwareDuplicateAlertStep",
                              2,
                              100,
                            )
                          }
                          disabled={loading || saving}
                          className="px-4 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                          placeholder="e.g. 2"
                        />
                      </label>

                      <label className="flex flex-col gap-2">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          Lemon alert count{" "}
                          <span className="lowercase font-normal italic text-gray-500 ml-1">
                            (Failures to trigger alert)
                          </span>
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={settings.lemonAlertCount}
                          onChange={(e) =>
                            updateNumberSetting(
                              "lemonAlertCount",
                              e.target.value,
                            )
                          }
                          onBlur={() =>
                            handleNumberBlur("lemonAlertCount", 2, 100)
                          }
                          disabled={loading || saving}
                          className="px-4 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                          placeholder="e.g. 3"
                        />
                      </label>

                      <label className="flex flex-col gap-2">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          Lemon window (days){" "}
                          <span className="lowercase font-normal italic text-gray-500 ml-1">
                            (Window to detect recurring failures)
                          </span>
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={settings.lemonAlertWindowDays}
                          onChange={(e) =>
                            updateNumberSetting(
                              "lemonAlertWindowDays",
                              e.target.value,
                            )
                          }
                          onBlur={() =>
                            handleNumberBlur("lemonAlertWindowDays", 1, 365)
                          }
                          disabled={loading || saving}
                          className="px-4 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                          placeholder="e.g. 14"
                        />
                      </label>

                      <label className="flex flex-col gap-2">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          Ghost dormant (days){" "}
                          <span className="lowercase font-normal italic text-gray-500 ml-1">
                            (Days until flagged as inactive)
                          </span>
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={settings.ghostAssetDormantDays}
                          onChange={(e) =>
                            updateNumberSetting(
                              "ghostAssetDormantDays",
                              e.target.value,
                            )
                          }
                          onBlur={() =>
                            handleNumberBlur("ghostAssetDormantDays", 30, 3650)
                          }
                          disabled={loading || saving}
                          className="px-4 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                          placeholder="e.g. 365"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2.5 sm:p-3">
              <div
                className={`rounded-xl border ${!settings.enableEmailNotifications
                  ? "border-gray-200 bg-gray-50"
                  : "border-purple-100 bg-purple-50/40"
                  }`}>
                <button
                  type="button"
                  onClick={() => setEmailServerOpen((o) => !o)}
                  className="w-full flex items-center justify-between p-3 sm:p-3.5 text-left no-push">
                  <div>
                    <div className="flex items-center gap-2">
                      <Settings2 className="w-4 h-4 text-purple-600" />
                      <p className="text-sm font-semibold text-gray-800">
                        Email Server (SMTP)
                      </p>
                    </div>
                    {!emailServerOpen && (
                      <p className="text-xs text-gray-500 mt-1.5 ml-6">
                        {settings.smtpHost || "Using Environment Variables"}
                      </p>
                    )}
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                </button>

                {emailServerOpen && (
                  <div className="p-3 sm:p-4 border-t border-gray-200 space-y-4">
                    <p className="text-sm text-gray-500">
                      Configure the SMTP server used for sending outgoing
                      emails. If left blank, the system will use environment
                      variables. For internal Exchange or SMTP relays, you may leave the username and password blank for an unauthenticated connection.
                    </p>

                    <div className="pt-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                        Provider Presets
                      </p>
                      <div className="flex flex-wrap gap-2.5">
                        {[
                          { name: "Gmail", host: "smtp.gmail.com", port: "587" },
                          { name: "Outlook", host: "smtp-mail.outlook.com", port: "587" },
                          { name: "Yahoo", host: "smtp.mail.yahoo.com", port: "587" },
                          { name: "Office365", host: "smtp.office365.com", port: "587" },
                          { name: "Internal Relay", host: "exchange.local", port: "25" },
                        ].map((preset) => (
                          <button
                            key={preset.name}
                            type="button"
                            disabled={loading || saving}
                            onClick={() => {
                              updateStringSetting("smtpHost", preset.host);
                              updateStringSetting("smtpPort", preset.port);
                              if (preset.name === "Internal Relay") {
                                updateStringSetting("smtpUser", "");
                                updateStringSetting("smtpPassword", "");
                              }
                            }}
                            className="px-4 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-full hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 mt-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
                        Server & Credentials
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          SMTP Host
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. smtp.gmail.com"
                          value={settings.smtpHost || ""}
                          onChange={(e) =>
                            updateStringSetting("smtpHost", e.target.value)
                          }
                          disabled={loading || saving}
                          className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          SMTP Port
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 465, 587, or 25"
                          value={settings.smtpPort || ""}
                          onChange={(e) =>
                            updateStringSetting("smtpPort", e.target.value)
                          }
                          disabled={loading || saving}
                          className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          SMTP Username
                        </label>
                        <input
                          type="text"
                          placeholder="Leave blank for internal relay / env var"
                          value={settings.smtpUser || ""}
                          onChange={(e) =>
                            updateStringSetting("smtpUser", e.target.value)
                          }
                          disabled={loading || saving}
                          className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          SMTP Password
                        </label>
                        <input
                          type="password"
                          placeholder="Leave blank for internal relay / env var"
                          value={settings.smtpPassword || ""}
                          onChange={(e) =>
                            updateStringSetting("smtpPassword", e.target.value)
                          }
                          disabled={loading || saving}
                          className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow text-sm font-mono tracking-wider placeholder:tracking-normal placeholder:font-sans"
                        />
                      </div>
                      <div className="sm:col-span-2 flex justify-end mt-4">
                        <button
                          onClick={handleTestSmtp}
                          disabled={testingSmtp || loading || saving}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm">
                          {testingSmtp ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <ShieldCheck className="w-4 h-4" />
                          )}
                          Test Connection
                        </button>
                      </div>
                    </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-red-200 p-3 sm:p-4 mt-4">
              <div
                className="flex items-center justify-between cursor-pointer group"
                onClick={() => setDataMaintenanceOpen(!dataMaintenanceOpen)}>
                <div className="flex items-start gap-3">
                  <div className="rounded-lg p-1.5 bg-red-100 mt-0.5 group-hover:bg-red-200 transition-colors shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-700" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">
                      Data Maintenance
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5 pr-4">
                      Permanently delete old audit logs to optimize database
                      storage.
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-gray-400 transition-transform shrink-0 ${dataMaintenanceOpen ? "rotate-180" : ""}`}
                />
              </div>

              {dataMaintenanceOpen && (
                <div className="p-3 sm:p-4 border-t border-gray-200 mt-2 space-y-4">
                  <p className="text-sm text-gray-600 mb-4">
                    This action is irreversible, but the mass deletion event
                    itself will be logged for compliance.
                  </p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="w-full sm:w-64">
                      <ThemedSelect
                        value={auditLogsMonthsToDelete}
                        onChange={setAuditLogsMonthsToDelete}
                        options={[
                          { value: "1", label: "Older than 1 month" },
                          { value: "3", label: "Older than 3 months" },
                          { value: "6", label: "Older than 6 months" },
                          { value: "12", label: "Older than 1 year" },
                          { value: "24", label: "Older than 2 years" },
                        ]}
                        disabled={clearingLogs || loading || saving}
                      />
                    </div>
                    <button
                      onClick={handleClearAuditLogs}
                      disabled={clearingLogs || loading || saving}
                      className="flex items-center justify-center gap-2 px-4 h-10 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors whitespace-nowrap shadow-sm">
                      {clearingLogs ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <AlertTriangle className="w-4 h-4" />
                      )}
                      Clear Audit Logs
                    </button>
                  </div>

                  {exportsList && exportsList.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-gray-200">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">
                        Past Deletion Records
                      </h4>
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                        {exportsList.map((exp, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-800">
                                {exp.originalName}
                              </span>
                              <span className="text-xs text-gray-500">
                                {new Date(exp.createdAt).toLocaleString()}
                              </span>
                              <span className="text-xs text-gray-500">
                                Size: {(exp.size / 1024).toFixed(2)} KB
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleViewExport(
                                    exp.filename,
                                    exp.originalName,
                                  )
                                }
                                disabled={viewingExport === exp.filename}
                                className="flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-slate-50 px-3 py-1.5 rounded-md hover:bg-slate-100 transition-colors disabled:opacity-50">
                                <Eye className="w-4 h-4" />
                                {viewingExport === exp.filename
                                  ? "Opening..."
                                  : "View"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {/* Floating Save Action Bar */}
      <AnimatePresence>
        {isDirty && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
            <div className="bg-white border-2 border-blue-500 rounded-2xl p-3 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xl pointer-events-auto w-full max-w-2xl">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-xl shrink-0">
                  <Settings2 className="w-5 h-5 text-blue-700" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    Unsaved Changes
                  </p>
                  <p className="text-xs text-gray-500 font-medium">
                    Ready to save your new configuration
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setSettings(savedSettings)}
                  disabled={loading || saving}
                  className="px-4 py-2 text-sm font-bold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors flex-1 sm:flex-none disabled:opacity-50">
                  Cancel
                </button>
                <button
                  onClick={saveChanges}
                  disabled={loading || saving}
                  className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 flex-1 sm:flex-none shadow-md hover:shadow-lg disabled:opacity-50">
                  {saving ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save Changes
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
