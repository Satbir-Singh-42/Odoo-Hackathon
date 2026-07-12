'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSmartDropdownPosition } from '@/hooks/useSmartDropdownPosition';
import {
  Search,
  Filter,
  X,
  ChevronRight,
  ChevronDown,
  Clock,
  RefreshCw,
  FileText,
  Download,
  User,
  Globe,
  Mail,
  Monitor,
  Hash,
  Tag,
  Activity,
  ArrowRight,
  Database,
  Info,
  CheckCircle2,
  Copy,
  Check,
  ArrowRightLeft,
  Plus,
  Trash2,
  RotateCcw,
  Shield,
  Wrench,
  ExternalLink,
  XCircle,
} from "lucide-react";
import { AuditLog as AuditLogType, Asset, MaintenanceRecord } from '@/types';
import { toast } from "sonner";
import dataService from '@/lib/dataService';
import { useDebounce } from '@/hooks/useDebounce';
import { motion, AnimatePresence } from "framer-motion";
import { formatCSVDateTime } from '@/lib/utils/csvHelpers';
import { openDataView } from '@/lib/utils/dataViewHelpers';
import { formatDisplayDateTime, toDateInputValue } from '@/lib/utils/dateHelpers';
import { getErrorMessage } from '@/lib/utils/errorHelpers';
import { formatCurrencyValue } from '@/lib/utils/formatCurrency';
import { Pagination, DEFAULT_PAGE_SIZE } from '@/components/ui/pagination';
import { getPillBadgeClass } from '@/components/ui/StatusBadge';

// =============================================
// HELPERS
// =============================================

const formatDate = (dateString: string) => formatDisplayDateTime(dateString);

const getActionColor = (action: string): string => {
  const a = action?.toUpperCase() || "";
  if (a.includes("CREATE") || a.includes("INSERT") || a.includes("ADD"))
    return "bg-green-100 text-green-800 border-green-200";
  if (a.includes("UPDATE") || a.includes("EDIT") || a.includes("MODIFY"))
    return "bg-blue-100 text-blue-800 border-blue-200";
  if (a.includes("DELETE") || a.includes("REMOVE") || a.includes("DISPOSE"))
    return "bg-red-100 text-red-800 border-red-200";
  if (a.includes("ALLOCAT") || a.includes("ASSIGN"))
    return "bg-purple-100 text-purple-800 border-purple-200";
  if (a.includes("RETURN") || a.includes("REVOKE"))
    return "bg-amber-100 text-amber-800 border-amber-200";
  if (a.includes("LICENSE"))
    return "bg-teal-100 text-teal-800 border-teal-200";
  if (a.includes("MAINTENANCE"))
    return "bg-teal-100 text-teal-800 border-teal-200";
  if (a.includes("LOGIN") || a.includes("LOGOUT") || a.includes("AUTH"))
    return "bg-cyan-100 text-cyan-800 border-cyan-200";
  return "bg-gray-100 text-gray-800 border-gray-200";
};

// Short, human-readable labels for raw action strings
const ACTION_LABEL_MAP: Record<string, string> = {
  ASSET_INSERT: "Asset Insert",
  MAINTENANCE_SCHEDULE: "Maintenance",
  MAINTENANCE_UPDATE: "Maintenance Update",
  MAINTENANCE_CANCEL: "Maintenance Cancel",
  MAINTENANCE_START: "Maintenance Start",
  MAINTENANCE_END: "Maintenance End",
  LICENSE_RENEWED: "License Renewed",
  ASSET_CREATE: "Created",
  ASSET_UPDATE: "Updated",
  ASSET_DELETE: "Deleted",
  DELETION: "Deleted",
  ASSET_DISPOSE: "Disposed",
  ASSET_ALLOCATE: "Allocated",
  ASSET_RETURN: "Returned",
  LOGIN: "Login",
  LOGOUT: "Logout",
};

const formatActionBadge = (action: string): string => {
  if (!action) return "—";
  if (ACTION_LABEL_MAP[action.toUpperCase()])
    return ACTION_LABEL_MAP[action.toUpperCase()];
  // Fallback: replace underscores with spaces, title-case each word
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const truncateJSON = (str: string | null, maxLen = 120): string => {
  if (!str) return "—";
  try {
    const parsed = JSON.parse(str);
    const formatted = JSON.stringify(parsed);
    return formatted.length > maxLen
      ? formatted.substring(0, maxLen) + "…"
      : formatted;
  } catch {
    return str.length > maxLen ? str.substring(0, maxLen) + "…" : str;
  }
};

const formatJSON = (str: string | null): string => {
  if (!str) return "No data";
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
};

// Humanize camelCase/snake_case keys into readable labels
const ACRONYM_MAP: Record<string, string> = {
  ram: "RAM",
  ip: "IP",
  mac: "MAC",
  os: "OS",
  cpu: "CPU",
  gpu: "GPU",
  ssd: "SSD",
  hdd: "HDD",
  url: "URL",
  api: "API",
  id: "ID",
  usb: "USB",
};
const humanizeKey = (key: string): string => {
  const humanized = key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
  // Replace any word that is a known acronym with its uppercase form
  return humanized.replace(/\b\w+\b/g, (word) => {
    const lower = word.toLowerCase();
    return ACRONYM_MAP[lower] || word;
  });
};

// Get an icon for common JSON keys
const getKeyIcon = (key: string) => {
  const k = key.toLowerCase();
  if (
    k.includes("user") ||
    k.includes("employee") ||
    k.includes("by") ||
    k.includes("role")
  )
    return <User className="w-3.5 h-3.5" />;
  if (k.includes("url") || k.includes("ip") || k.includes("host"))
    return <Globe className="w-3.5 h-3.5" />;
  if (k.includes("agent") || k.includes("browser"))
    return <Monitor className="w-3.5 h-3.5" />;
  if (k.includes("id") || k.includes("code"))
    return <Hash className="w-3.5 h-3.5" />;
  if (k.includes("status") || k.includes("action") || k.includes("method"))
    return <Activity className="w-3.5 h-3.5" />;
  if (k.includes("date") || k.includes("time") || k.includes("duration"))
    return <Clock className="w-3.5 h-3.5" />;
  if (
    k.includes("name") ||
    k.includes("type") ||
    k.includes("category") ||
    k.includes("label")
  )
    return <Tag className="w-3.5 h-3.5" />;
  if (k.includes("table")) return <Database className="w-3.5 h-3.5" />;
  return <ArrowRight className="w-3.5 h-3.5" />;
};

// =============================================
// DIFF / CHANGE DETECTION HELPERS
// =============================================

interface FieldChange {
  key: string;
  oldVal: unknown;
  newVal: unknown;
  type: "modified" | "added" | "removed";
}

/** Parse a JSON string safely; returns null if not valid JSON */
const safeParse = (str: string | null): Record<string, unknown> | null => {
  if (!str) return null;
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed))
      return parsed;
    return null;
  } catch {
    return null;
  }
};

/** Extract the asset/record name from a log entry — prefers server-resolved name */
const getLogAssetName = (log: AuditLogType): string | null => {
  // Server JOIN provides asset name for all asset/maintenance/allocation records
  if (log.assetName) {
    // Include asset code if available for better identification
    if (log.assetCode) return `${log.assetName} · ${log.assetCode}`;
    return log.assetName;
  }

  // For User table records, show the target user's name
  if (log.targetUserName) return log.targetUserName;
  // For Vendor table records, show the vendor name
  if (log.targetVendorName) return log.targetVendorName;

  // Fallback: parse from stored JSON values
  const newObj = safeParse(log.newValue);
  const oldObj = safeParse(log.oldValue);
  const name =
    (newObj?.assetName as string) ||
    (oldObj?.assetName as string) ||
    (newObj?.name as string) ||
    (oldObj?.name as string) ||
    (newObj?.fullName as string) ||
    (oldObj?.fullName as string) ||
    (newObj?.vendorName as string) ||
    (oldObj?.vendorName as string) ||
    (newObj?.assetCode as string) ||
    (oldObj?.assetCode as string) ||
    null;
  return name;
};

const getPrimaryEntityName = (log: AuditLogType): string | null =>
  log.assetName || log.targetUserName || log.targetVendorName || null;

const getNameFromAuditObject = (
  obj: Record<string, unknown> | null,
): string => {
  if (!obj) return "";

  // Support both camelCase and PascalCase payload keys from different writers.
  const keys = [
    "assetName",
    "AssetName",
    "unitName",
    "UnitName",
    "name",
    "Name",
    "fullName",
    "FullName",
    "vendorName",
    "VendorName",
    "userName",
    "UserName",
    "assetCode",
    "AssetCode",
  ];

  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
};

const isEmpty = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const computeChanges = (
  oldStr: string | null,
  newStr: string | null,
): FieldChange[] | null => {
  const oldObj = safeParse(oldStr);
  const newObj = safeParse(newStr);
  if (!oldObj && !newObj) return null;
  if (!oldObj || !newObj) return null; // can't diff if one side isn't JSON

  // Keys that are metadata (used for display/badge), not real changes
  const metadataKeys = new Set(["assetName", "name", "fullName", "vendorName"]);
  const changes: FieldChange[] = [];
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    // Hide allocationId completely from the diff view
    if (key === "allocationId") continue;

    // Skip metadata keys that are added for audit display consistency
    if (metadataKeys.has(key) && oldObj[key] === newObj[key]) continue;

    const oldVal = oldObj[key];
    const newVal = newObj[key];
    const oldExists = key in oldObj;
    const newExists = key in newObj;

    // Skip if both values are effectively empty/null
    if (isEmpty(oldVal) && isEmpty(newVal)) continue;

    if (oldExists && !newExists) {
      if (!isEmpty(oldVal))
        changes.push({ key, oldVal, newVal: undefined, type: "removed" });
    } else if (!oldExists && newExists) {
      if (!isEmpty(newVal))
        changes.push({ key, oldVal: undefined, newVal, type: "added" });
    } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ key, oldVal, newVal, type: "modified" });
    }
  }
  return changes.length > 0 ? changes : [];
};

/** Get a human-readable one-line summary of changes for table preview */
const getChangeSummaryText = (log: AuditLogType): string => {
  const action = log.action?.toUpperCase() || "";
  const table = log.table?.toLowerCase() || "";

  if (action.includes("ASSET_INSERT")) {
    const newObj = safeParse(log.newValue);
    const name =
      getPrimaryEntityName(log) || getNameFromAuditObject(newObj) || "asset";
    const insertedUnits =
      Number(newObj?.insertedUnits || newObj?.addedUnits) || null;
    if (insertedUnits) {
      return `${insertedUnits} unit(s) inserted to ${name}`;
    }
    return `Asset insert event: ${name}`;
  }

  // For CREATE/DELETE, describe the action simply
  if (
    action.includes("CREATE") ||
    action.includes("INSERT") ||
    action.includes("ADD")
  ) {
    const newObj = safeParse(log.newValue);
    const name =
      getPrimaryEntityName(log) || getNameFromAuditObject(newObj) || "";

    if (name) {
      if (action.includes("INSERT") && table.includes("asset")) {
        return `Inserted asset: ${name}`;
      }
      return `Created: ${name}`;
    }

    if (action.includes("INSERT") && table.includes("asset")) {
      return "New asset inserted";
    }
    return "New record created";
  }

  if (action.includes("DELETE") || action.includes("REMOVE")) {
    const oldObj = safeParse(log.oldValue);
    const name =
      getPrimaryEntityName(log) || getNameFromAuditObject(oldObj) || "";
    if (name) return `Deleted: ${name}`;
    return "Record deleted";
  }

  if (action.includes("DISPOSE")) {
    const newObj = safeParse(log.newValue);
    const oldObj = safeParse(log.oldValue);
    const name = oldObj?.assetName || newObj?.assetName || "";
    const reason = newObj?.reason || "";
    if (name && reason) return `Disposed ${name}: ${reason}`;
    if (name) return `Disposed: ${name}`;
    return "Asset disposed";
  }

  if (action.includes("ALLOCAT") || action.includes("ASSIGN")) {
    const newObj = safeParse(log.newValue);
    if (newObj) {
      // Prefer human-readable names over raw IDs
      let target =
        (newObj.employeeName as string) ||
        (newObj.userName as string) ||
        (newObj.parentAssetName as string);

      if (!target && newObj.installationLocation) {
        target = `Location: ${newObj.installationLocation}`;
      }

      if (!target) {
        target = (newObj.employeeId as string) || (newObj.parentAssetId as string) || "";
      }

      return target ? `Allocated to ${target}` : "Asset allocated";
    }
    return "Asset allocated";
  }

  if (action.includes("RETURN") || action.includes("REVOKE")) {
    const newObj = safeParse(log.newValue);
    if (newObj) {
      const condition = newObj.conditionAtReturn || "";
      return condition ? `Returned (${condition})` : "Asset returned";
    }
    return "Asset returned";
  }

  if (action.includes("MAINTENANCE")) {
    const newObj = safeParse(log.newValue);
    if (newObj) {
      const desc = newObj.description || newObj.newStatus || "";
      return desc ? `Maintenance: ${desc}` : "Maintenance action";
    }
    return "Maintenance action";
  }

  if (action.includes("LICENSE_RENEW")) {
    const newObj = safeParse(log.newValue);
    if (newObj) {
      const cost = newObj.renewalCost;
      const expiry = newObj.licenseExpiryDate;
      const parts = [];
      if (cost !== undefined && cost !== null && cost !== "") {
        parts.push(`₹${formatCurrencyValue(Number(cost))}`);
      }
      if (expiry) {
        parts.push(`expiry ${formatDate(String(expiry))}`);
      }
      return parts.length > 0 ? `License renewed: ${parts.join(", ")}` : "License renewed";
    }
    return "License renewed";
  }

  // For UPDATE, show what changed
  if (
    action.includes("UPDATE") ||
    action.includes("EDIT") ||
    action.includes("MODIFY")
  ) {
    const changes = computeChanges(log.oldValue, log.newValue);
    if (changes && changes.length > 0) {
      const first = changes[0];
      const label = humanizeKey(first.key);
      const summary = `${label}: ${formatValue(first.oldVal, first.key)} → ${formatValue(first.newVal, first.key)}`;
      if (changes.length > 1) return `${summary} (+${changes.length - 1} more)`;
      return summary;
    }
    return "Record updated";
  }

  // Password reset
  if (action.includes("PASSWORD")) {
    const newObj = safeParse(log.newValue);
    if (newObj) {
      const user = newObj.employeeId || "";
      return user ? `Password reset: ${user}` : "Password reset";
    }
    return "Password reset";
  }

  // Login/Logout/auth
  if (
    action.includes("LOGIN") ||
    action.includes("LOGOUT") ||
    action.includes("AUTH")
  ) {
    return "Authentication event";
  }

  // Anomaly / Automated Emails
  if (
    action.includes("EMAIL_SENT") ||
    action.includes("EMAIL_SUPPRESSED") ||
    log.table?.toLowerCase().includes("email")
  ) {
    const newObj = safeParse(log.newValue);
    if (newObj) {
      if (typeof newObj.alertCount === "number")
        return `User reached ${newObj.alertCount} identical assets limit`;
      if (typeof newObj.failureCount === "number")
        return `Asset failed ${newObj.failureCount} times in ${newObj.daysBetween} days`;
      if (typeof newObj.daysUnused === "number")
        return `Asset inactive for ${newObj.daysUnused} days`;
      if (newObj.softwareName)
        return `Duplicate software assigned: ${newObj.softwareName}`;
      if (newObj.assetName) return `Automated alert for ${newObj.assetName}`;
    }
    return action.includes("EMAIL_SUPPRESSED")
      ? "Automated anomaly email suppressed"
      : "Automated anomaly email sent";
  }

  return "—";
};

/** Get a human-readable action description with icon */
const getActionDescription = (
  table: string,
  action: string,
): { label: string; icon: React.ReactNode } => {
  const a = action?.toUpperCase() || "";
  const t = table?.toLowerCase() || "";
  const entityName =
    {
      assets: "Asset",
      maintenance: "Maintenance record",
      vendors: "Vendor",
      users: "User",
    }[t] ?? "Record";

  if (a.includes("ASSET_INSERT"))
    return {
      label: "Asset units inserted",
      icon: <Plus className="w-4 h-4 shrink-0 text-green-600" />,
    };

  if (a.includes("CREATE") || a.includes("INSERT") || a.includes("ADD"))
    return {
      label: `New ${entityName.toLowerCase()} created`,
      icon: <Plus className="w-4 h-4 shrink-0 text-green-600" />,
    };
  if (a.includes("UPDATE") || a.includes("EDIT"))
    return {
      label: `${entityName} updated`,
      icon: <ArrowRightLeft className="w-4 h-4 shrink-0 text-blue-600" />,
    };
  if (a.includes("DELETE") || a.includes("REMOVE"))
    return {
      label: `${entityName} deleted`,
      icon: <Trash2 className="w-4 h-4 shrink-0 text-red-600" />,
    };
  if (a.includes("ALLOCAT") || a.includes("ASSIGN"))
    return {
      label: "Asset allocated",
      icon: <ArrowRight className="w-4 h-4 shrink-0 text-purple-600" />,
    };
  if (a.includes("RETURN") || a.includes("REVOKE"))
    return {
      label: "Asset returned",
      icon: <RotateCcw className="w-4 h-4 shrink-0 text-amber-600" />,
    };
  if (a.includes("DISPOSE"))
    return {
      label: "Asset disposed",
      icon: <Trash2 className="w-4 h-4 shrink-0 text-red-600" />,
    };
  if (a.includes("LOGIN") || a.includes("LOGOUT") || a.includes("AUTH"))
    return {
      label: a.includes("LOGOUT") ? "User logged out" : "Authentication event",
      icon: <Shield className="w-4 h-4 shrink-0 text-cyan-600" />,
    };
  if (a.includes("LICENSE_RENEW"))
    return {
      label: "License renewed",
      icon: <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />,
    };
  if (a.includes("MAINTENANCE"))
    return {
      label: "Maintenance Action",
      icon: <Wrench className="w-4 h-4 shrink-0 text-orange-600" />,
    };
  if (a.includes("PASSWORD"))
    return {
      label: "Password reset",
      icon: <Shield className="w-4 h-4 shrink-0 text-amber-600" />,
    };
  if (a.includes("EMAIL_SENT") || a.includes("EMAIL_SUPPRESSED") || t.includes("email")) {
    return {
      label: a.includes("EMAIL_SUPPRESSED")
        ? "Anomaly Alert Suppressed"
        : "Automated Anomaly Alert",
      icon: a.includes("EMAIL_SUPPRESSED")
        ? <XCircle className="w-4 h-4 shrink-0 text-red-600" />
        : <Mail className="w-4 h-4 shrink-0 text-orange-600" />,
    };
  }
  return {
    label: `${action} on ${table}`,
    icon: <FileText className="w-4 h-4 shrink-0 text-gray-600" />,
  };
};

const getDisplayTable = (table: string | undefined): string => {
  if (!table) return "—";
  if (
    table.includes("AnomalyEmail") ||
    table.includes("DuplicateEmail") ||
    table.includes("AssetEmail")
  )
    return "Anomaly Alert";
  return table;
};

// Format a value for display
const formatValue = (value: unknown, key?: string): string => {
  if (value === null || value === undefined) return "—";

  // Handle boolean-like values for keys indicating booleans
  if (key && /^(is|has|can|should|allow)(_|[A-Z]|$)/i.test(key)) {
    if (value === 0 || value === "0" || value === false || value === "false") return "No";
    if (value === 1 || value === "1" || value === true || value === "true") return "Yes";
  }

  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string") {
    if (value.trim() === "") return "—";
    // Check if it's a date
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      try {
        const d = new Date(value);
        if (!isNaN(d.getTime())) return formatDate(value);
      } catch {
        /* not a date */
      }
    }
    return value;
  }
  return JSON.stringify(value);
};

// Get a color for status/method values
const getValueBadge = (
  key: string,
  value: unknown,
): { isBadge: boolean; color: string } => {
  const k = key.toLowerCase();
  const v = String(value).toUpperCase();

  if (k === "method") {
    if (v === "POST")
      return {
        isBadge: true,
        color: "bg-green-100 text-green-700 border-green-200",
      };
    if (v === "GET")
      return {
        isBadge: true,
        color: "bg-blue-100 text-blue-700 border-blue-200",
      };
    if (v === "PUT" || v === "PATCH")
      return {
        isBadge: true,
        color: "bg-amber-100 text-amber-700 border-amber-200",
      };
    if (v === "DELETE")
      return { isBadge: true, color: "bg-red-100 text-red-700 border-red-200" };
    return {
      isBadge: true,
      color: "bg-gray-100 text-gray-700 border-gray-200",
    };
  }
  if (k === "statuscode" || k === "status_code") {
    const code = Number(value);
    if (code >= 200 && code < 300)
      return {
        isBadge: true,
        color: "bg-green-100 text-green-700 border-green-200",
      };
    if (code >= 400 && code < 500)
      return {
        isBadge: true,
        color: "bg-amber-100 text-amber-700 border-amber-200",
      };
    if (code >= 500)
      return { isBadge: true, color: "bg-red-100 text-red-700 border-red-200" };
    return {
      isBadge: true,
      color: "bg-gray-100 text-gray-700 border-gray-200",
    };
  }
  if (k.includes("status")) {
    if (v === "ACTIVE" || v === "AVAILABLE" || v === "SUCCESS")
      return {
        isBadge: true,
        color: "bg-green-100 text-green-700 border-green-200",
      };
    if (v === "RETURNED" || v === "REVOKED")
      return {
        isBadge: true,
        color: "bg-amber-100 text-amber-700 border-amber-200",
      };
    if (v === "ERROR" || v === "FAILED")
      return { isBadge: true, color: "bg-red-100 text-red-700 border-red-200" };
    return {
      isBadge: true,
      color: "bg-blue-100 text-blue-700 border-blue-200",
    };
  }
  return { isBadge: false, color: "" };
};

// Render a parsed JSON object as readable key-value cards
function JsonCardRenderer({
  data,
  colorScheme,
}: {
  data: string | null;
  colorScheme: "red" | "green" | "blue";
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 italic py-3 px-4 bg-gray-50 rounded-lg">
        <Info className="w-4 h-4" />
        No data available
      </div>
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(data);
  } catch {
    // Not valid JSON — show as plain text
    return (
      <pre
        className={`${colorScheme === "red" ? "bg-red-50 border-red-200 text-red-900" : colorScheme === "green" ? "bg-green-50 border-green-200 text-green-900" : "bg-blue-50 border-blue-200 text-blue-900"} border rounded-lg p-4 text-xs overflow-x-auto whitespace-pre-wrap max-h-48`}>
        {data}
      </pre>
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return (
      <pre
        className={`${colorScheme === "red" ? "bg-red-50 border-red-200 text-red-900" : colorScheme === "green" ? "bg-green-50 border-green-200 text-green-900" : "bg-blue-50 border-blue-200 text-blue-900"} border rounded-lg p-4 text-xs overflow-x-auto whitespace-pre-wrap max-h-48`}>
        {formatJSON(data)}
      </pre>
    );
  }

  const bgColor =
    colorScheme === "red"
      ? "bg-red-50/50"
      : colorScheme === "green"
        ? "bg-emerald-50/50"
        : "bg-blue-50/50";
  const borderColor =
    colorScheme === "red"
      ? "border-red-100"
      : colorScheme === "green"
        ? "border-emerald-100"
        : "border-blue-100";
  const iconColor =
    colorScheme === "red"
      ? "text-red-400"
      : colorScheme === "green"
        ? "text-emerald-500"
        : "text-blue-400";
  const accentColor =
    colorScheme === "red"
      ? "bg-red-100"
      : colorScheme === "green"
        ? "bg-emerald-100"
        : "bg-blue-100";

  const handleCopy = (key: string, value: unknown) => {
    const text =
      typeof value === "object"
        ? JSON.stringify(value, null, 2)
        : String(value);
    navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const entries = Object.entries(parsed);

  // Filter out entries with empty/null values
  const isEmptyValue = (v: unknown): boolean =>
    v === null || v === undefined || (typeof v === "string" && v.trim() === "");

  // Keys to hide from display (noise for end users)
  const hiddenKeys = new Set([
    "allocatedQuantity",
    "type",
    // Maintenance audit noise — internal IDs not useful for end users
    "maintenanceId",
    "bulkParentId",
    // Middleware-generated noise fields from old logApiRequest entries
    "method",
    "url",
    "statusCode",
    "statuscode",
    "status_code",
    "duration",
    "userRole",
    "userrole",
    "userAgent",
    "useragent",
    "ip",
    // Asset insert audit detail: hide child IDs list for cleaner modal
    "insertedChildIds",
    "insertedChildIDs",
    "inserted_child_ids",
    "childIds",
  ]);

  // Separate nested objects from flat values, filtering out empties and hidden keys
  const flatEntries = entries.filter(
    ([k, v]) =>
      (typeof v !== "object" || v === null) &&
      !isEmptyValue(v) &&
      !hiddenKeys.has(k),
  );
  const nestedEntries = entries.filter(
    ([k, v]) => typeof v === "object" && v !== null && !hiddenKeys.has(k),
  );

  return (
    <div
      className={`${bgColor} border ${borderColor} rounded-xl overflow-hidden`}>
      {/* Flat key-value pairs */}
      {flatEntries.length > 0 && (
        <div className="divide-y divide-gray-100/80">
          {flatEntries.map(([key, value]) => {
            const badge = getValueBadge(key, value);
            return (
              <div
                key={key}
                className="flex flex-col sm:flex-row sm:items-center gap-0 sm:gap-3 px-3 sm:px-4 py-1.5 sm:py-2.5 hover:bg-white/60 transition-colors group">
                <span
                  className="text-xs font-semibold text-gray-500 uppercase tracking-wider sm:w-36 sm:shrink-0 sm:whitespace-normal sm:break-words"
                  title={humanizeKey(key)}>
                  {humanizeKey(key)}
                </span>
                <div className="flex-1 min-w-0 flex items-start sm:items-center justify-between gap-2">
                  {badge.isBadge ? (
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-sm font-semibold border ${badge.color}`}>
                      {String(value)}
                    </span>
                  ) : (
                    <span className="text-sm font-medium text-gray-900 break-words">
                      {formatValue(value, key)}
                    </span>
                  )}
                  <button
                    onClick={() => handleCopy(key, value)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200/60 rounded transition-all shrink-0"
                    title="Copy value">
                    {copiedField === key ? (
                      <Check className="w-3 h-3 text-green-600" />
                    ) : (
                      <Copy className="w-3 h-3 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Nested objects rendered as sub-sections */}
      {nestedEntries.map(([key, value]) => (
        <div key={key} className="border-t border-gray-200/60">
          <div className={`px-4 py-2 ${accentColor}/60`}>
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              {humanizeKey(key)}
            </span>
          </div>
          {Array.isArray(value) ? (
            <div className="px-3 sm:px-4 py-2.5">
              {value.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {value.map((item, idx) => (
                    <span
                      key={`${key}-${idx}`}
                      className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                      {formatValue(item, key)}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-gray-400 italic">No items</span>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100/80">
              {Object.entries(value as Record<string, unknown>).map(
                ([subKey, subValue]) => {
                  const subBadge = getValueBadge(subKey, subValue);
                  const isNestedObj =
                    typeof subValue === "object" && subValue !== null;
                  return (
                    <div
                      key={subKey}
                      className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 pl-5 sm:pl-8 py-2.5 hover:bg-white/60 transition-colors group">
                      <span
                        className="text-xs font-semibold text-gray-500 uppercase tracking-wider w-20 sm:w-36 shrink-0 whitespace-normal break-words"
                        title={humanizeKey(subKey)}>
                        {humanizeKey(subKey)}
                      </span>
                      <span className="flex-1 min-w-0">
                        {isNestedObj ? (
                          <code className="text-sm text-gray-600 bg-gray-100 px-2 py-0.5 rounded wrap-break-words">
                            {JSON.stringify(subValue)}
                          </code>
                        ) : (
                          <div className="flex-1 min-w-0 flex items-start sm:items-center justify-between gap-2">
                            {subBadge.isBadge ? (
                              <span
                                className={`inline-block px-2 py-0.5 rounded-md text-sm font-semibold border ${subBadge.color}`}>
                                {String(subValue)}
                              </span>
                            ) : (
                              <span className="text-sm font-medium text-gray-900 break-words">
                                {formatValue(subValue, subKey)}
                              </span>
                            )}
                            <button
                              onClick={() => handleCopy(`${key}.${subKey}`, subValue)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200/60 rounded transition-all shrink-0"
                              title="Copy value">
                              {copiedField === `${key}.${subKey}` ? (
                                <Check className="w-3 h-3 text-green-600" />
                              ) : (
                                <Copy className="w-3 h-3 text-gray-400" />
                              )}
                            </button>
                          </div>
                        )}
                      </span>
                    </div>
                  );
                },
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// =============================================
// CHANGES VIEW — Side-by-side diff of old → new
// =============================================
function ChangesView({
  oldValue,
  newValue,
}: {
  oldValue: string | null;
  newValue: string | null;
}) {
  const changes = useMemo(
    () => computeChanges(oldValue, newValue),
    [oldValue, newValue],
  );

  if (!changes) return null;

  if (changes.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 italic py-3 px-4 bg-gray-50 rounded-lg">
        <CheckCircle2 className="w-4 h-4 text-green-500" />
        No field-level changes detected
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header row — hidden on mobile, stacked layout used instead */}
      <div className="hidden sm:grid grid-cols-[minmax(100px,1fr)_minmax(0,2fr)_24px_minmax(0,2fr)] gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Field
        </span>
        <span className="text-xs font-semibold text-red-500 uppercase tracking-wide">
          Before
        </span>
        <span />
        <span className="text-xs font-semibold text-green-600 uppercase tracking-wide">
          After
        </span>
      </div>
      {/* Change rows */}
      <div className="divide-y divide-gray-100">
        {changes.map((change) => (
          <div
            key={change.key}
            className={`px-3 sm:px-4 py-2.5 transition-colors ${change.type === "added"
              ? "bg-green-50/40"
              : change.type === "removed"
                ? "bg-red-50/40"
                : "hover:bg-gray-50/50"
              }`}>
            {/* Desktop: grid layout */}
            <div className="hidden sm:grid grid-cols-[minmax(100px,1fr)_minmax(0,2fr)_24px_minmax(0,2fr)] gap-2 items-center">
              <span
                className="text-xs font-semibold text-gray-600 whitespace-normal break-words"
                title={humanizeKey(change.key)}>
                {humanizeKey(change.key)}
              </span>
              <span className="min-w-0">
                {change.type === "added" ? (
                  <span className="text-xs text-gray-300 italic">—</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs">
                    <span className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-md font-medium wrap-break-words max-w-full">
                      {formatValue(change.oldVal, change.key)}
                    </span>
                  </span>
                )}
              </span>
              <span className="flex items-center justify-center">
                <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
              </span>
              <span className="min-w-0">
                {change.type === "removed" ? (
                  <span className="text-xs text-gray-300 italic">—</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-md font-medium wrap-break-words max-w-full">
                      {formatValue(change.newVal, change.key)}
                    </span>
                  </span>
                )}
              </span>
            </div>

            {/* Mobile: stacked layout */}
            <div className="sm:hidden space-y-1">
              <span
                className="text-xs font-semibold text-gray-600 block"
                title={humanizeKey(change.key)}>
                {humanizeKey(change.key)}
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {change.type !== "added" && (
                  <span className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-md text-xs font-medium wrap-break-words">
                    {formatValue(change.oldVal, change.key)}
                  </span>
                )}
                <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
                {change.type !== "removed" && (
                  <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-md text-xs font-medium wrap-break-words">
                    {formatValue(change.newVal, change.key)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================
// DETAIL MODAL — with diff view & human-readable descriptions
// =============================================

function AuditDetailModal({
  log,
  onClose,
  onViewAsset,
  onViewMaintenance,
}: {
  log: AuditLogType;
  onClose: () => void;
  onViewAsset?: (asset: Asset) => void;
  onViewMaintenance?: (m: MaintenanceRecord) => void;
}) {
  const actionDesc = getActionDescription(log.table, log.action);
  const actionUpper = log.action?.toUpperCase() || "";

  // Format anomaly table names
  let displayTable = log.table;
  if (displayTable?.includes("AnomalyEmail"))
    displayTable = displayTable.replace("AnomalyEmail", " Anomaly Alert");
  else if (displayTable?.includes("DuplicateEmail"))
    displayTable = displayTable.replace("DuplicateEmail", " Duplicate Alert");
  else if (displayTable?.includes("AssetEmail"))
    displayTable = displayTable.replace("AssetEmail", " Asset Alert");

  // For these actions, old and new values represent different contexts
  // (e.g. asset info vs allocation details) — NOT field-level changes.
  // Show them as separate info cards instead of a misleading diff.
  const isContextualAction =
    actionUpper.includes("ALLOCAT") ||
    actionUpper.includes("ASSIGN") ||
    actionUpper.includes("RETURN") ||
    actionUpper.includes("REVOKE") ||
    actionUpper.includes("DISPOSE") ||
    actionUpper.includes("LOGIN") ||
    actionUpper.includes("EMAIL_SENT") ||
    actionUpper.includes("EMAIL_SUPPRESSED") ||
    actionUpper.includes("LOGOUT");

  const changes = useMemo(
    () =>
      isContextualAction ? null : computeChanges(log.oldValue, log.newValue),
    [log.oldValue, log.newValue, isContextualAction],
  );
  const hasBothValues = !!log.oldValue && !!log.newValue;
  const hasDiff = hasBothValues && changes !== null;

  // Determine if this log is about an asset or maintenance
  const tableLower = log.table?.toLowerCase() || "";
  const isAssetLog =
    tableLower.includes("asset") || tableLower.includes("license");
  const isMaintenanceLog = tableLower.includes("maintenance");

  const canNavigate = !!onViewAsset && !!log.recordId;

  const handleViewAsset = async () => {
    if (!canNavigate) return;
    try {
      // If table is Maintenance, the recordId is a MaintenanceID.
      // We must extract the assetId from the log's values.
      let targetAssetId = log.recordId;
      if (isMaintenanceLog) {
        const values = safeParse(log.newValue) || safeParse(log.oldValue);
        if (values?.assetId) {
          targetAssetId = String(values.assetId);
        }
      }

      const asset = await dataService.getAsset(String(targetAssetId));
      if (asset) {
        onClose();
        onViewAsset!(asset);
      } else {
        toast.error("Asset not found");
      }
    } catch {
      toast.error("Could not load asset");
    }
  };

  const handleViewMaintenance = async () => {
    if (!canNavigate) return;
    try {
      // recordId is the maintenance ID — find it and navigate directly
      const records = await dataService.getMaintenance();
      const record = records.find(
        (m: MaintenanceRecord) => String(m.id) === String(log.recordId),
      );
      if (record) {
        if (onViewMaintenance) {
          onClose();
          onViewMaintenance(record);
          return;
        }
        // Fallback: navigate to the linked asset if no maintenance handler
        if (record.assetId) {
          const asset = await dataService.getAsset(String(record.assetId));
          if (asset) {
            onClose();
            onViewAsset?.(asset);
            return;
          }
        }
      }
      toast.error("Maintenance record not found");
    } catch {
      toast.error("Could not load maintenance record");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal panel */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95dvh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <div className="flex items-center gap-3">
            {actionDesc.icon}
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {actionDesc.label}
              </h2>
              <p className="text-xs text-gray-500">
                {getLogAssetName(log)
                  ? `${getLogAssetName(log)} · ${displayTable}`
                  : displayTable}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canNavigate && isAssetLog && (
              <button
                onClick={handleViewAsset}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-all">
                <ExternalLink className="w-3.5 h-3.5" />
                View Asset
              </button>
            )}
            {canNavigate && isMaintenanceLog && (
              <button
                onClick={handleViewMaintenance}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 transition-all">
                <Wrench className="w-3.5 h-3.5" />
                View Maintenance
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-3 sm:p-6 space-y-4 sm:space-y-5 modal-safe-bottom">
          {/* Summary Strip */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span
              className={getPillBadgeClass(getActionColor(log.action), "sm")}>
              {formatActionBadge(log.action)}
            </span>
            <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-md border border-gray-200">
              {displayTable}
            </span>
            <span className="hidden sm:inline text-xs text-gray-400">|</span>
            <div
              className="flex items-center gap-1 text-gray-500"
              title={log.performedBy || ""}>
              <User className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-medium">
                {log.performedByName || log.performedBy || "System"}
              </span>
            </div>
            <span className="hidden sm:inline text-xs text-gray-400">|</span>
            <div className="flex items-center gap-1 text-gray-500">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-medium whitespace-nowrap">
                {formatDate(log.date)}
              </span>
            </div>
          </div>

          {/* ========== WHAT CHANGED — unified diff view (for UPDATE/EDIT only) ========== */}
          {hasDiff && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ArrowRightLeft className="w-4 h-4 text-blue-500" />
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  What Changed
                </p>
              </div>
              <ChangesView oldValue={log.oldValue} newValue={log.newValue} />
            </div>
          )}

          {/* ========== Contextual actions: merge old + new into one Event Summary card ========== */}
          {isContextualAction && (log.oldValue || log.newValue) && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-blue-500" />
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Event Summary
                </p>
              </div>
              <JsonCardRenderer
                data={(() => {
                  const oldObj = log.oldValue
                    ? (() => {
                      try {
                        return JSON.parse(log.oldValue);
                      } catch {
                        return null;
                      }
                    })()
                    : null;
                  const newObj = log.newValue
                    ? (() => {
                      try {
                        return JSON.parse(log.newValue);
                      } catch {
                        return null;
                      }
                    })()
                    : null;

                  const merged = {
                    ...(oldObj || {}),
                    ...(newObj || {}),
                  };

                  // Remove allocationId as per user request
                  if ("allocationId" in merged) {
                    delete merged.allocationId;
                  }

                  return JSON.stringify(merged);
                })()}
                colorScheme="blue"
              />
            </div>
          )}

          {/* ========== Non-contextual: Old Values (only when no diff, standalone) ========== */}
          {log.oldValue && !hasDiff && !isContextualAction && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  {log.newValue ? "Before" : "Previous Values"}
                </p>
              </div>
              <JsonCardRenderer data={log.oldValue} colorScheme="red" />
            </div>
          )}

          {/* ========== Non-contextual: New Values (only when no diff, standalone) ========== */}
          {log.newValue && !hasDiff && !isContextualAction && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  {log.oldValue ? "After" : "Values"}
                </p>
              </div>
              <JsonCardRenderer data={log.newValue} colorScheme="green" />
            </div>
          )}



          {/* ========== No old or new values ========== */}
          {!log.oldValue && !log.newValue && (
            <div className="flex items-center gap-2 text-sm text-gray-400 italic py-3 px-4 bg-gray-50 rounded-lg">
              <Info className="w-4 h-4" />
              No value data recorded for this audit entry
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// =============================================
// MAIN COMPONENT
// =============================================

export function AuditLogPage({
  onViewAsset,
  onViewMaintenance,
}: {
  onViewAsset?: (asset: Asset) => void;
  onViewMaintenance?: (m: MaintenanceRecord) => void;
} = {}) {
  const [logs, setLogs] = useState<AuditLogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [selectedAction, setSelectedAction] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<
    "table" | "action" | null
  >(null);
  const tableDropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const tableDropdownMenuRef = useRef<HTMLDivElement>(null);
  const actionDropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const actionDropdownMenuRef = useRef<HTMLDivElement>(null);

  const { openUpward: openTableUpward, maxHeight: tableDropdownMaxHeight } =
    useSmartDropdownPosition({
      isOpen: activeDropdown === "table",
      anchorRef: tableDropdownTriggerRef,
      menuRef: tableDropdownMenuRef,
      preferredMaxHeight: 240,
    });

  const { openUpward: openActionUpward, maxHeight: actionDropdownMaxHeight } =
    useSmartDropdownPosition({
      isOpen: activeDropdown === "action",
      anchorRef: actionDropdownTriggerRef,
      menuRef: actionDropdownMenuRef,
      preferredMaxHeight: 240,
    });

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Filter options (from server)
  const [tableNames, setTableNames] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);

  // Detail modal
  const [selectedLog, setSelectedLog] = useState<AuditLogType | null>(null);

  const debouncedSearch = useDebounce(searchQuery, 400);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await dataService.getAuditLogs({
        page,
        pageSize,
        search: debouncedSearch || undefined,
        tableName: selectedTable || undefined,
        action: selectedAction || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setLogs(result.data);
      setTotalRecords(result.pagination.total);
      setTotalPages(result.pagination.totalPages);
      if (result.filters.tableNames.length > 0) {
        setTableNames(result.filters.tableNames);
      }
      if (result.filters.actions.length > 0) {
        setActions(result.filters.actions);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    debouncedSearch,
    selectedTable,
    selectedAction,
    startDate,
    endDate,
  ]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    selectedTable,
    selectedAction,
    startDate,
    endDate,
    pageSize,
  ]);

  const hasActiveFilters = useMemo(
    () => !!selectedTable || !!selectedAction || !!startDate || !!endDate,
    [selectedTable, selectedAction, startDate, endDate],
  );

  const changeSummaryByLogId = useMemo(() => {
    const summaries = new Map<string, string>();
    for (const log of logs) {
      summaries.set(String(log.id), getChangeSummaryText(log));
    }
    return summaries;
  }, [logs]);

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedTable("");
    setSelectedAction("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const renderDropdown = (
    key: "table" | "action",
    label: string,
    allLabel: string,
    options: string[],
    selected: string,
    setSelected: (v: string) => void,
  ) => {
    const triggerRef =
      key === "table" ? tableDropdownTriggerRef : actionDropdownTriggerRef;
    const menuRef = key === "table" ? tableDropdownMenuRef : actionDropdownMenuRef;
    const openUpward = key === "table" ? openTableUpward : openActionUpward;
    const dropdownMaxHeight =
      key === "table" ? tableDropdownMaxHeight : actionDropdownMaxHeight;

    return (
      <div className="space-y-1 relative min-w-0">
        <label className="ui-filter-label">{label}</label>
        <button
          ref={triggerRef}
          onClick={() => setActiveDropdown(activeDropdown === key ? null : key)}
          className={`w-full flex items-center justify-between pl-3.5 pr-3 py-2 border rounded-lg transition-all text-sm font-medium shadow-sm bg-white hover:border-gray-400 group border-gray-300`}>
          <span className={!selected ? "text-gray-400" : "text-gray-900"}>
            {selected || allLabel}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-transform duration-200 ${activeDropdown === key ? "rotate-180" : ""}`}
          />
        </button>
        <AnimatePresence>
          {activeDropdown === key && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setActiveDropdown(null)}
              />
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, scale: 0.98, y: 2 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 2 }}
                className={`absolute z-50 w-full bg-white rounded-xl shadow-xl overflow-hidden py-1 overflow-y-auto ${openUpward ? "bottom-full mb-1" : "top-full mt-1"
                  }`}
                style={{ maxHeight: `${dropdownMaxHeight}px` }}>
                {[allLabel, ...options].map((o) => {
                  const val = o === allLabel ? "" : o;
                  const isSelected = selected === val;
                  return (
                    <button
                      key={o}
                      onClick={() => {
                        setSelected(val);
                        setActiveDropdown(null);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-sm font-medium transition-all duration-150 ${isSelected ? (val ? "bg-blue-50 text-blue-700" : "bg-gray-50 text-gray-700") : "text-gray-700 hover:bg-gray-50"}`}>
                      <span>{o}</span>
                      {isSelected && (
                        <div className="ml-auto bg-blue-600 rounded-full p-0.5">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const handleExportCSV = () => {
    if (logs.length === 0) return;
    const headers = [
      "S.No",
      "Table",
      "Action",
      "Performed By",
      "Date",
      "Old Values",
      "New Values",
      "Additional Info",
    ];
    const rows = logs.map((log, index) => [
      index + 1,
      getDisplayTable(log.table),
      log.action,
      log.performedBy || "",
      log.date ? formatCSVDateTime(log.date) : "",
      log.oldValue || "",
      log.newValue || "",
      log.additionalInfo || "",
    ]);
    openDataView({
      title: "Audit Log Export",
      headers,
      rows,
      filename: `audit-log-export-${new Date().toISOString().split("T")[0]}.csv`,
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Audit Log
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Complete system activity trail
            {totalRecords > 0 && (
              <span className="ml-1 text-gray-400">
                ({totalRecords.toLocaleString()} records)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all">
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search & Filters Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
        <div className="flex flex-row items-center gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search audit logs..."
              className="w-full pl-9 pr-10 h-9 sm:h-10 border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-sm text-sm outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
                title="Clear search">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => {
              setShowFilters((prev) => {
                const next = !prev;
                if (!next) setActiveDropdown(null);
                return next;
              });
            }}
            className={`flex items-center justify-center gap-2 px-2.5 sm:px-4 h-9 sm:h-10 border border-gray-300 rounded-lg bg-white cursor-pointer hover:border-gray-400 hover:shadow-sm transition-all shadow-sm font-semibold text-gray-700 text-sm whitespace-nowrap ${hasActiveFilters
              ? "bg-blue-50 text-blue-700 border-blue-300"
              : showFilters
                ? "border-gray-300"
                : ""
              }`}>
            <Filter className="w-4 h-4 text-gray-500 sm:hidden" />
            <span className="hidden sm:inline">Filters</span>
            {hasActiveFilters && (
              <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
                {
                  [selectedTable, selectedAction, startDate, endDate].filter(
                    Boolean,
                  ).length
                }
              </span>
            )}
            <motion.div
              animate={{ rotate: showFilters ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="hidden sm:block">
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </motion.div>
          </button>
        </div>

        {/* Expanded Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-visible pt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-1">
                {renderDropdown(
                  "table",
                  "Table",
                  "All Tables",
                  tableNames,
                  selectedTable,
                  setSelectedTable,
                )}
                {renderDropdown(
                  "action",
                  "Action",
                  "All Actions",
                  actions,
                  selectedAction,
                  setSelectedAction,
                )}

                <div className="space-y-1 min-w-0" lang="en-GB">
                  <label className="ui-filter-label">Start Date</label>
                  <input
                    type="date"
                    value={toDateInputValue(startDate)}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setPage(1);
                    }}
                    style={{ height: "36px", paddingTop: "0px", paddingBottom: "0px" }}
                    className={`w-full block px-3.5 border border-gray-300 rounded-lg shadow-sm bg-white hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer text-sm font-medium transition-all ${
                      startDate ? "text-gray-900" : "text-gray-400"
                    }`}
                  />
                </div>

                <div className="space-y-1 min-w-0" lang="en-GB">
                  <label className="ui-filter-label">End Date</label>
                  <input
                    type="date"
                    value={toDateInputValue(endDate)}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setPage(1);
                    }}
                    style={{ height: "36px", paddingTop: "0px", paddingBottom: "0px" }}
                    className={`w-full block px-3.5 border border-gray-300 rounded-lg shadow-sm bg-white hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer text-sm font-medium transition-all ${
                      endDate ? "text-gray-900" : "text-gray-400"
                    }`}
                  />
                </div>
              </div>

              {hasActiveFilters && (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={clearFilters}
                    className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1">
                    <X className="w-3.5 h-3.5" />
                    Clear all filters
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center shrink-0">
            <X className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-red-800">
              Failed to load audit logs
            </p>
            <p className="text-xs text-red-600 mt-0.5">{error}</p>
          </div>
          <button
            onClick={fetchLogs}
            className="ml-auto px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Loading / Empty States */}
        {loading && logs.length === 0 ? (
          <div className="animate-pulse">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex gap-4">
              {["w-8", "w-28", "w-20", "w-16", "flex-1", "w-20", "w-12"].map(
                (w, i) => (
                  <div key={i} className={`h-3 bg-gray-200 rounded ${w}`} />
                ),
              )}
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="px-4 py-3.5 border-b border-gray-50 flex items-center gap-4">
                <div className="h-3 w-6 bg-gray-100 rounded" />
                <div className="h-3 w-28 bg-gray-100 rounded" />
                <div className="h-5 w-16 bg-gray-100 rounded-md" />
                <div className="h-5 w-14 bg-gray-100 rounded-full" />
                <div className="h-3 flex-1 bg-gray-50 rounded" />
                <div className="h-3 w-16 bg-gray-100 rounded" />
                <div className="h-6 w-6 bg-gray-100 rounded-lg" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <FileText className="w-6 h-6 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">
                  No audit logs found
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {hasActiveFilters || searchQuery
                    ? "Try adjusting your filters or search query"
                    : "System activity will appear here"}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            {!isMobile && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="ui-table-head w-10">#</th>
                      <th className="ui-table-head">Date & Time</th>
                      <th className="ui-table-head">Table</th>
                      <th className="ui-table-head">Action</th>
                      <th className="ui-table-head">Changes</th>
                      <th className="ui-table-head">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {logs.map((log, idx) => {
                      const summary = changeSummaryByLogId.get(String(log.id)) || "—";

                      return (
                        <tr
                          key={log.id}
                          className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                          onClick={() => setSelectedLog(log)}>
                          <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                            {(page - 1) * pageSize + idx + 1}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 text-gray-700">
                              <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span className="text-xs">
                                {formatDate(log.date)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-md border border-gray-200">
                              {getDisplayTable(log.table)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={getPillBadgeClass(
                                getActionColor(log.action),
                                "sm",
                              )}>
                              {formatActionBadge(log.action)}
                            </span>
                          </td>
                          <td className="px-4 py-3 max-w-70">
                            <div className="flex flex-col gap-0.5">
                              {getLogAssetName(log) && (
                                <span className="inline-flex items-center text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0 w-fit whitespace-nowrap">
                                  {getLogAssetName(log)}
                                </span>
                              )}
                              <span
                                className="text-xs text-gray-600 whitespace-normal break-words"
                                title={summary}>
                                {summary}
                              </span>
                            </div>
                          </td>
                          <td
                            className="px-4 py-3 text-xs text-gray-700 font-medium whitespace-nowrap"
                            title={log.performedBy || ""}>
                            {log.performedByName || log.performedBy || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Mobile Card View */}
            {isMobile && (
              <div className="divide-y divide-gray-100">
                {logs.map((log) => {
                  const summary = changeSummaryByLogId.get(String(log.id)) || "—";

                  return (
                    <div
                      key={log.id}
                      className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setSelectedLog(log)}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="p-1 min-w-5 rounded shrink-0 bg-gray-50 flex items-center justify-center">
                          {
                            getActionDescription(
                              log.table || "",
                              log.action || "",
                            ).icon
                          }
                        </div>
                        <span className="text-sm font-semibold text-gray-900 truncate">
                          {
                            getActionDescription(
                              log.table || "",
                              log.action || "",
                            ).label
                          }
                        </span>
                      </div>
                      {getLogAssetName(log) && (
                        <div className="flex items-center gap-1 mb-1">
                          <span className="inline-flex items-center text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0 whitespace-nowrap">
                            {getLogAssetName(log)}
                          </span>
                        </div>
                      )}
                      {/* Change summary */}
                      <p className="text-xs text-gray-700 font-semibold mb-1.5 whitespace-normal break-words">
                        {summary}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 text-gray-500">
                          <Clock className="w-3 h-3 text-gray-400 shrink-0" />
                          <span className="text-[10px] wrap-break-word">
                            {formatDate(log.date)}
                          </span>
                        </div>
                        {log.performedBy && (
                          <>
                            <span className="text-xs text-gray-400">
                              &middot;
                            </span>
                            <span
                              className="text-xs text-gray-600 font-medium"
                              title={log.performedBy}>
                              {log.performedByName || log.performedBy}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Footer / Pagination */}
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalRecords}
          itemsPerPage={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedLog && (
          <AuditDetailModal
            log={selectedLog}
            onClose={() => setSelectedLog(null)}
            onViewAsset={onViewAsset}
            onViewMaintenance={onViewMaintenance}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
