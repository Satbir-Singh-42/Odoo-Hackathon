'use client';

import { useState, useMemo, useCallback, useRef } from "react";
import {
  Calendar,
  User,
  Package,
  Box,
  Clock,
  TrendingUp,
  History,
  RotateCcw,
  Search,
  Filter,
  X,
  ChevronDown,
  Download,
  Wrench,
  Trash2,
  Check,
  ExternalLink,
  MapPin,
  Link2,
} from "lucide-react";
import {
  Asset,
  AssetHistory as AssetHistoryType,
  LicenseAllocation,
  MaintenanceRecord,
  User as UserType,
} from '@/types';
import { getConditionBadgeColor } from '@/lib/utils/statusHelpers';
import {
  ALLOCATION_STATUS_DISPLAY,
  isSoftwareLikeCategory,
  UserRole,
} from '@/config/constants';
import {
  getMaintenanceBreakdownLabel,
  sumCosts,
  calculateDuration,
} from '@/lib/utils/assetHelpers';
import {
  formatDisplayDate,
  formatDisplayDateTime,
  toDateInputValue,
} from '@/lib/utils/dateHelpers';
import { Pagination, DEFAULT_PAGE_SIZE } from '@/components/ui/pagination';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useDebounce } from '@/hooks/useDebounce';
import { useSmartDropdownPosition } from '@/hooks/useSmartDropdownPosition';
import { motion, AnimatePresence } from "framer-motion";
import { formatCSVDate, formatCSVDateTime } from '@/lib/utils/csvHelpers';
import { openDataView } from '@/lib/utils/dataViewHelpers';
import { getPillBadgeClass } from '@/components/ui/StatusBadge';
import { formatCurrencyValue } from '@/lib/utils/formatCurrency';

// =============================================
// TYPES
// =============================================

interface AssetHistoryProps {
  history: AssetHistoryType[];
  licenseAllocations?: LicenseAllocation[];
  assetCategory?: string;
  users?: UserType[];
  assetId?: string;
  isBulkOrder?: boolean;
  assets?: Asset[];
  onViewAsset?: (asset: Asset) => void;
  onViewMaintenance?: (record: MaintenanceRecord) => void;
  assetCode?: string;
  assetName?: string;
  maintenanceRecords?: MaintenanceRecord[];
  userRole?: UserRole;
}

/** Unified record — built from allocations, history, and maintenance */
interface HistoryRecord {
  id: string;
  type:
    | "creation"
    | "allocation"
    | "return"
    | "chain"
    | "dispose"
    | "maintenance"
    | "update";
  date: string;
  // Target info (snapshotted at time of action)
  targetName: string;
  targetId?: string | null;
  targetDepartment?: string | null;
  isAssetAllocation: boolean;
  // Asset identification (snapshot)
  unitCode?: string;
  unitName?: string;
  // Status at time of record
  status: string;
  returnDate?: string | null;
  performedBy?: string | null;
  returnedBy?: string | null;
  conditionAtAllocation?: string | null;
  conditionAtReturn?: string | null;
  notes?: string | null;
  quantity?: number;
  // Deployment snapshot
  ipAddress?: string | null;
  operatingSystem?: string | null;
  installationLocation?: string | null;
  // Chain-specific
  chainAssetId?: string;
  chainAssetCode?: string;
  chainAssetName?: string;
  chainCategory?: string;
  // Dispose-specific
  disposeCondition?: string | null;
  disposeReason?: string | null;
  // Maintenance-specific
  maintenanceDescription?: string | null;
  technician?: string | null;
  cost?: number | null;
  maintenanceStatus?: string | null;
  completionDate?: string | null;
  // Duration
  durationDays?: number | null;
  // Target asset ID for asset-to-asset allocations
  targetAssetId?: string | null;
  // Maintenance linking
  maintenanceId?: string;
  maintenanceAssetId?: string;
}

const RECORD_TYPES = [
  {
    value: "",
    label: "All Types",
    dot: "bg-gray-400",
    hl: "bg-gray-50 text-gray-700",
  },
  {
    value: "allocation",
    label: "Allocation",
    dot: "bg-blue-500",
    hl: "bg-blue-50 text-blue-700",
  },
  {
    value: "creation",
    label: "Creation",
    dot: "bg-indigo-500",
    hl: "bg-indigo-50 text-indigo-700",
  },
  {
    value: "return",
    label: "Return",
    dot: "bg-orange-500",
    hl: "bg-orange-50 text-orange-700",
  },
  {
    value: "chain",
    label: "Chain Asset",
    dot: "bg-purple-500",
    hl: "bg-purple-50 text-purple-700",
  },
  {
    value: "dispose",
    label: "Disposal",
    dot: "bg-red-500",
    hl: "bg-red-50 text-red-700",
  },
  {
    value: "maintenance",
    label: "Maintenance",
    dot: "bg-teal-500",
    hl: "bg-teal-50 text-teal-700",
  },
  {
    value: "update",
    label: "Update",
    dot: "bg-slate-500",
    hl: "bg-slate-50 text-slate-700",
  },
];

const PAGE_SIZES = [25, 50, 100];

// =============================================
// HELPERS
// =============================================

const STAT_ICO = "w-4 h-4 text-white";

const TYPE_CONFIG: Record<
  string,
  { color: string; label: string; icon: React.ReactNode }
> = {
  creation: {
    color: "bg-indigo-100 text-indigo-800 border-indigo-200",
    label: "Created",
    icon: <History className="w-3.5 h-3.5 shrink-0" />,
  },
  allocation: {
    color: "bg-blue-100 text-blue-800 border-blue-200",
    label: "Allocation",
    icon: <User className="w-3.5 h-3.5 shrink-0" />,
  },
  return: {
    color: "bg-orange-100 text-orange-800 border-orange-200",
    label: "Return",
    icon: <RotateCcw className="w-3.5 h-3.5 shrink-0" />,
  },
  chain: {
    color: "bg-purple-100 text-purple-800 border-purple-200",
    label: "Received",
    icon: <Package className="w-3.5 h-3.5 shrink-0" />,
  },
  dispose: {
    color: "bg-red-100 text-red-800 border-red-200",
    label: "Disposal",
    icon: <Trash2 className="w-3.5 h-3.5 shrink-0" />,
  },
  maintenance: {
    color: "bg-teal-100 text-teal-800 border-teal-200",
    label: "Maintenance",
    icon: <Wrench className="w-3.5 h-3.5 shrink-0" />,
  },
  update: {
    color: "bg-slate-100 text-slate-800 border-slate-200",
    label: "Update",
    icon: <Clock className="w-3.5 h-3.5 shrink-0" />,
  },
};
const DEFAULT_TYPE = {
  color: "bg-gray-100 text-gray-800 border-gray-200",
  label: "",
  icon: <Clock className="w-3.5 h-3.5 shrink-0" />,
};

const MAINT_STATUS_BADGE: Record<string, string> = {
  Completed: "bg-green-50 text-green-700 border-green-200",
  "In Progress": "bg-amber-50 text-amber-700 border-amber-200",
  Cancelled: "bg-red-50 text-red-700 border-red-200",
};
const DEFAULT_MAINT_BADGE = "bg-blue-50 text-blue-700 border-blue-200";

const getTypeColor = (type: string) =>
  (TYPE_CONFIG[type] ?? DEFAULT_TYPE).color;
const getTypeLabel = (type: string) => TYPE_CONFIG[type]?.label ?? type;
const getTypeIcon = (type: string) => (TYPE_CONFIG[type] ?? DEFAULT_TYPE).icon;

const getRecordIcon = (record: HistoryRecord) => {
  if (
    record.type === "allocation" &&
    !record.targetId &&
    !record.isAssetAllocation &&
    record.installationLocation
  ) {
    return <MapPin className="w-3.5 h-3.5 shrink-0" />;
  }
  if (record.type === "allocation" && record.isAssetAllocation) {
    return <Link2 className="w-3.5 h-3.5 shrink-0" />;
  }
  return getTypeIcon(record.type);
};

const normalizeMaintenanceDescription = (value?: string | null) =>
  (value || "").replace(/\s+/g, " ").trim().toLowerCase();

const extractMaintenanceHistoryDescription = (notes?: string | null) => {
  if (!notes) return "";
  const match = notes.match(/^Maintenance\s+[^:]+:\s*(.+)$/i);
  return (match ? match[1] : notes).trim();
};

const getSummaryText = (record: HistoryRecord): string => {
  switch (record.type) {
    case "creation":
      return record.notes || `${record.targetName} created`;
    case "allocation":
      return record.isAssetAllocation
        ? `Allocated to: ${record.targetName}`
        : `Allocated to: ${record.targetName}${record.targetId ? ` (${record.targetId})` : ""}`;
    case "return":
      return `Returned from ${record.targetName}${record.conditionAtReturn ? ` — ${record.conditionAtReturn}` : ""}`;
    case "chain":
      return `Received: ${record.chainAssetName || record.chainAssetCode || "Asset"} assigned to this asset`;
    case "dispose":
      return record.disposeReason
        ? `Disposed: ${record.disposeReason}`
        : "Asset disposed";
    case "update":
      return record.notes || "Asset updated";
    case "maintenance": {
      const raw = (
        record.maintenanceDescription || "Maintenance action"
      ).trim();
      const normalized = raw
        .replace(
          /^maintenance\s+(completed|scheduled|in\s*progress)\s*:\s*/i,
          "",
        )
        .replace(/^status\s*:\s*/i, "");
      const compact = normalized.split("|")[0].trim();
      const brief = compact;

      return record.maintenanceStatus
        ? `${record.maintenanceStatus}: ${brief}`
        : brief;
    }
    default:
      return "—";
  }
};

// =============================================
// DETAIL MODAL
// =============================================

function RecordDetailModal({
  record,
  onClose,
  onViewAsset,
  onViewMaintenance,
  assets = [],
  maintenanceRecords = [],
  assetId,
  userRole,
}: {
  record: HistoryRecord;
  onClose: () => void;
  onViewAsset?: (asset: Asset) => void;
  onViewMaintenance?: (record: MaintenanceRecord) => void;
  assets?: Asset[];
  maintenanceRecords?: MaintenanceRecord[];
  assetId?: string;
  userRole?: UserRole;
}) {
  const pairs: { label: string; value: string | number | null | undefined }[] =
    [];

  const maintenanceTarget = useMemo(() => {
    if (record.type !== "maintenance") return null;
    if (maintenanceRecords.length === 0) return null;

    if (record.maintenanceId) {
      const direct = maintenanceRecords.find(
        (m) => String(m.id) === String(record.maintenanceId),
      );
      if (direct) return direct;
    }

    if (!record.maintenanceAssetId) return null;

    const candidates = maintenanceRecords.filter(
      (m) => String(m.assetId) === String(record.maintenanceAssetId),
    );
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const anchorTs = new Date(record.date).getTime();
    let best = candidates[0];
    let bestDiff = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      const candidateDate = candidate.createdAt || candidate.scheduledDate;
      const diff = Math.abs(new Date(candidateDate).getTime() - anchorTs);
      if (diff < bestDiff) {
        best = candidate;
        bestDiff = diff;
      }
    }

    return best;
  }, [record, maintenanceRecords]);

  const showMaintenanceVisit =
    record.type === "maintenance" &&
    Boolean(onViewMaintenance) &&
    Boolean(maintenanceTarget);
  const showAssetButtons = record.type !== "maintenance";

  // Date, type badge, unit name + code are already shown in the header
  // Don't repeat them in the body

  if (record.type !== "maintenance") {
    if (record.type === "creation") {
      pairs.push({ label: "Asset", value: record.targetName });
      if (record.unitCode) {
        pairs.push({ label: "Asset Code", value: record.unitCode });
      }
      if (record.conditionAtAllocation) {
        pairs.push({
          label: "Condition at Creation",
          value: record.conditionAtAllocation,
        });
      }
      if (record.installationLocation) {
        pairs.push({
          label: "Installation Location",
          value: record.installationLocation,
        });
      }
      if (record.ipAddress) {
        pairs.push({ label: "IP Address", value: record.ipAddress });
      }
      if (record.operatingSystem) {
        pairs.push({ label: "Operating System", value: record.operatingSystem });
      }
      if (record.performedBy) {
        pairs.push({ label: "Created By", value: record.performedBy });
      }
      if (record.notes) {
        pairs.push({ label: "Details", value: record.notes });
      }
    } else if (record.type === "update") {
      pairs.push({ label: "Asset", value: record.targetName });
      if (record.unitCode) {
        pairs.push({ label: "Asset Code", value: record.unitCode });
      }
      if (record.performedBy) {
        pairs.push({ label: "Performed By", value: record.performedBy });
      }
      if (record.notes) {
        pairs.push({ label: "Details", value: record.notes });
      }
    } else if (record.type === "chain") {
      pairs.push({
        label: "Received Asset",
        value: record.chainAssetName || record.chainAssetCode || "Unknown",
      });
      if (record.chainAssetCode) {
        pairs.push({ label: "Asset Code", value: record.chainAssetCode });
      }
      if (record.chainCategory) {
        pairs.push({ label: "Asset Category", value: record.chainCategory });
      }
      if (record.conditionAtAllocation) {
        pairs.push({
          label: "Condition at Assignment",
          value: record.conditionAtAllocation,
        });
      }
      if (record.performedBy) {
        pairs.push({ label: "Performed By", value: record.performedBy });
      }
      if (record.notes) {
        pairs.push({ label: "Notes", value: record.notes });
      }
    } else if (record.type === "dispose") {
      pairs.push({ label: "Asset", value: record.targetName });
      if (record.unitCode) {
        pairs.push({ label: "Asset Code", value: record.unitCode });
      }
      if (record.disposeCondition) {
        pairs.push({
          label: "Condition at Disposal",
          value: record.disposeCondition,
        });
      }
      if (record.disposeReason) {
        pairs.push({ label: "Disposal Reason", value: record.disposeReason });
      }
      if (record.performedBy) {
        pairs.push({ label: "Performed By", value: record.performedBy });
      }
      if (record.notes && record.notes !== record.disposeReason) {
        pairs.push({ label: "Notes", value: record.notes });
      }
    } else {
      // allocation / return
      const targetLabel =
        record.type === "return"
          ? record.isAssetAllocation
            ? "Returned From (Asset)"
            : "Returned From"
          : record.isAssetAllocation
            ? "Allocated To (Asset)"
            : record.targetId
              ? "Allocated To (User)"
              : "Assigned To";

      pairs.push({
        label: targetLabel,
        value: record.targetName,
      });
      if (record.targetId) {
        pairs.push({ label: "Employee ID", value: record.targetId });
      }
      if (record.targetDepartment) {
        pairs.push({ label: "Department", value: record.targetDepartment });
      }
      if (record.conditionAtAllocation && record.type !== "return") {
        pairs.push({
          label: "Condition at Allocation",
          value: record.conditionAtAllocation,
        });
      }
      if (
        record.conditionAtReturn ||
        (record.type === "return" && record.conditionAtAllocation)
      ) {
        pairs.push({
          label: "Condition at Return",
          value: record.conditionAtReturn || record.conditionAtAllocation,
        });
      }
      if (record.returnDate) {
        pairs.push({
          label: "Return Date",
          value: formatDisplayDateTime(record.returnDate),
        });
      }
      if (record.durationDays != null) {
        pairs.push({ label: "Duration (Days)", value: record.durationDays });
      }
      if (record.installationLocation) {
        pairs.push({
          label: "Installation Location",
          value: record.installationLocation,
        });
      }
      if (record.ipAddress) {
        pairs.push({ label: "IP Address", value: record.ipAddress });
      }
      if (record.operatingSystem) {
        pairs.push({ label: "Operating System", value: record.operatingSystem });
      }
      if (record.performedBy) {
        pairs.push({ label: "Performed By", value: record.performedBy });
      }
      if (record.returnedBy) {
        pairs.push({ label: "Returned By", value: record.returnedBy });
      }
      if (record.notes) {
        pairs.push({ label: "Notes", value: record.notes });
      }
    }
  } else {
    // Maintenance-specific
    if (record.maintenanceDescription) {
      pairs.push({
        label: "Description",
        value: record.maintenanceDescription,
      });
    }
    if (record.maintenanceStatus) {
      pairs.push({
        label: "Maintenance Status",
        value: record.maintenanceStatus,
      });
    }
    if (record.date) {
      pairs.push({
        label: "Scheduled Date",
        value: formatDisplayDateTime(record.date),
      });
    }
    if (record.completionDate) {
      pairs.push({
        label: "Completion Date",
        value: formatDisplayDateTime(record.completionDate),
      });
    }
    if (record.durationDays != null) {
      pairs.push({ label: "Duration (Days)", value: record.durationDays });
    }
    if (record.cost != null) {
      pairs.push({
        label: "Cost (INR)",
        value: `₹${formatCurrencyValue(record.cost)}`,
      });
    }

    // Parse structured changes from notes (format: "Maintenance Status: Field: old -> new | Field2: old2 -> new2")
    if (record.notes && record.notes.includes("->")) {
      // Extract the diff portion after the first colon+space following "Maintenance <Status>:"
      const diffMatch = record.notes.match(/^Maintenance [^:]+:\s*(.+)$/);
      if (diffMatch) {
        const diffParts = diffMatch[1].split(" | ");
        for (const part of diffParts) {
          const fieldMatch = part.match(/^(.+?):\s*(.+?)\s*->\s*(.+)$/);
          if (fieldMatch) {
            pairs.push({
              label: fieldMatch[1].trim(),
              value: `${fieldMatch[2].trim()} → ${fieldMatch[3].trim()}`,
            });
          }
        }
      }
    } else if (record.notes && !record.notes.includes("->")) {
      pairs.push({ label: "Notes", value: record.notes });
    }
    if (record.performedBy) {
      pairs.push({ label: "Created By", value: record.performedBy });
    }
  }

  // Filter out empty values
  const visiblePairs = pairs.filter(
    (p) => p.value !== null && p.value !== undefined && p.value !== "",
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[95dvh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <div className="flex items-start gap-4">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                {record.unitName && record.unitCode
                  ? `${record.unitName} (${record.unitCode})`
                  : record.unitName ||
                    record.unitCode ||
                    getSummaryText(record)}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-gray-500">
                  {formatDisplayDateTime(record.date)}
                </p>
                <span
                  className={getPillBadgeClass(
                    getTypeColor(record.type),
                    "xs",
                    "gap-1",
                  )}>
                  {getRecordIcon(record)}
                  <span className="leading-none">
                    {getTypeLabel(record.type)}
                  </span>
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {showMaintenanceVisit && onViewMaintenance && maintenanceTarget && (
              <button
                onClick={() => {
                  onClose();
                  onViewMaintenance(maintenanceTarget);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 transition-all">
                <Wrench className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Maintenance Visit</span>
              </button>
            )}
            {/* Go to Asset button for chain records */}
            {showAssetButtons &&
              record.type === "chain" &&
              record.chainAssetId &&
              onViewAsset &&
              (() => {
                const chainAsset = assets.find(
                  (a) => String(a.id) === String(record.chainAssetId),
                );
                return chainAsset ? (
                  <button
                    onClick={() => {
                      onClose();
                      onViewAsset(chainAsset);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 transition-all">
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">View Asset</span>
                  </button>
                ) : null;
              })()}
            {/* Generic View Asset button for all other record types */}
            {showAssetButtons &&
              onViewAsset &&
              assetId &&
              record.type !== "chain" &&
              (() => {
                // For maintenance records on child assets, view the child asset. Otherwise view the parent.
                const targetAssetToViewId = record.unitCode
                  ? assets.find((a) => a.assetCode === record.unitCode)?.id
                  : assetId;
                const sourceAsset = assets.find(
                  (a) => String(a.id) === String(targetAssetToViewId),
                );
                return sourceAsset ? (
                  <button
                    onClick={() => {
                      onClose();
                      onViewAsset(sourceAsset);
                    }}
                    className="mobile-xs inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-all">
                    <ExternalLink className="w-3.5 h-3.5" />
                    View Asset
                  </button>
                ) : null;
              })()}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 modal-safe-bottom">
          <div className="divide-y divide-gray-100">
            {visiblePairs.map((pair, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 sm:gap-3 px-4 sm:px-6 py-3 hover:bg-gray-50/50 transition-colors">
                <span className="ui-meta-label w-24 sm:w-36 md:w-44 shrink-0 pt-0.5">
                  {pair.label}
                </span>
                <span className="text-sm font-medium text-gray-900 wrap-break-word min-w-0">
                  {pair.label === "Record Type" ? (
                    <span
                      className={getPillBadgeClass(
                        getTypeColor(record.type),
                        "sm",
                        "gap-1.5",
                      )}>
                      {getRecordIcon(record)}
                      {pair.value}
                    </span>
                  ) : pair.label === "Status" ? (
                    <span
                      className={getPillBadgeClass(
                        "bg-gray-100 text-gray-700 border-gray-200",
                        "sm",
                        "mobile-xs",
                      )}>
                      {pair.value}
                    </span>
                  ) : pair.label.includes("Condition") ? (
                    <span
                      className={getPillBadgeClass(
                        getConditionBadgeColor(String(pair.value)),
                        "sm",
                      )}>
                      {pair.value}
                    </span>
                  ) : (
                    String(pair.value)
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// =============================================
// MAIN COMPONENT
// =============================================

export function AssetHistory({
  history,
  licenseAllocations = [],
  assetCategory,
  users = [],
  assetId,
  isBulkOrder,
  assets = [],
  onViewAsset,
  onViewMaintenance,
  assetCode,
  assetName,
  maintenanceRecords = [],
  userRole,
}: AssetHistoryProps) {
  const isSoftware = isSoftwareLikeCategory(assetCategory || "");
  const isMobile = useIsMobile();

  // ── State ──────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<HistoryRecord | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [activeDropdown, setActiveDropdown] = useState<"type" | null>(null);
  const typeDropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const typeDropdownMenuRef = useRef<HTMLDivElement>(null);

  const { openUpward: openTypeUpward, maxHeight: typeDropdownMaxHeight } =
    useSmartDropdownPosition({
      isOpen: activeDropdown === "type",
      anchorRef: typeDropdownTriggerRef,
      menuRef: typeDropdownMenuRef,
      preferredMaxHeight: 240,
    });

  const debouncedSearch = useDebounce(searchQuery, 400);

  // ── Helpers ──────────────────────────────────────────
  const getUserName = (id: string | null) => {
    if (!id) return null;
    const user = users.find((u) => u.employeeId === id || u.userName === id);
    return user ? user.userName : id;
  };

  const isParentBulkView = Boolean(isBulkOrder && assetId);

  const bulkChildAssetIds = useMemo(() => {
    const ids = new Set<string>();
    if (!isBulkOrder) return ids;

    assets
      .filter(
        (a) =>
          String(a.bulkOrderParentId) === String(assetId) && !a.isBulkOrder,
      )
      .forEach((a) => ids.add(String(a.id)));

    return ids;
  }, [isBulkOrder, assetId, assets]);

  // Build set of ALL asset IDs owned by this asset (parent + bulk children)
  const ownedAssetIds = useMemo(() => {
    const ids = new Set<string>();
    if (assetId) ids.add(String(assetId));
    if (isBulkOrder) {
      bulkChildAssetIds.forEach((id) => ids.add(id));
    }
    return ids;
  }, [assetId, isBulkOrder, bulkChildAssetIds]);

  const baseAllocations = useMemo(
    () =>
      licenseAllocations.filter(
        (a) =>
          // Keep records where this asset (or its children) IS the allocated asset
          ownedAssetIds.has(String(a.assetId)) &&
          // Exclude chain allocations: other assets allocated TO this asset/children
          !(
            a.parentAssetId &&
            ownedAssetIds.has(String(a.parentAssetId)) &&
            !ownedAssetIds.has(String(a.assetId))
          ),
      ),
    [licenseAllocations, ownedAssetIds],
  );

  // 1) Allocation entries (from Allocations table — snapshot data)
  const allocationEntries: HistoryRecord[] = useMemo(
    () =>
      baseAllocations.flatMap((a) => {
        const isToAsset = !!(a.parentAssetId || a.parentAssetName);
        const isReturned = a.status !== ALLOCATION_STATUS_DISPLAY.ACTIVE;
        const isBulkChild =
          isBulkOrder && String(a.assetId) !== String(assetId);

        const isToLocation =
          !isToAsset && !a.employeeId && !!a.installationLocation;
        const baseRecord = {
          targetName: isToAsset
            ? a.parentAssetName || `Asset ${a.parentAssetId}`
            : isToLocation
              ? a.installationLocation || "Unknown Location"
              : a.userName || "Unknown",
          targetId: isToAsset ? null : a.employeeId,
          targetDepartment: isToAsset ? null : a.department,
          isAssetAllocation: isToAsset,
          targetAssetId: isToAsset ? String(a.parentAssetId) : null,
          unitCode: isBulkChild ? a.assetCode : undefined,
          unitName: isBulkChild ? a.assetName : undefined,
          quantity: a.licensesAllocated,
          ipAddress: a.ipAddress || null,
          operatingSystem: a.operatingSystem || null,
          installationLocation: a.installationLocation || null,
        };

        const records: HistoryRecord[] = [
          {
            ...baseRecord,
            id: `alloc-${a.id}`,
            type: "allocation" as const,
            status: isReturned ? "Allocated" : a.status,
            date: a.allocationDate,
            returnDate: null,
            performedBy: a.assignedBy ? getUserName(a.assignedBy) : null,
            returnedBy: null,
            conditionAtAllocation: a.conditionAtAllocation || null,
            conditionAtReturn: null,
            durationDays: isReturned
              ? null
              : calculateDuration(a.allocationDate, a.returnDate ?? null),
          },
        ];

        if (isReturned && a.returnDate) {
          records.push({
            ...baseRecord,
            id: `return-${a.id}`,
            type: "return" as const,
            status: a.status,
            date: a.returnDate,
            returnDate: a.returnDate,
            performedBy: a.returnedBy ? getUserName(a.returnedBy) : null,
            returnedBy: a.returnedBy ? getUserName(a.returnedBy) : null,
            conditionAtAllocation: null,
            conditionAtReturn: a.conditionAtReturn || null,
            durationDays: calculateDuration(a.allocationDate, a.returnDate),
          });
        }

        return records;
      }),
    [baseAllocations, assetId, isBulkOrder, ownedAssetIds, users],
  );

  // 2) Chain entries (other assets allocated TO this asset or its children)
  const chainAllocEntries: HistoryRecord[] = useMemo(
    () =>
      licenseAllocations
        .filter(
          (a) =>
            a.parentAssetId &&
            ownedAssetIds.has(String(a.parentAssetId)) &&
            !ownedAssetIds.has(String(a.assetId)),
        )
        .flatMap((a) => {
          const isReturned = a.status !== ALLOCATION_STATUS_DISPLAY.ACTIVE;
          const baseRecord = {
            targetName: a.assetName || a.assetCode || "Asset",
            targetId: null,
            targetDepartment: null,
            isAssetAllocation: true,
            quantity: a.licensesAllocated,
            ipAddress: a.ipAddress || null,
            operatingSystem: a.operatingSystem || null,
            installationLocation: a.installationLocation || null,
            chainAssetId: String(a.assetId),
            chainAssetCode: a.assetCode,
            chainAssetName: a.assetName,
            chainCategory: undefined,
            unitCode: a.assetCode,
            unitName: a.assetName,
          };

          const records: HistoryRecord[] = [
            {
              ...baseRecord,
              id: `chain-alloc-${a.id}`,
              type: "chain" as const,
              status: isReturned
                ? "Active"
                : a.status === ALLOCATION_STATUS_DISPLAY.ACTIVE
                  ? "Active"
                  : a.status,
              date: a.allocationDate,
              returnDate: null,
              performedBy: a.assignedBy ? getUserName(a.assignedBy) : null,
              returnedBy: null,
              conditionAtAllocation: a.conditionAtAllocation || null,
              conditionAtReturn: null,
              durationDays: isReturned
                ? null
                : calculateDuration(a.allocationDate, a.returnDate ?? null),
            },
          ];

          if (isReturned && a.returnDate) {
            records.push({
              ...baseRecord,
              id: `chain-return-${a.id}`,
              type: "return" as const,
              status: a.status,
              date: a.returnDate,
              returnDate: a.returnDate,
              performedBy: a.returnedBy ? getUserName(a.returnedBy) : null,
              returnedBy: a.returnedBy ? getUserName(a.returnedBy) : null,
              conditionAtAllocation: null,
              conditionAtReturn: a.conditionAtReturn || null,
              durationDays: calculateDuration(a.allocationDate, a.returnDate),
            });
          }

          return records;
        }),
    [licenseAllocations, ownedAssetIds, users],
  );

  // Chain entries from API history (for records not in allocations)
  const chainAllocAssetIds = useMemo(
    () => new Set(chainAllocEntries.map((e) => e.chainAssetCode)),
    [chainAllocEntries],
  );

  const chainHistoryEntries: HistoryRecord[] = useMemo(
    () =>
      history
        .filter(
          (h) =>
            (h.isChildAsset === true ||
              (h.parentAssetId &&
                String(h.parentAssetId) === String(assetId))) &&
            !chainAllocAssetIds.has(h.assetCode),
        )
        .flatMap((h) => {
          const isReturned = !!h.returnedDate;
          const baseRecord = {
            targetName: h.assetName || h.assetCode || "Asset",
            targetId: null,
            targetDepartment: null,
            isAssetAllocation: true,
            notes: h.notes,
            quantity: h.licensesAllocated,
            ipAddress: h.ipAddress || null,
            operatingSystem: h.operatingSystem || null,
            installationLocation: h.installationLocation || null,
            chainAssetId: String(h.assetId),
            chainAssetCode: h.assetCode,
            chainAssetName: h.assetName,
            chainCategory: h.category,
            unitCode: h.assetCode,
            unitName: h.assetName,
          };

          const records: HistoryRecord[] = [
            {
              ...baseRecord,
              id: `chain-${h.id}-alloc`,
              type: "chain" as const,
              status: isReturned ? "Active" : h.status,
              date: h.assignedDate,
              returnDate: null,
              performedBy: h.performedByName || getUserName(h.assignedBy),
              returnedBy: null,
              conditionAtAllocation: h.conditionAtAllocation || null,
              conditionAtReturn: null,
              durationDays: isReturned
                ? null
                : calculateDuration(h.assignedDate, h.returnedDate),
            },
          ];

          if (isReturned && h.returnedDate) {
            records.push({
              ...baseRecord,
              id: `chain-${h.id}-return`,
              type: "return" as const,
              status: h.status,
              date: h.returnedDate,
              returnDate: h.returnedDate,
              performedBy: h.returnedBy ? getUserName(h.returnedBy) : null,
              returnedBy: h.returnedBy ? getUserName(h.returnedBy) : null,
              conditionAtAllocation: null,
              conditionAtReturn: h.conditionAtReturn || null,
              durationDays: calculateDuration(h.assignedDate, h.returnedDate),
            });
          }

          return records;
        }),
    [history, assetId, chainAllocAssetIds, users],
  );

  // 2b) Creation entries (from AssetHistory table)
  const creationEntries: HistoryRecord[] = useMemo(
    () =>
      history
        .filter(
          (h) =>
            h.actionType === "CREATION" && 
            ownedAssetIds.has(String(h.assetId)) &&
            !(isParentBulkView && bulkChildAssetIds.has(String(h.assetId)))
        )
        .map((h) => ({
          id: `create-${h.id}`,
          type: "creation" as const,
          targetName: h.assetName || h.assetCode || "Asset",
          targetId: null,
          targetDepartment: null,
          isAssetAllocation: false,
          status: "Created",
          date: h.assignedDate,
          returnDate: null,
          performedBy: h.performedByName || getUserName(h.assignedBy),
          returnedBy: null,
          conditionAtAllocation:
            h.condition ||
            h.conditionAtAllocation ||
            assets.find((a) => String(a.id) === String(h.assetId))?.condition ||
            null,
          conditionAtReturn: null,
          notes: h.notes || h.changeDescription || "Asset created",
          unitCode: h.assetCode || undefined,
          unitName: h.assetName || undefined,
        })),
    [
      history,
      users,
      assets,
      ownedAssetIds,
      isParentBulkView,
      bulkChildAssetIds,
    ],
  );

  // 3) Dispose entries
  const disposeEntries: HistoryRecord[] = useMemo(
    () =>
      history
        .filter(
          (h) => h.actionType === "DISPOSAL" || h.notes?.includes("disposed"),
        )
        .map((h) => ({
          id: `dispose-${h.id}`,
          type: "dispose" as const,
          targetName: h.assetName || h.assetCode || "Asset",
          targetId: null,
          targetDepartment: null,
          isAssetAllocation: false,
          status: "Disposed",
          date: h.assignedDate,
          returnDate: null,
          performedBy: h.performedByName || getUserName(h.assignedBy),
          returnedBy: null,
          conditionAtAllocation: null,
          conditionAtReturn: null,
          notes: h.notes,
          disposeCondition: h.condition || h.conditionAtReturn || null,
          disposeReason: h.changeDescription || h.notes || null,
          unitCode: h.assetCode || undefined,
          unitName: h.assetName || undefined,
        })),
    [history, users],
  );

  // 3b) Maintenance history entries (from AssetHistory table — status transition events)
  // The maintenanceEntries (from Maintenance table) covers the creation record with full data.
  // This section covers UPDATE events (status transitions, field changes) and CANCEL (soft-delete).
  const maintenanceHistoryEntries: HistoryRecord[] = useMemo(
    () =>
      history
        .filter(
          (h) =>
            ownedAssetIds.has(String(h.assetId)) &&
            // In parent bulk view, keep one bulk maintenance source of truth on parent.
            (!isParentBulkView || !bulkChildAssetIds.has(String(h.assetId))) &&
            h.actionType &&
            (h.actionType === "MAINTENANCE_UPDATE" ||
              h.actionType === "MAINTENANCE_END" ||
              h.actionType === "MAINTENANCE_CANCEL" ||
              h.actionType === "DELETION" ||
              // MAINTENANCE_START from UPDATE route (contains -> in notes = status transition)
              (h.actionType === "MAINTENANCE_START" &&
                h.notes?.includes("->"))),
        )
        .map((h) => {
          let statusLabel = "Updated";
          if (h.actionType === "MAINTENANCE_START") statusLabel = "In Progress";
          else if (h.actionType === "MAINTENANCE_END")
            statusLabel = "Completed";
          else if (h.actionType === "MAINTENANCE_UPDATE")
            statusLabel = "Updated";
          else if (h.actionType === "MAINTENANCE_CANCEL")
            statusLabel = "Cancelled";
          else if (h.actionType === "DELETION") statusLabel = "Deleted";

          return {
            id: `maint-hist-${h.id}`,
            type: "maintenance" as const,
            targetName: h.notes || "Maintenance action",
            targetId: null,
            targetDepartment: null,
            isAssetAllocation: false,
            status: statusLabel,
            date: h.assignedDate,
            performedBy: h.performedByName || getUserName(h.assignedBy),
            notes: h.notes,
            maintenanceDescription: h.notes,
            maintenanceStatus: statusLabel,
            maintenanceAssetId: String(h.assetId),
            unitCode: h.assetCode || undefined,
            unitName: h.assetName || undefined,
          };
        }),
    [history, users, ownedAssetIds, isParentBulkView, bulkChildAssetIds],
  );

  // 4) Maintenance entries
  // For bulk parents, keep parent record as single source of truth.
  const childAssetIds = useMemo(
    () =>
      isBulkOrder
        ? isParentBulkView
          ? []
          : Array.from(bulkChildAssetIds)
        : [],
    [isBulkOrder, isParentBulkView, bulkChildAssetIds],
  );

  const maintenanceCreationSnapshots = useMemo(() => {
    const snapshots = new Map<
      string,
      Array<{ date: string; status: string; performedBy: string | null }>
    >();

    history.forEach((h) => {
      if (
        h.actionType !== "MAINTENANCE_SCHEDULE" &&
        h.actionType !== "MAINTENANCE_START"
      )
        return;

      const description = normalizeMaintenanceDescription(
        extractMaintenanceHistoryDescription(h.notes),
      );
      if (!description) return;

      const status =
        h.actionType === "MAINTENANCE_START" ? "In Progress" : "Scheduled";
      const performedBy = h.performedByName || getUserName(h.assignedBy);
      const key = `${String(h.assetId)}::${description}`;
      const entry = { date: h.assignedDate, status, performedBy };

      const existing = snapshots.get(key);
      if (existing) {
        existing.push(entry);
      } else {
        snapshots.set(key, [entry]);
      }
    });

    return snapshots;
  }, [history, users]);

  const getInitialMaintenanceSnapshot = useCallback(
    (record: MaintenanceRecord) => {
      const descriptionKey = normalizeMaintenanceDescription(
        record.description,
      );
      if (!descriptionKey) {
        return { status: record.status, performedBy: null };
      }

      const key = `${String(record.assetId)}::${descriptionKey}`;
      const entries = maintenanceCreationSnapshots.get(key);
      if (!entries || entries.length === 0) {
        return { status: record.status, performedBy: null };
      }

      if (entries.length === 1) {
        return {
          status: entries[0].status,
          performedBy: entries[0].performedBy || null,
        };
      }

      const anchor = record.createdAt || record.scheduledDate;
      if (!anchor) {
        return {
          status: entries[0].status,
          performedBy: entries[0].performedBy || null,
        };
      }

      const anchorTs = new Date(anchor).getTime();
      let best = entries[0];
      let bestDiff = Math.abs(new Date(best.date).getTime() - anchorTs);

      for (const entry of entries.slice(1)) {
        const diff = Math.abs(new Date(entry.date).getTime() - anchorTs);
        if (diff < bestDiff) {
          best = entry;
          bestDiff = diff;
        }
      }

      return { status: best.status, performedBy: best.performedBy || null };
    },
    [maintenanceCreationSnapshots],
  );

  const maintenanceEntries: HistoryRecord[] = useMemo(
    () =>
      maintenanceRecords
        .filter(
          (m) =>
            String(m.assetId) === String(assetId) ||
            childAssetIds.includes(String(m.assetId)),
        )
        .map((m) => {
          const snapshot = getInitialMaintenanceSnapshot(m);
          const initialStatus = snapshot.status;
          const performedBy =
            m.createdByName || m.createdBy || snapshot.performedBy || null;
          const completionDate =
            initialStatus === "Completed" ? m.completionDate : null;

          return {
            id: `maint-${m.id}`,
            type: "maintenance" as const,
            targetName: m.description || "Maintenance",
            targetId: null,
            targetDepartment: null,
            isAssetAllocation: false,
            status: initialStatus,
            // Order maintenance creation records by actual creation timestamp.
            // Fallback to scheduled date for legacy rows without createdAt.
            date: m.createdAt || m.scheduledDate,
            performedBy,
            notes: m.notes,
            maintenanceDescription: m.description,
            technician: m.technician,
            cost: m.cost,
            maintenanceStatus: initialStatus,
            completionDate,
            durationDays: completionDate
              ? calculateDuration(m.scheduledDate, completionDate)
              : null,
            maintenanceId: String(m.id),
            maintenanceAssetId: String(m.assetId),
            unitCode: m.assetCode,
            unitName: m.assetName,
          };
        }),
    [maintenanceRecords, assetId, childAssetIds, getInitialMaintenanceSnapshot],
  );

  // 5) Generic Update entries (from AssetHistory table)
  const updateEntries: HistoryRecord[] = useMemo(
    () =>
      history
        .filter(
          (h) =>
            h.actionType === "UPDATE" && ownedAssetIds.has(String(h.assetId)),
        )
        .map((h) => ({
          id: `update-${h.id}`,
          type: "update" as const,
          targetName: h.assetName || h.assetCode || "Asset",
          targetId: null,
          targetDepartment: null,
          isAssetAllocation: false,
          status: "Updated",
          date: h.assignedDate,
          performedBy: h.performedByName || getUserName(h.assignedBy),
          notes: h.notes || h.changeDescription || "Asset updated",
          unitCode: h.assetCode || undefined,
          unitName: h.assetName || undefined,
        })),
    [history, users, ownedAssetIds],
  );

  // Combine all
  const allRecords: HistoryRecord[] = useMemo(
    () =>
      [
        ...allocationEntries,
        ...creationEntries,
        ...chainAllocEntries,
        ...chainHistoryEntries,
        ...disposeEntries,
        ...maintenanceHistoryEntries,
        ...maintenanceEntries,
        ...updateEntries,
      ].sort((a, b) => {
        const dateDiff =
          new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        // Fallback to ID for stable sorting if dates are exact same
        const idA = parseInt(String(a.id).replace(/[^\d]/g, "") || "0");
        const idB = parseInt(String(b.id).replace(/[^\d]/g, "") || "0");
        return idB - idA;
      }),
    [
      allocationEntries,
      creationEntries,
      chainAllocEntries,
      chainHistoryEntries,
      disposeEntries,
      maintenanceHistoryEntries,
      maintenanceEntries,
    ],
  );

  // ── Stats ────────────────────────────────────────────
  const activeCount = baseAllocations.filter(
    (a) => a.status === ALLOCATION_STATUS_DISPLAY.ACTIVE,
  ).length;
  const returnedCount = baseAllocations.filter(
    (a) => a.status !== ALLOCATION_STATUS_DISPLAY.ACTIVE,
  ).length;
  // Total usage should count only completed allocations (with a return date).
  // Active allocations are excluded to avoid inflating the historical usage metric.
  const totalUsageDays = baseAllocations.reduce((acc, a) => {
    if (!a.returnDate) return acc;
    return acc + calculateDuration(a.allocationDate, a.returnDate);
  }, 0);

  // ── Filtering ────────────────────────────────────────
  const filteredRecords = useMemo(() => {
    let records = allRecords;

    // Type filter
    if (selectedType) {
      records = records.filter((r) => r.type === selectedType);
    }

    // Date range
    if (startDate) {
      const start = new Date(startDate);
      records = records.filter((r) => new Date(r.date) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      records = records.filter((r) => new Date(r.date) <= end);
    }

    // Search
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      records = records.filter((r) => {
        const searchable = [
          r.targetName,
          r.targetId,
          r.targetDepartment,
          r.unitCode,
          r.unitName,
          r.chainAssetCode,
          r.chainAssetName,
          r.status,
          r.performedBy,
          r.returnedBy,
          r.notes,
          r.maintenanceDescription,
          r.technician,
          r.disposeReason,
          r.conditionAtAllocation,
          r.conditionAtReturn,
          getTypeLabel(r.type),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchable.includes(q);
      });
    }

    return records;
  }, [allRecords, selectedType, startDate, endDate, debouncedSearch]);

  // ── Pagination ───────────────────────────────────────
  const totalRecords = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRecords = useMemo(
    () => filteredRecords.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredRecords, safePage, pageSize],
  );

  // Reset page on filter change
  const resetPage = useCallback(() => setPage(1), []);
  // Note: we call resetPage inside handlers instead of useEffect to avoid stale closures

  const hasActiveFilters = !!selectedType || !!startDate || !!endDate;

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedType("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  // ── CSV Export ───────────────────────────────────────
  const handleExportCSV = useCallback(() => {
    if (filteredRecords.length === 0) return;

    const headers = [
      "S.No",
      "Record Type",
      "Date",
      "Target / Description",
      "Employee ID",
      "Department",
      "Status",
      "Condition at Allocation",
      "Condition at Return",
      "Return Date",
      "Duration (Days)",
      "Quantity",
      "IP Address",
      "Operating System",
      "Installation Location",
      "Created By / Performed By",
      "Returned By",
      "Notes",
      "Technician",
      "Cost (INR)",
      "Maintenance Status",
      "Completion Date",
      "Dispose Condition",
      "Dispose Reason",
      "Unit Code",
      "Unit Name",
      "Chain Asset Code",
      "Chain Asset Name",
    ];

    const rows = filteredRecords.map((r, i) => [
      i + 1,
      getTypeLabel(r.type),
      formatCSVDateTime(r.date),
      r.type === "maintenance"
        ? r.maintenanceDescription || ""
        : r.targetName || "",
      r.targetId || "",
      r.targetDepartment || "",
      r.status || "",
      r.conditionAtAllocation || "",
      r.conditionAtReturn || "",
      r.returnDate ? formatCSVDate(r.returnDate) : "",
      r.durationDays ?? "",
      r.quantity ?? "",
      r.ipAddress || "",
      r.operatingSystem || "",
      r.installationLocation || "",
      r.performedBy || "",
      r.returnedBy || "",
      r.notes || "",
      r.technician || "",
      r.cost ?? "",
      r.maintenanceStatus || "",
      r.completionDate ? formatCSVDate(r.completionDate) : "",
      r.disposeCondition || "",
      r.disposeReason || "",
      r.unitCode || "",
      r.unitName || "",
      r.chainAssetCode || "",
      r.chainAssetName || "",
    ]);

    const assetLabel = assetName
      ? `${assetName}${assetCode ? ` (${assetCode})` : ""}`
      : assetCode || "Asset";

    const safeCode = (assetCode || "asset")
      .replace(/[^a-zA-Z0-9-_]/g, "_")
      .substring(0, 30);
    openDataView({
      title: `Asset History — ${assetLabel}`,
      headers,
      rows,
      filename: `asset_history_${safeCode}_${new Date().toISOString().split("T")[0]}.csv`,
    });
  }, [
    filteredRecords,
    assetCode,
    assetName,
    activeCount,
    returnedCount,
    totalUsageDays,
  ]);

  // ── Component return ─────────────────────────────────
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        {(
          [
            {
              g: "from-blue-50 to-blue-100 border-blue-200",
              ib: "bg-blue-500",
              lc: "text-blue-600",
              vc: "text-blue-900",
              icon: isSoftware ? (
                <Box className={STAT_ICO} />
              ) : (
                <User className={STAT_ICO} />
              ),
              label:
                userRole === "Viewer"
                  ? "Total Allocations"
                  : "Total Allocations",
              value: baseAllocations.length,
            },
            {
              g: "from-green-50 to-green-100 border-green-200",
              ib: "bg-green-500",
              lc: "text-green-600",
              vc: "text-green-900",
              icon: <TrendingUp className={STAT_ICO} />,
              label: isSoftware
                ? "Active Licenses"
                : userRole === "Viewer"
                  ? "Currently Held"
                  : "Currently Active",
              value: activeCount,
            },
            {
              g: "from-purple-50 to-purple-100 border-purple-200",
              ib: "bg-purple-500",
              lc: "text-purple-600",
              vc: "text-purple-900",
              icon: <Calendar className={STAT_ICO} />,
              label:
                userRole === "Viewer" ? "Returned Assets" : "Past Allocations",
              value: returnedCount,
            },
            {
              g: "from-orange-50 to-orange-100 border-orange-200",
              ib: "bg-orange-500",
              lc: "text-orange-600",
              vc: "text-orange-900",
              icon: <Clock className={STAT_ICO} />,
              label: "Total Usage",
              value: `${totalUsageDays}d`,
            },
          ] as const
        ).map((s, i) => (
          <div
            key={i}
            className={`bg-linear-to-br ${s.g} rounded-lg p-2 sm:p-3 border`}>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className={`p-1 sm:p-1.5 ${s.ib} rounded-lg`}>{s.icon}</div>
              <div>
                <p
                  className={`text-[8px] sm:text-[10px] ${s.lc} font-semibold uppercase tracking-wide`}>
                  {s.label}
                </p>
                <p
                  className={`text-sm sm:text-base font-bold ${s.vc} leading-none mt-0.5`}>
                  {s.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Search, Filters, Export Bar ── */}
      <div className="bg-white rounded-lg shadow sm:p-4 p-3">
        <div className="flex flex-col gap-3">
          {/* Top row: Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                resetPage();
              }}
              placeholder="Search history..."
              className="w-full pl-9 pr-10 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  resetPage();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Bottom row: Type Dropdown + Filters toggle + Export */}
          <div className="flex items-center gap-2">
            {/* Type Dropdown with dot menu */}
            <div className="relative">
              <button
                ref={typeDropdownTriggerRef}
                onClick={() =>
                  setActiveDropdown(activeDropdown === "type" ? null : "type")
                }
                className={`h-10 min-w-30 sm:min-w-35 flex items-center justify-between gap-2 px-3 border rounded-lg transition-all text-xs sm:text-sm font-semibold shadow-sm bg-white hover:border-gray-400 group whitespace-nowrap ${
                  activeDropdown === "type"
                    ? "ring-2 ring-blue-500 border-blue-500"
                    : selectedType
                      ? "bg-blue-50 text-blue-700 border-blue-300"
                      : "border-gray-300 text-gray-700"
                }`}
                title="Filter by Record Type">
                <span className="text-xs sm:text-sm">
                  {selectedType
                    ? RECORD_TYPES.find((t) => t.value === selectedType)
                        ?.label || selectedType
                    : "All Types"}
                </span>
                <motion.div
                  animate={{ rotate: activeDropdown === "type" ? 180 : 0 }}
                  transition={{ duration: 0.2 }}>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </motion.div>
              </button>

              {/* Type Dropdown Menu — colored dots + check */}
              <AnimatePresence>
                {activeDropdown === "type" && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setActiveDropdown(null)}
                    />
                    <motion.div
                      ref={typeDropdownMenuRef}
                      initial={{ opacity: 0, scale: 0.98, y: 2 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98, y: 2 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className={`absolute z-50 w-52 bg-white rounded-xl shadow-xl overflow-hidden py-1 overflow-y-auto ${
                        openTypeUpward ? "bottom-full mb-1" : "top-full mt-1"
                      }`}
                      style={{
                        maxHeight: `${typeDropdownMaxHeight}px`,
                        boxShadow:
                          "0 10px 30px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
                      }}>
                      {RECORD_TYPES.map((t) => {
                        const isSelected = selectedType === t.value;
                        return (
                          <button
                            key={t.value}
                            onClick={() => {
                              setSelectedType(t.value);
                              setActiveDropdown(null);
                              resetPage();
                            }}
                            className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm font-medium transition-all duration-150 ${isSelected ? t.hl : "text-gray-700 hover:bg-gray-50"}`}>
                            <div className={`w-2 h-2 rounded-full ${t.dot}`} />
                            <span>{t.label}</span>
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

            {/* Filters Toggle */}
            <button
              onClick={() => {
                setShowFilters((prev) => {
                  const next = !prev;
                  if (!next) setActiveDropdown(null);
                  return next;
                });
              }}
              className={`h-10 min-w-30 sm:min-w-35 flex items-center justify-between gap-2 px-3 text-xs sm:text-sm font-semibold rounded-lg border shadow-sm transition-all ${
                hasActiveFilters
                  ? "bg-blue-50 text-blue-700 border-blue-300"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400"
              }`}>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                <span className="text-xs sm:text-sm">Filters</span>
              </div>
              {hasActiveFilters && (
                <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {[selectedType, startDate, endDate].filter(Boolean).length}
                </span>
              )}
              {!hasActiveFilters && (
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${showFilters ? "rotate-180" : ""}`}
                />
              )}
            </button>

            {/* Export History */}
            <button
              onClick={handleExportCSV}
              disabled={filteredRecords.length === 0}
              className="flex items-center justify-center gap-1.5 h-10 px-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all shadow-sm ml-auto whitespace-nowrap">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export History</span>
            </button>
          </div>
        </div>

        {/* Expanded Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden">
              <div className="pt-4 mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1 min-w-0">
                  <label className="ui-filter-label">Start Date</label>
                  <input
                    type="date"
                    value={toDateInputValue(startDate)}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      resetPage();
                    }}
                    style={{ height: "40px", paddingTop: "0px", paddingBottom: "0px" }}
                    className={`w-full block px-3.5 border border-gray-300 rounded-lg shadow-sm bg-white hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer text-xs sm:text-sm font-semibold transition-all ${
                      startDate ? "text-gray-900" : "text-gray-400"
                    }`}
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="ui-filter-label">End Date</label>
                  <input
                    type="date"
                    value={toDateInputValue(endDate)}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      resetPage();
                    }}
                    style={{ height: "40px", paddingTop: "0px", paddingBottom: "0px" }}
                    className={`w-full block px-3.5 border border-gray-300 rounded-lg shadow-sm bg-white hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer text-xs sm:text-sm font-semibold transition-all ${
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

      {/* ── Table / Cards ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {totalRecords === 0 ? (
          <div className="text-center py-12">
            <History className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <h4 className="text-sm font-medium text-gray-900 mb-1">
              {hasActiveFilters || searchQuery
                ? "No Records Match"
                : "No History Records"}
            </h4>
            <p className="text-xs text-gray-500">
              {hasActiveFilters || searchQuery
                ? "Try adjusting your filters or search query"
                : isBulkOrder
                  ? "This bulk parent asset has no history records yet."
                  : "This asset has no history records yet."}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            {!isMobile && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="ui-table-head mobile-micro text-[10px] text-gray-500">
                        Date
                      </th>
                      <th className="ui-table-head mobile-micro text-[10px] text-gray-500">
                        Type
                      </th>
                      <th className="ui-table-head mobile-micro text-[10px] text-gray-500">
                        Details
                      </th>

                      <th className="ui-table-head mobile-micro text-[10px] text-gray-500">
                        Condition
                      </th>
                      <th className="ui-table-head mobile-micro text-[10px] text-gray-500">
                        By
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedRecords.map((record, idx) => (
                      <tr
                        key={record.id}
                        className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                        onClick={() => setSelectedRecord(record)}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-gray-700">
                            <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="mobile-xs text-xs">
                              {formatDisplayDate(record.date)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={getPillBadgeClass(
                              getTypeColor(record.type),
                              "sm",
                              "gap-1",
                            )}>
                            {getRecordIcon(record)}
                            {getTypeLabel(record.type)}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-70">
                          <div className="flex flex-col gap-0.5">
                            {record.unitCode && (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0 w-fit">
                                  {record.unitCode}
                                </span>
                                {record.unitName && (
                                  <span className="text-[10px] text-gray-500 font-medium">
                                    {record.unitName}
                                  </span>
                                )}
                              </div>
                            )}
                            <span
                              className="mobile-xs text-xs text-gray-600 truncate block"
                              title={getSummaryText(record)}>
                              {getSummaryText(record)}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          {record.type === "maintenance" &&
                          record.maintenanceStatus ? (
                            <span
                              className={getPillBadgeClass(
                                MAINT_STATUS_BADGE[record.maintenanceStatus] ??
                                  DEFAULT_MAINT_BADGE,
                                "xs",
                              )}>
                              {record.maintenanceStatus}
                            </span>
                          ) : record.conditionAtAllocation ||
                            record.conditionAtReturn ||
                            record.disposeCondition ? (
                            <span
                              className={getPillBadgeClass(
                                getConditionBadgeColor(
                                  record.conditionAtReturn ||
                                    record.conditionAtAllocation ||
                                    record.disposeCondition,
                                ),
                                "xs",
                              )}>
                              {record.conditionAtReturn ||
                                record.conditionAtAllocation ||
                                record.disposeCondition}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="mobile-xs px-4 py-3 text-xs text-gray-700 font-medium whitespace-nowrap">
                          {record.performedBy || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Mobile Card View */}
            {isMobile && (
              <div className="divide-y divide-gray-100">
                {paginatedRecords.map((record) => (
                  <div
                    key={record.id}
                    className="p-3 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedRecord(record)}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        {record.unitCode && (
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="mobile-micro inline-flex items-center gap-1 text-[10px] font-mono text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0">
                              {record.unitCode}
                            </span>
                            {record.unitName && (
                              <span className="mobile-micro text-[10px] text-gray-500 truncate">
                                {record.unitName}
                              </span>
                            )}
                          </div>
                        )}
                        <p
                          className={`text-sm text-gray-800 font-semibold leading-tight line-clamp-2 ${record.unitCode ? "mt-0.5" : ""}`}>
                          {getSummaryText(record)}
                        </p>
                      </div>
                      <span
                        className={getPillBadgeClass(
                          getTypeColor(record.type),
                          "xs",
                          "mobile-micro gap-1 shrink-0",
                        )}>
                        {getRecordIcon(record)}
                        {getTypeLabel(record.type)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-500 text-[11px]">
                      <Clock className="w-3 h-3 text-gray-400 shrink-0" />
                      <span className="mobile-micro text-[10px]">
                        {formatDisplayDate(record.date)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {record.type === "maintenance" &&
                        record.maintenanceStatus && (
                          <span
                            className={getPillBadgeClass(
                              MAINT_STATUS_BADGE[record.maintenanceStatus] ??
                                DEFAULT_MAINT_BADGE,
                              "xs",
                              "mobile-micro",
                            )}>
                            {record.maintenanceStatus}
                          </span>
                        )}
                      {record.performedBy && (
                        <span className="mobile-micro text-[10px] text-gray-600 font-medium truncate max-w-40">
                          {record.performedBy}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Pagination Footer ── */}
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          totalItems={totalRecords}
          itemsPerPage={pageSize}
          pageSizes={PAGE_SIZES}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          compact
        />
      </div>

      {/* ── Detail Modal ── */}
      <AnimatePresence>
        {selectedRecord && (
          <RecordDetailModal
            record={selectedRecord}
            onClose={() => setSelectedRecord(null)}
            onViewAsset={onViewAsset}
            onViewMaintenance={onViewMaintenance}
            assets={assets}
            maintenanceRecords={maintenanceRecords}
            assetId={assetId}
            userRole={userRole}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
