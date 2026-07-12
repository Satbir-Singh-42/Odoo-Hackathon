'use client';

import { motion, AnimatePresence } from "framer-motion";
import {
  useState,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import { dataService } from '@/lib/dataService';
import {
  X,
  MapPin,
  User,
  Box,
  Wrench,
  Trash2,
  Save,
  UserPlus,
  Pencil,
  Activity,
  Info,
  ShieldCheck,
  Users,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Link2,
  Key,
  Plus,
} from "lucide-react";
import {
  Asset,
  User as UserType,
  MaintenanceRecord,
  AssetHistory as AssetHistoryType,
  LicenseAllocation,
} from '@/types';
import {
  ASSET_CONDITIONS_ARRAY,
  DEFAULT_ASSET_CONDITION,
  ASSET_STATUS,
  MAINTENANCE_STATUS,
  hasPermission,
  PERMISSIONS,
  canUpdate as canRoleUpdate,
  type UserRole,
  hasHardwareSpecs,
  hasNetworkingSpecs,
  isSoftwareLikeCategory,
  hasDeploymentFields,
  hasOperatingSystemField,
  RAM_OPTIONS,
  STORAGE_OPTIONS,
} from '@/config/constants';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { StatusBadge, canAllocate, getPillBadgeClass } from '@/components/ui/StatusBadge';
import {
  isLicenseRenewalMaintenance,
  getMaintenanceRecordTimestamp,
  getMaintenanceBreakdownLabel,
  sumCosts,
} from '@/lib/utils/assetHelpers';
import { formatCurrencyValue } from '@/lib/utils/formatCurrency';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/utils/dateHelpers';
import { getErrorMessage } from '@/lib/utils/errorHelpers';
import { AssetHistory } from "./AssetHistory";
import { AssetAllotmentForm } from "./AssetAllotmentForm";
import { MaintenanceDetail } from "./MaintenanceDetail";
import { IndividualUnitsManagement } from "./IndividualUnitsManagement";
import { TroubleshootModal } from "./TroubleshootModal";
import { toast } from "sonner";

// =============================================
// TYPES
// =============================================

interface UnitDetailModalProps {
  unit: Asset;
  onClose: () => void;
  onEdit: (asset: Asset) => void;
  onUpdateUnit?: (unitId: string, updates: Partial<Asset>) => Promise<void>;
  /** Hide all tabs except details (used for single-unit allocation edit) */
  hideExtraTabs?: boolean;
  onAllocateUnit?: (
    unitId: string,
    data: {
      employeeId: string;
      userName: string;
      department: string;
      condition: string;
      installationLocation?: string;
      ipAddress?: string;
      macAddress?: string;
      operatingSystem?: string;
      serialNumber?: string;
      parentAssetId?: string;
      parentAssetName?: string;
    },
  ) => void;
  onReturnUnit?: (
    unitId: string,
    conditionAtReturn: string,
    notes?: string,
  ) => void;
  onBulkReturnUnit?: (
    revocations: Array<{
      allocationId: string;
      conditionAtReturn: string;
      notes?: string;
    }>,
  ) => void;
  onAddMaintenance?: (assetId: string) => void;
  onEditMaintenance?: (record: MaintenanceRecord) => void;
  users?: UserType[];
  /** All assets in system — used for "To Asset" allocation and serial validation */
  assets?: Asset[];
  licenseAllocations?: LicenseAllocation[];
  maintenanceRecords?: MaintenanceRecord[];
  assetHistory?: AssetHistoryType[];
  readOnly?: boolean;
  onDispose?: (unitId: string) => void;
  onDelete?: (unitId: string) => void;
  userRole?: UserRole;
  currentUser?: { role?: string; managedCategories?: string[] };
  /** All assets for serial number uniqueness validation */
  allAssets?: Asset[];
  /** Initial mode to open the modal in */
  initialMode?: "view" | "edit" | "allocate" | "return";
  /** Callback to navigate to an asset */
  onViewAsset?: (asset: Asset) => void;
}

// =============================================
// UI SUBCOMPONENTS
// =============================================

function DetailSection({
  title,
  children,
  icon,
  className = "space-y-2",
}: {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="space-y-2">
      <h3 className="ui-section-title flex items-center gap-1.5">
        {icon}
        {title}
      </h3>
      <div className={className}>{children}</div>
    </div>
  );
}

function FieldItem({
  label,
  value,
  icon,
}: {
  label: string;
  value?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="flex items-center gap-1">
        {icon && <span className="text-gray-400">{icon}</span>}
        <label className="ui-field-label">{label}</label>
      </div>
      <div className="text-xs sm:text-sm font-medium text-gray-900 wrap-break-word leading-tight">
        {value}
      </div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  maxLength,
  disabled = false,
  disabledHint,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <div>
      <label className="mobile-xs text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all ${
          disabled ? "bg-gray-100 text-gray-500 cursor-not-allowed" : "bg-white"
        }`}
      />
      {disabled && disabledHint && (
        <p className="text-xs text-gray-400 mt-1">{disabledHint}</p>
      )}
    </div>
  );
}

// =============================================
// MAIN COMPONENT
// =============================================

export function UnitDetailModal({
  unit,
  onClose,
  onUpdateUnit,
  onAllocateUnit,
  onReturnUnit,
  onBulkReturnUnit,
  onAddMaintenance,
  onEditMaintenance,
  users = [],
  assets = [],
  licenseAllocations = [],
  maintenanceRecords = [],
  assetHistory = [],
  readOnly = false,
  onDispose,
  userRole = "Viewer" as UserRole,
  currentUser,
  allAssets = [],
  initialMode = "view",
  hideExtraTabs = false,
  onViewAsset,
  onEdit,
}: UnitDetailModalProps) {
  const isBulkParent = useMemo(() => {
    // Only use the explicit isBulkOrder flag — totalQuantity on a child unit
    // can reflect the parent's quantity and must NOT be used for this check.
    return !!unit.isBulkOrder;
  }, [unit.isBulkOrder]);

  const [activeTab, setActiveTab] = useState<
    "details" | "allocation" | "maintenance" | "history" | "units"
  >("details");
  const canAccessAllocationTab =
    hasPermission(userRole, PERMISSIONS.ASSET_ALLOCATE) ||
    hasPermission(userRole, PERMISSIONS.ASSET_RETURN);

  useEffect(() => {
    if (!canAccessAllocationTab && activeTab === "allocation") {
      setActiveTab("details");
    }
  }, [canAccessAllocationTab, activeTab]);

  useEffect(() => {
    if (hideExtraTabs && activeTab !== "details") {
      setActiveTab("details");
    }
  }, [hideExtraTabs, activeTab]);

  const tabCls = (tab: string) =>
    `px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium transition-colors no-push border-b-2 whitespace-nowrap flex items-center gap-1 sm:gap-2 ${activeTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`;
  const [mode, setMode] = useState<"view" | "edit" | "allocate" | "return">(
    initialMode,
  );

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);
  const [isSaving, setIsSaving] = useState(false);
  const [showTroubleshootModal, setShowTroubleshootModal] = useState(false);
  const [selectedMaintenanceRecord, setSelectedMaintenanceRecord] =
    useState<MaintenanceRecord | null>(null);

  // Filter license allocations for THIS specific unit (sent or received)
  const unitAllocations = useMemo(
    () =>
      licenseAllocations.filter(
        (la) =>
          String(la.assetId) === String(unit.id) ||
          String(la.parentAssetId) === String(unit.id),
      ),
    [licenseAllocations, unit.id],
  );

  // Include transitive received assets for allocation view
  const relevantUnitAllocations = useMemo(() => {
    const rootAssetIds = new Set<string>([String(unit.id)]);

    if (unit.isBulkOrder) {
      assets
        .filter((a) => String(a.bulkOrderParentId) === String(unit.id))
        .forEach((a) => rootAssetIds.add(String(a.id)));
    }

    const chainAssetIds = new Set(rootAssetIds);
    let changed = true;

    while (changed) {
      changed = false;

      for (const alloc of licenseAllocations) {
        if (alloc.status !== "Active") continue;
        const parentId = alloc.parentAssetId ? String(alloc.parentAssetId) : "";
        const targetUnitId = String(
          (
            alloc as LicenseAllocation & {
              targetUnitId?: string | number | null;
            }
          ).targetUnitId || "",
        );
        const allocationAssetId = String(alloc.assetId);

        if (parentId && chainAssetIds.has(parentId)) {
          if (!chainAssetIds.has(allocationAssetId)) {
            chainAssetIds.add(allocationAssetId);
            changed = true;
          }
        }

        if (targetUnitId && chainAssetIds.has(targetUnitId)) {
          if (!chainAssetIds.has(allocationAssetId)) {
            chainAssetIds.add(allocationAssetId);
            changed = true;
          }
        }
      }
    }

    return licenseAllocations.filter((alloc) => {
      const allocationAssetId = String(alloc.assetId);
      const parentId = alloc.parentAssetId ? String(alloc.parentAssetId) : "";
      const targetUnitId = String(
        (
          alloc as LicenseAllocation & {
            targetUnitId?: string | number | null;
          }
        ).targetUnitId || "",
      );

      return (
        chainAssetIds.has(allocationAssetId) ||
        (parentId && chainAssetIds.has(parentId)) ||
        (targetUnitId && chainAssetIds.has(targetUnitId))
      );
    });
  }, [licenseAllocations, unit.id, unit.isBulkOrder, assets]);

  // Get the active allocation for deployment details (only outgoing)
  const activeAllocation = useMemo(
    () =>
      unitAllocations.find(
        (la) =>
          la.status === "Active" && String(la.assetId) === String(unit.id),
      ) || null,
    [unitAllocations, unit.id],
  );

  // Editable fields
  const [editFields, setEditFields] = useState({
    assetName: unit.assetName || "",
    installationLocation:
      activeAllocation?.installationLocation || unit.installationLocation || "",
    condition: unit.condition || DEFAULT_ASSET_CONDITION,
    serialNumber: unit.serialNumber || "",
    processor: unit.processor || "",
    ram: unit.ram || "",
    storage: unit.storage || "",
    macAddress: unit.macAddress || "",
    ipAddress: activeAllocation?.ipAddress || "",
    operatingSystem: activeAllocation?.operatingSystem || "",
  });

  // Resync edit fields when unit prop changes
  useEffect(() => {
    setEditFields({
      assetName: unit.assetName || "",
      installationLocation:
        activeAllocation?.installationLocation ||
        unit.installationLocation ||
        "",
      condition: unit.condition || DEFAULT_ASSET_CONDITION,
      serialNumber: unit.serialNumber || "",
      processor: unit.processor || "",
      ram: unit.ram || "",
      storage: unit.storage || "",
      macAddress: unit.macAddress || "",
      ipAddress: activeAllocation?.ipAddress || "",
      operatingSystem: activeAllocation?.operatingSystem || "",
    });
  }, [unit, activeAllocation]);

  // hasDirectAllocation is computed AFTER activeAllocation (line ~338)
  // to use actual allocation records as source of truth, not stale asset fields
  const isAvailable = unit.status === ASSET_STATUS.AVAILABLE;
  const isDisposed = unit.status === ASSET_STATUS.DISPOSED;

  const getCalendarDayKey = useCallback(
    (dateValue: string | null | undefined) => {
      if (!dateValue) return null;
      const date = new Date(dateValue);
      if (!Number.isFinite(date.getTime())) return null;

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");

      return `${year}-${month}-${day}`;
    },
    [],
  );

  const assetCreatedDayKey = useMemo(
    () => getCalendarDayKey(unit.createdAt),
    [getCalendarDayKey, unit.createdAt],
  );

  const disposalDayKey = useMemo(() => {
    if (!unit.disposalDate) return null;
    return getCalendarDayKey(unit.disposalDate);
  }, [getCalendarDayKey, unit.disposalDate]);

  const isRecordWithinAssetLifetime = useCallback(
    (record: MaintenanceRecord) => {
      const recordDayKey = getCalendarDayKey(
        record.scheduledDate || record.createdAt || record.completionDate,
      );

      if (!recordDayKey) return true;
      if (assetCreatedDayKey && recordDayKey < assetCreatedDayKey) {
        return false;
      }
      if (disposalDayKey && recordDayKey > disposalDayKey) {
        return false;
      }
      return true;
    },
    [assetCreatedDayKey, disposalDayKey, getCalendarDayKey],
  );
  const getRecordUnitCount = useCallback(
    (record: MaintenanceRecord) => {
      if (!unit.bulkOrderParentId) return 1;

      const explicitCount = Number(record.unitCount || 0);
      if (explicitCount > 0) return explicitCount;

      const recordTimestamp = getMaintenanceRecordTimestamp(record);
      const parentIdStr = String(unit.bulkOrderParentId);
      const count = assets.filter((asset) => {
        if (String(asset.bulkOrderParentId) !== parentIdStr) return false;
        if (asset.isBulkOrder) return false;
        if (!recordTimestamp) return true;

        const assetCreatedAt = new Date(asset.createdAt).getTime();
        if (
          Number.isFinite(assetCreatedAt) &&
          assetCreatedAt > recordTimestamp
        ) {
          return false;
        }

        let disposalDateTimestamp: number | null = null;

        if (asset.status === ASSET_STATUS.DISPOSED && asset.updatedAt) {
          const updatedAt = new Date(asset.updatedAt);
          const updatedTimestamp = updatedAt.getTime();
          if (Number.isFinite(updatedTimestamp)) {
            disposalDateTimestamp = updatedTimestamp;
          }
        }

        if (!disposalDateTimestamp && asset.disposalDate) {
          const disposalDateValue = new Date(asset.disposalDate);
          disposalDateValue.setHours(23, 59, 59, 999);
          const disposalTimestampValue = disposalDateValue.getTime();
          if (Number.isFinite(disposalTimestampValue)) {
            disposalDateTimestamp = disposalTimestampValue;
          }
        }

        if (disposalDateTimestamp && recordTimestamp > disposalDateTimestamp) {
          return false;
        }

        return true;
      }).length;

      return count || 1;
    },
    [assets, unit.bulkOrderParentId],
  );
  const {
    totalUnitMaintenanceCost,
    renewalMaintenanceCost,
    repairMaintenanceCost,
  } = useMemo(() => {
    const unitIdStr = String(unit.id);

    // 1. Costs directly on this specific unit
    const directRecords = (maintenanceRecords || []).filter(
      (m) =>
        String(m.assetId).trim() === unitIdStr.trim() &&
        !m.isBulkGroupRecord &&
        m.status === MAINTENANCE_STATUS.COMPLETED,
    );
    const directTotals = sumCosts(directRecords);

    // 2. Share of parent's bulk group costs (like renewals)
    let sharedTotals = { renewal: 0, repair: 0 };
    if (unit.bulkOrderParentId) {
      const parentIdStr = String(unit.bulkOrderParentId);
      const parentGroupRecords = (maintenanceRecords || []).filter(
        (m) =>
          String(m.assetId).trim() === parentIdStr.trim() &&
          m.status === MAINTENANCE_STATUS.COMPLETED,
      );
      const eligibleParentRecords = parentGroupRecords.filter(
        isRecordWithinAssetLifetime,
      );

      sharedTotals = sumCosts(eligibleParentRecords, getRecordUnitCount);
    }

    const renewal = directTotals.renewal + sharedTotals.renewal;
    const repair = directTotals.repair + sharedTotals.repair;

    return {
      totalUnitMaintenanceCost: renewal + repair,
      renewalMaintenanceCost: renewal,
      repairMaintenanceCost: repair,
    };
  }, [
    maintenanceRecords,
    unit.id,
    unit.bulkOrderParentId,
    assets,
    isRecordWithinAssetLifetime,
    getRecordUnitCount,
  ]);

  const maintenanceBreakdownLabel = useMemo(
    () =>
      getMaintenanceBreakdownLabel(
        renewalMaintenanceCost,
        repairMaintenanceCost,
        isSoftwareLikeCategory(unit.category),
      ),
    [renewalMaintenanceCost, repairMaintenanceCost, unit.category],
  );

  const getUnitSnapshotCoverage = useCallback(
    (record: MaintenanceRecord) => {
      const coveredUnits = Array.isArray(record.snapshotCoveredUnits)
        ? record.snapshotCoveredUnits
        : [];
      const skippedUnits = Array.isArray(record.snapshotSkippedUnits)
        ? record.snapshotSkippedUnits
        : [];

      if (coveredUnits.length === 0 && skippedUnits.length === 0) return null;

      const unitId = String(unit.id);
      const unitCode = unit.assetCode ? String(unit.assetCode) : "";
      const unitName = unit.assetName ? String(unit.assetName) : "";

      const matchesUnit = (entry?: {
        id?: string;
        code?: string;
        name?: string;
      }) => {
        if (!entry) return false;
        const entryId = entry.id ? String(entry.id) : "";
        const entryCode = entry.code ? String(entry.code) : "";
        const entryName = entry.name ? String(entry.name) : "";

        return (
          (entryId && entryId === unitId) ||
          (entryCode && unitCode && entryCode === unitCode) ||
          (entryName && unitName && entryName === unitName)
        );
      };

      if (coveredUnits.some(matchesUnit)) return true;
      if (skippedUnits.some(matchesUnit)) return false;

      return false;
    },
    [unit.assetCode, unit.assetName, unit.id],
  );

  const isLicenseExpired = unit.status === ASSET_STATUS.LICENSE_EXPIRED;

  // Filter maintenance for THIS specific unit.
  // Include: direct unit records + bulk group records linked to the unit's parent.
  const unitMaintenance = useMemo(() => {
    const unitId = String(unit.id);
    const bulkParentId = unit.bulkOrderParentId
      ? String(unit.bulkOrderParentId)
      : null;

    // First: find direct individual records for this unit (not bulk group records)
    const directRecords = maintenanceRecords.filter(
      (m) =>
        String(m.assetId) === unitId &&
        !(m.isBulkGroupRecord === true || Number(m.isBulkGroupRecord) === 1),
    );

    if (isDisposed) {
      const disposedRows = directRecords.filter(isRecordWithinAssetLifetime);

      // For disposed units, keep only records that fall within the unit's
      // active lifetime (ignoring records logged on the parent after unit was disposed)
      if (bulkParentId && unit.disposalDate) {
        const parentRecords = maintenanceRecords.filter(
          (m) => String(m.assetId) === String(bulkParentId),
        );

        parentRecords.forEach((m) => {
          if (isRecordWithinAssetLifetime(m)) {
            disposedRows.push({ ...m, assetId: unit.id });
          }
        });

        return Array.from(
          new Map(
            disposedRows.map((record) => [String(record.id), record]),
          ).values(),
        );
      }

      const deduped = Array.from(
        new Map(
          disposedRows.map((record) => [String(record.id), record]),
        ).values(),
      );

      return deduped.sort(
        (a, b) =>
          new Date(b.scheduledDate).getTime() -
          new Date(a.scheduledDate).getTime(),
      );
    }

    // If this unit has its own active individual maintenance it was SKIPPED
    // from any concurrent active bulk group record — don't show those.
    const hasOwnActiveMaintenance = directRecords.some(
      (r) =>
        r.status === MAINTENANCE_STATUS.SCHEDULED ||
        r.status === MAINTENANCE_STATUS.IN_PROGRESS,
    );

    const rows = maintenanceRecords.filter((m) => {
      const recordAssetId = String(m.assetId);
      const snapshotCoverage = getUnitSnapshotCoverage(m);

      // Always include records directly linked to this unit
      if (recordAssetId.trim() === unitId.trim()) return true;

      if (!bulkParentId && snapshotCoverage !== true) return false;

      // Treat any record assigned directly to the bulk parent as a group record
      // even if the flag was not explicitly set (e.g., legacy or manually created parent records).

      if (snapshotCoverage === false) return false;
      if (snapshotCoverage !== true && recordAssetId !== bulkParentId)
        return false;

      if (!isRecordWithinAssetLifetime(m)) return false;

      // Terminal bulk records (Completed/Cancelled): always show as historical snapshot
      const isTerminal =
        m.status === MAINTENANCE_STATUS.COMPLETED ||
        m.status === MAINTENANCE_STATUS.CANCELLED;
      if (isTerminal) return true;

      // Active bulk records: only show if this unit was NOT skipped.
      // A unit is skipped from a bulk group precisely because it had its
      // own active individual maintenance at the time of bulk creation.
      return !hasOwnActiveMaintenance;
    });

    // Guard against duplicate entries if the API returns merged sources.
    const deduped = Array.from(
      new Map(rows.map((record) => [String(record.id), record])).values(),
    );

    return deduped.sort((a, b) => {
      // Put Completed records at the bottom
      const aIsCompleted = a.status === MAINTENANCE_STATUS.COMPLETED;
      const bIsCompleted = b.status === MAINTENANCE_STATUS.COMPLETED;
      if (aIsCompleted && !bIsCompleted) return 1;
      if (!aIsCompleted && bIsCompleted) return -1;

      // Then sort by scheduled date descending
      return (
        new Date(b.scheduledDate).getTime() -
        new Date(a.scheduledDate).getTime()
      );
    });
  }, [
    maintenanceRecords,
    unit.id,
    unit.bulkOrderParentId,
    isDisposed,
    isRecordWithinAssetLifetime,
  ]);

  // Always resolve to the freshest full record from the source list by ID.
  const resolveMaintenanceRecord = useCallback(
    (record: MaintenanceRecord) =>
      maintenanceRecords.find((m) => String(m.id) === String(record.id)) ||
      record,
    [maintenanceRecords],
  );

  // Filter history for THIS specific unit only.
  // Strict rule: include only records whose assetId matches the current unit id.
  const unitHistory = useMemo(
    () => assetHistory.filter((h) => String(h.assetId) === String(unit.id)),
    [assetHistory, unit.id],
  );

  const [unitHistoryOverride, setUnitHistoryOverride] = useState<
    AssetHistoryType[] | null
  >(null);

  useEffect(() => {
    setUnitHistoryOverride(null);
  }, [unit.id]);

  useEffect(() => {
    if (activeTab !== "history") return;

    let isActive = true;

    (async () => {
      try {
        // On-demand fetch if the shared history list is missing this unit.
        const fresh = await dataService.getAssetHistory(String(unit.id));
        if (isActive) setUnitHistoryOverride(fresh || []);
      } catch (err) {
        console.error("[UnitHistory] Failed to fetch unit history:", err);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [activeTab, unit.id, unitHistory.length]);

  const effectiveUnitHistory =
    unitHistoryOverride !== null ? unitHistoryOverride : unitHistory;

  const activeUnitAllocationCount = useMemo(
    () =>
      unitAllocations.reduce((sum, allocation) => {
        if (
          allocation.status !== "Active" ||
          String(allocation.assetId) !== String(unit.id)
        )
          return sum;
        return sum + (allocation.licensesAllocated || 1);
      }, 0),
    [unitAllocations, unit.id],
  );

  const hasActiveUnitAllocations = activeUnitAllocationCount > 0;

  // Use ACTIVE ALLOCATION records as source of truth — NOT the stale
  // unit.employeeId / unit.parentAssetId fields from the server SQL CTE
  const hasDirectAllocation = Boolean(activeAllocation);

  const parentAllocatedAsset = (() => {
    if (!activeAllocation?.parentAssetId) return null;
    return (
      allAssets.find(
        (a) => String(a.id) === String(activeAllocation.parentAssetId),
      ) || null
    );
  })();

  // Maintenance memos for the Maintenance Info section
  const lastMaintenance = useMemo(() => {
    const completed = unitMaintenance
      .filter(
        (r) => r.status === MAINTENANCE_STATUS.COMPLETED && r.completionDate,
      )
      .sort(
        (a, b) =>
          new Date(b.completionDate!).getTime() -
          new Date(a.completionDate!).getTime(),
      );
    return completed[0] || null;
  }, [unitMaintenance]);

  const nextMaintenance = useMemo(() => {
    const scheduled = unitMaintenance
      .filter(
        (r) => r.status === MAINTENANCE_STATUS.SCHEDULED && r.scheduledDate,
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledDate).getTime() -
          new Date(b.scheduledDate).getTime(),
      );
    return scheduled[0] || null;
  }, [unitMaintenance]);

  // Detect any active (Scheduled or In Progress) maintenance record for this unit.
  // Used to block the "New Record" button on the frontend before the API rejects it.
  const activeMaintenance = useMemo(() => {
    const unitId = String(unit.id);
    return (
      unitMaintenance.find(
        (r) =>
          (r.status === MAINTENANCE_STATUS.SCHEDULED ||
            r.status === MAINTENANCE_STATUS.IN_PROGRESS) &&
          String(r.assetId).trim() === unitId.trim(),
      ) || null
    );
  }, [unitMaintenance, unit.id]);

  // Assets received by this unit — with transitive chain resolution
  // e.g., RAM→CPU→Desktop: Desktop unit shows both CPU and RAM
  const allottedAssets = useMemo(() => {
    const assetMap = new Map<
      string,
      { asset: Asset; allocations: LicenseAllocation[] }
    >();

    // BFS to collect all transitively received assets
    const visited = new Set<string>();
    const rootIds = unit.isBulkOrder
      ? assets
          .filter((a) => String(a.bulkOrderParentId) === String(unit.id))
          .map((a) => String(a.id))
      : [String(unit.id)];

    const queue = [...rootIds];

    while (queue.length > 0) {
      const currentParentId = queue.shift()!;
      if (visited.has(currentParentId)) continue;
      visited.add(currentParentId);

      const childAllocations = licenseAllocations.filter((alloc) => {
        if (alloc.status !== "Active") return false;

        // If targetUnitId is present, the allocation is specifically to that child unit
        if (alloc.targetUnitId) {
          return String(alloc.targetUnitId) === currentParentId;
        }

        // Otherwise fallback to parentAssetId (for backwards compatibility or non-bulk assets)
        return String(alloc.parentAssetId) === currentParentId;
      });

      for (const alloc of childAllocations) {
        let childAsset = allAssets.find(
          (a) => String(a.id) === String(alloc.assetId),
        );

        if (!childAsset) {
          childAsset = {
            id: alloc.assetId,
            assetName: alloc.assetName || alloc.assetCode || "Unknown Asset",
            assetCode: alloc.assetCode || "",
            category: (alloc as any).category || "Unknown",
            assetType: (alloc as any).assetType || "",
          } as Asset;
        }

        if (childAsset) {
          const key = String(childAsset.id);
          if (!assetMap.has(key)) {
            assetMap.set(key, { asset: childAsset, allocations: [] });
          }
          assetMap.get(key)!.allocations.push(alloc);
          // Enqueue child to find its children too (transitive)
          queue.push(key);
        }
      }
    }

    return Array.from(assetMap.values());
  }, [licenseAllocations, unit.id, unit.isBulkOrder, allAssets, assets]);

  const hasProvidingAllocations = useMemo(
    () =>
      licenseAllocations.some(
        (la) =>
          String(la.parentAssetId) === String(unit.id) &&
          la.status === "Active",
      ),
    [licenseAllocations, unit.id],
  );

  const hasReceivedAllocations = useMemo(
    () => allottedAssets.length > 0,
    [allottedAssets.length],
  );

  const isDisposeBlocked =
    hasActiveUnitAllocations ||
    hasProvidingAllocations ||
    hasReceivedAllocations;

  const handleEditFieldChange = useCallback((field: string, value: string) => {
    setEditFields((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!onUpdateUnit) return;

    // Validate serial number uniqueness
    if (editFields.serialNumber?.trim()) {
      const isDuplicateSerial = allAssets.some(
        (a) =>
          a.serialNumber?.toLowerCase() ===
            editFields.serialNumber?.toLowerCase() && a.id !== unit.id,
      );
      if (isDuplicateSerial) {
        toast.error(
          "This Serial Number is already in use by another asset. Please use a unique serial number.",
        );
        return;
      }
    }

    const macValue = editFields.macAddress?.trim();
    if (macValue) {
      const isDuplicateMac = allAssets.some(
        (a) =>
          String(a.macAddress || "").toLowerCase() === macValue.toLowerCase() &&
          a.id !== unit.id,
      );
      if (isDuplicateMac) {
        toast.error(
          "This MAC Address is already in use by another asset. Please use a unique MAC address.",
        );
        return;
      }
    }

    setIsSaving(true);
    try {
      // Separate allocation-level fields from asset-level fields
      const {
        installationLocation,
        ipAddress,
        operatingSystem,
        serialNumber: _sn,
        macAddress: _mac,
        ...assetFieldsBase
      } = editFields;

      // Only include serial/MAC if they haven't been permanently set yet
      const assetFields: Record<string, unknown> = { ...assetFieldsBase };
      assetFields.installationLocation = installationLocation;

      const currentSerial = String(unit.serialNumber || "").trim();
      const nextSerial = String(_sn || "").trim();
      if (nextSerial !== currentSerial) {
        assetFields.serialNumber = nextSerial || null;
      }

      const currentMac = String(unit.macAddress || "").trim();
      const nextMac = String(_mac || "").trim();
      if (nextMac.toLowerCase() !== currentMac.toLowerCase()) {
        assetFields.macAddress = nextMac || null;
      }

      // Prevent name changes when the unit is already allocated
      if (hasDirectAllocation) {
        assetFields.assetName = unit.assetName || "";
      }

      // Only call onUpdateUnit if asset-level fields actually changed
      const assetChanged =
        assetFields.assetName !== (unit.assetName || "") ||
        assetFields.installationLocation !==
          (unit.installationLocation || "") ||
        assetFields.condition !== (unit.condition || "") ||
        assetFields.processor !== (unit.processor || "") ||
        assetFields.ram !== (unit.ram || "") ||
        assetFields.storage !== (unit.storage || "") ||
        (assetFields.serialNumber !== undefined &&
          assetFields.serialNumber !== (unit.serialNumber || "")) ||
        (assetFields.macAddress !== undefined &&
          assetFields.macAddress !== (unit.macAddress || ""));

      if (assetChanged) {
        await onUpdateUnit(String(unit.id), assetFields);
      }

      // Update allocation-level fields (IP, OS) only if values actually changed
      const currentIp = activeAllocation?.ipAddress || "";
      const currentOs = activeAllocation?.operatingSystem || "";
      const currentLoc = activeAllocation?.installationLocation || "";
      const ipChanged = (ipAddress || "") !== currentIp;
      const osChanged = (operatingSystem || "") !== currentOs;
      const locChanged =
        Boolean(activeAllocation) &&
        (installationLocation || "") !== currentLoc;

      if ((ipChanged || osChanged || locChanged) && activeAllocation) {
        try {
          await dataService.updateAllocation(String(unit.id), {
            ...(ipChanged ? { ipAddress: ipAddress || undefined } : {}),
            ...(osChanged
              ? { operatingSystem: operatingSystem || undefined }
              : {}),
            ...(locChanged
              ? { installationLocation: installationLocation || undefined }
              : {}),
          });
        } catch {
          // Allocation update is best-effort; asset update already succeeded
        }
      }

      if (!assetChanged && !ipChanged && !osChanged && !locChanged) {
        toast.info("No changes to save.");
        setMode("view");
        return;
      }

      toast.success("Unit details updated successfully!");
      setMode("view");
    } catch (err) {
      toast.error(getErrorMessage(err) || "Failed to update unit details.");
    } finally {
      setIsSaving(false);
    }
  }, [
    onUpdateUnit,
    unit,
    editFields,
    allAssets,
    activeAllocation,
    hasDirectAllocation,
  ]);

  // Adapter: AssetAllotmentForm's onAllocate → UnitDetailModal's onAllocateUnit
  const handleAllotmentAllocate = useCallback(
    (
      allocationData: Array<{
        employeeId: string;
        userName: string;
        department: string;
        count: number;
        parentAssetId?: string;
        conditionAtAllocation?: string;
        installationLocation?: string;
        ipAddress?: string;
        macAddress?: string;
        operatingSystem?: string;
        serialNumber?: string;
        targetUnitId?: string;
        allocationDate?: string;
      }>,
    ) => {
      if (!onAllocateUnit || allocationData.length === 0)
        return Promise.resolve();
      const d = allocationData[0];
      return onAllocateUnit(String(unit.id), {
        employeeId: d.employeeId,
        userName: d.userName,
        department: d.department,
        condition: d.conditionAtAllocation || DEFAULT_ASSET_CONDITION,
        ...(d.installationLocation && {
          installationLocation: d.installationLocation,
        }),
        ...(d.ipAddress && { ipAddress: d.ipAddress }),
        ...(d.macAddress && { macAddress: d.macAddress }),
        ...(d.operatingSystem && { operatingSystem: d.operatingSystem }),
        ...(d.serialNumber && { serialNumber: d.serialNumber }),
        ...(d.parentAssetId && {
          parentAssetId: d.parentAssetId,
          parentAssetName: d.userName.replace("[Asset] ", ""),
        }),
      });
    },
    [onAllocateUnit, unit.id],
  );

  const handleAllotmentRevoke = useCallback(
    (allocationId: string, conditionAtReturn?: string, notes?: string) => {
      if (!onReturnUnit) return Promise.resolve();
      return onReturnUnit(
        String(unit.id),
        conditionAtReturn || DEFAULT_ASSET_CONDITION,
        notes,
      );
    },
    [onReturnUnit, unit.id],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  const handleModalClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Determine if we should show technical specs section (only when actual data exists)
  // When unit has 0 allocations and no own specs, inherit from parent
  const parentAsset = useMemo(
    () =>
      unit.bulkOrderParentId
        ? allAssets.find((a) => String(a.id) === String(unit.bulkOrderParentId))
        : null,
    [allAssets, unit.bulkOrderParentId],
  );

  const effectiveProcessor =
    unit.processor || (!hasDirectAllocation ? parentAsset?.processor : null);
  const effectiveRam =
    unit.ram || (!hasDirectAllocation ? parentAsset?.ram : null);
  const effectiveStorage =
    unit.storage || (!hasDirectAllocation ? parentAsset?.storage : null);

  // Data-driven: show hardware specs if any data exists AND category is not software
  const showSpecs =
    !isSoftwareLikeCategory(unit.category) &&
    !!(effectiveProcessor || effectiveRam || effectiveStorage);

  // Data-driven: show networking specs if any data exists OR if category normally has them
  const showNetworking =
    (hasNetworkingSpecs(unit.category) || unit.portCount || unit.portSpeed) &&
    (unit.portCount || unit.portSpeed);

  // Data-driven: show software/license fields only when data exists
  const showLicenseFields = !!(unit.licenseType || unit.licenseExpiryDate);

  // Whether to show MAC address field in view mode (never for software)
  const showMacAddress =
    !isSoftwareLikeCategory(unit.category) && !!unit.macAddress;

  // Deployment fields from active allocation
  const deployIp = String(activeAllocation?.ipAddress || "").trim() || null;
  const deployOs =
    String(activeAllocation?.operatingSystem || "").trim() || null;
  const deployLoc =
    String(
      activeAllocation?.installationLocation || unit.installationLocation || "",
    ).trim() || null;
  const showIpField = hasDeploymentFields(unit.category) || Boolean(deployIp);
  const showOsField =
    hasOperatingSystemField(unit.category) || Boolean(deployOs);
  const showDeployment = !!(deployIp || deployOs || deployLoc);

  const isGeneralCategory =
    !isSoftwareLikeCategory(unit.category) &&
    !hasHardwareSpecs(unit.category) &&
    !hasNetworkingSpecs(unit.category);

  // Edit visibility: allow custom categories while hiding unused fields
  const showEditSpecs =
    hasHardwareSpecs(unit.category) ||
    Boolean(editFields.processor || editFields.ram || editFields.storage);
  const showEditSerial =
    hasHardwareSpecs(unit.category) ||
    hasNetworkingSpecs(unit.category) ||
    isGeneralCategory ||
    Boolean(editFields.serialNumber);
  const showEditIp =
    hasDeploymentFields(unit.category) ||
    isGeneralCategory ||
    Boolean(editFields.ipAddress);
  const showEditMac =
    hasDeploymentFields(unit.category) ||
    isGeneralCategory ||
    Boolean(editFields.macAddress);
  const showEditOperatingSystem =
    hasOperatingSystemField(unit.category) ||
    isGeneralCategory ||
    Boolean(editFields.operatingSystem);
  const showDeploymentEditSection =
    showEditIp || showEditMac || showEditOperatingSystem;
  const showSpecsSection = showEditSpecs || showEditSerial;

  // Use Portal to render the modal at the document body level to prevent stacking context issues
  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200"
      onClick={handleBackdropClick}>
      <AnimatePresence mode="wait">
        <motion.div
          key={unit.id}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-white rounded-xl shadow-2xl max-w-6xl w-full h-[85dvh] sm:h-[85vh] overflow-hidden flex flex-col"
          onClick={handleModalClick}>
          {/* ========== HEADER ========== */}
          <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-white shrink-0 flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2 sm:pr-4">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                {unit.assetName}
              </h2>
              <div className="flex items-center gap-2 mt-0.5 sm:mt-1">
                <p className="mobile-xs text-xs sm:text-sm text-gray-600 truncate">
                  <span className="hidden sm:inline">Asset Code: </span>
                  {unit.assetCode}
                </p>
                {!!unit.unitNumber && (
                  <span className="mobile-xs px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full">
                    Unit #{unit.unitNumber}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {mode === "view" && !readOnly && !isDisposed && (
                <>
                  {canRoleUpdate(userRole) && (
                    <button
                      onClick={() => {
                        setMode("edit");
                        setActiveTab("details");
                      }}
                      className="p-2 sm:px-3 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors">
                      <Pencil className="w-4 h-4" />
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                  )}
                  {/* Dispose button (always shown) */}
                  {onDispose &&
                    hasPermission(userRole, PERMISSIONS.ASSET_DISPOSE) && (
                      <button
                        onClick={() => {
                          if (isDisposeBlocked) {
                            let msg = "Cannot dispose an allocated asset.";
                            if (hasProvidingAllocations)
                              msg =
                                "Cannot dispose: this asset has software/licenses assigned to it.";
                            if (hasReceivedAllocations)
                              msg =
                                "Cannot dispose: this asset is assigned to another device.";
                            toast.error(msg);
                            return;
                          }
                          onDispose(unit.id);
                        }}
                        title={
                          isDisposeBlocked
                            ? "Cannot dispose allocated assets"
                            : "Dispose this asset"
                        }
                        className={`p-2 sm:px-3 sm:py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors ${
                          isDisposeBlocked
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                            : "bg-red-50 border border-red-200 text-red-600 hover:bg-red-100"
                        }`}>
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Dispose</span>
                      </button>
                    )}
                  {!isDisposed && (
                    <button
                      onClick={() => setShowTroubleshootModal(true)}
                      title="Report an issue with this unit"
                      className="p-2 sm:px-3 sm:py-2 bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="hidden sm:inline">Report Issue</span>
                    </button>
                  )}
                </>
              )}



              {mode === "edit" && (
                <button
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="p-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50">
                  <Save className="w-4 h-4" />
                  <span>
                    {isSaving ? "Saving..." : "Save"}
                  </span>
                </button>
              )}

              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-700 ml-1 sm:ml-2">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ========== TABS ========== */}
          {!hideExtraTabs && (
            <div className="px-3 sm:px-6 border-b border-gray-200 bg-white shrink-0 flex gap-1 sm:gap-4 overflow-x-auto">
              <button
                onClick={() => setActiveTab("details")}
                className={tabCls("details")}>
                Details
              </button>
              {!isDisposed && canAccessAllocationTab && (
                <button
                  onClick={() => setActiveTab("allocation")}
                  className={tabCls("allocation")}>
                  <span className="hidden sm:inline">Allocation</span>
                  <span className="sm:hidden">Allotment</span>
                  {unitAllocations.filter((a) => a.status === "Active").length >
                    0 && (
                    <span className="mobile-xs px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                      {
                        unitAllocations.filter((a) => a.status === "Active")
                          .length
                      }
                    </span>
                  )}
                </button>
              )}
              {isBulkParent && (
                <button
                  onClick={() => setActiveTab("units")}
                  className={tabCls("units")}>
                  Units
                </button>
              )}
              <button
                onClick={() => setActiveTab("maintenance")}
                className={tabCls("maintenance")}>
                <span className="hidden sm:inline">Maintenance</span>
                <span className="sm:hidden">Maintenance</span>
                {unitMaintenance.length > 0 && (
                  <span className="mobile-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-semibold">
                    {unitMaintenance.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={tabCls("history")}>
                History
              </button>
            </div>
          )}

          {/* ========== CONTENT ========== */}
          <div className="p-3 sm:p-6 overflow-y-auto flex-1 bg-white modal-safe-bottom">
            {/* Details Tab */}
            {activeTab === "details" && (
              <div className="space-y-4">
                {/* Status Header */}
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge
                    status={unit.status}
                    size="md"
                    userRole={userRole}
                    showIcon={true}
                    className="flex items-center gap-1.5"
                  />
                  {unit.condition && (
                    <span
                      className={getPillBadgeClass(
                        "bg-indigo-100 text-indigo-800 border-indigo-200",
                        "md",
                        "gap-1.5",
                      )}>
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      Condition: {unit.condition}
                    </span>
                  )}
                  {unit.installationLocation && (
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      {unit.installationLocation}
                    </span>
                  )}
                </div>

                {mode === "view" && (
                  <>
                    <div
                      className={`grid grid-cols-1 gap-3 lg:gap-5 ${
                        showSpecs || showNetworking || showLicenseFields
                          ? "md:grid-cols-3"
                          : "md:grid-cols-2"
                      }`}>
                      {/* Column 1: Core Info */}
                      <DetailSection
                        title="Identification & Core"
                        className="grid grid-cols-2 md:grid-cols-1 gap-x-4 gap-y-2">
                        <FieldItem label="Category" value={unit.category} />
                        <FieldItem label="Asset Type" value={unit.assetType} />
                        <FieldItem label="Model" value={unit.model} />
                        <FieldItem
                          label="Serial Number"
                          value={unit.serialNumber}
                        />
                        {showMacAddress && (
                          <FieldItem
                            label="MAC Address"
                            value={unit.macAddress}
                          />
                        )}
                        {/* Disposal Info - shown when unit is retired */}
                        {isDisposed && unit.disposalDate && (
                          <div className="p-2 bg-red-50 border border-red-100 rounded-lg mt-1">
                            <label className="mobile-xs text-xs text-red-600 uppercase font-bold tracking-wider">
                              Disposal Date
                            </label>
                            <p className="font-bold text-red-700 text-sm">
                              {formatDisplayDate(unit.disposalDate)}
                            </p>
                            {unit.disposalReason && (
                              <p className="text-xs text-red-600 mt-0.5">
                                Reason: {unit.disposalReason}
                              </p>
                            )}
                          </div>
                        )}
                      </DetailSection>

                      {/* Column 2: Tech Specs - shown when any spec data exists */}
                      {(showSpecs || showNetworking || showLicenseFields) && (
                        <DetailSection
                          title="Technical Specifications"
                          className="grid grid-cols-2 md:grid-cols-1 gap-x-4 gap-y-2">
                          {showSpecs && (
                            <>
                              <FieldItem
                                label="Processor"
                                value={effectiveProcessor}
                              />
                              <FieldItem label="RAM" value={effectiveRam} />
                              <FieldItem
                                label="Storage"
                                value={effectiveStorage}
                              />
                            </>
                          )}

                          {showNetworking && (
                            <>
                              <FieldItem
                                label="Port Count"
                                value={unit.portCount}
                              />
                              <FieldItem
                                label="Port Speed"
                                value={unit.portSpeed}
                              />
                            </>
                          )}

                          {showLicenseFields && (
                            <>
                              <FieldItem
                                label="License Type"
                                value={unit.licenseType || "N/A"}
                              />
                              <FieldItem
                                label="License Expiry"
                                value={
                                  unit.licenseExpiryDate ? (
                                    <span
                                      className={
                                        isLicenseExpired
                                          ? "text-red-600 font-semibold"
                                          : ""
                                      }>
                                      {formatDisplayDate(
                                        unit.licenseExpiryDate,
                                      )}
                                      {isLicenseExpired && " — Expired"}
                                    </span>
                                  ) : (
                                    "Perpetual"
                                  )
                                }
                              />
                            </>
                          )}
                        </DetailSection>
                      )}

                      {/* Column: Deployment & Network (from active allocation) */}
                      {showDeployment && mode === "view" && (
                        <DetailSection
                          title="Deployment & Network"
                          className="grid grid-cols-2 md:grid-cols-1 gap-x-4 gap-y-2">
                          <FieldItem label="Location" value={deployLoc} />
                          <FieldItem label="IP Address" value={deployIp} />
                          {!isSoftwareLikeCategory(unit.category) && (
                            <FieldItem
                              label="Operating System"
                              value={deployOs}
                            />
                          )}
                        </DetailSection>
                      )}

                      {/* Column: Inventory & Cost (price only) */}
                      <DetailSection
                        title="Inventory & Cost"
                        className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <FieldItem
                          label="Purchase Price"
                          value={
                            unit.purchasePrice !== null &&
                            unit.purchasePrice !== undefined ? (
                              `₹${formatCurrencyValue(unit.purchasePrice)}`
                            ) : (
                              <span className="text-gray-400 text-sm">₹0</span>
                            )
                          }
                        />
                        <FieldItem
                          label="Current Total Cost"
                          value={
                            <div className="flex flex-col">
                              <span className="font-bold text-blue-700 text-sm">
                                ₹
                                {formatCurrencyValue(
                                  (isSoftwareLikeCategory(unit.category) &&
                                  renewalMaintenanceCost > 0
                                    ? 0
                                    : (unit.purchasePrice ?? 0)) +
                                    totalUnitMaintenanceCost,
                                )}
                              </span>
                              {totalUnitMaintenanceCost > 0 &&
                                maintenanceBreakdownLabel && (
                                  <span className="text-[10px] text-gray-500 font-normal leading-tight">
                                    ({maintenanceBreakdownLabel})
                                  </span>
                                )}
                            </div>
                          }
                        />
                      </DetailSection>
                    </div>

                    {/* ── Row 2: Purchase Details + Current Allocation ── */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-4">
                      <div className="space-y-4 lg:space-y-2">
                        <h3 className="ui-section-title">Purchase Details</h3>
                        <div className="grid grid-cols-2 gap-3 lg:gap-2 items-start">
                          <FieldItem
                            label="Invoice No"
                            value={unit.invoiceNumber || "N/A"}
                          />
                          <div className="min-w-0 sm:justify-self-start">
                            <FieldItem
                              label="Invoice Date"
                              value={
                                unit.invoiceDate
                                  ? formatDisplayDate(unit.invoiceDate)
                                  : "N/A"
                              }
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="ui-field-label">Vendor</label>
                            <p className="text-sm font-medium text-gray-900">
                              {unit.vendorName || "N/A"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 lg:space-y-2">
                        <h3 className="ui-section-title">
                          {isBulkParent
                            ? "Allocation Summary"
                            : "Current Allocation"}
                        </h3>
                        <div className="min-h-20 w-full">
                          {isDisposed ? (
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 w-full flex items-center gap-3">
                              <div className="bg-gray-400 rounded-lg p-1.5 shadow-sm shrink-0">
                                <XCircle className="w-4 h-4 text-white" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">
                                  Unit Disposed
                                </p>
                                <p className="text-sm font-bold text-gray-900 leading-tight">
                                  {unit.disposalDate
                                    ? `Disposed on ${formatDisplayDate(unit.disposalDate)}`
                                    : "No longer in service"}
                                </p>
                                {unit.disposalReason && (
                                  <p className="text-xs text-gray-400 mt-1 italic line-clamp-1">
                                    Reason: {unit.disposalReason}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-4 w-full min-w-0">
                              {/* ── Allocation Status Card ── */}
                              <div className="relative group">
                                {isBulkParent ? (
                                  <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                                    <div className="flex items-center gap-3">
                                      <div className="bg-blue-600 rounded-lg p-1.5 shadow-sm shrink-0">
                                        <Users className="w-4 h-4 text-white" />
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
                                          Bulk Management
                                        </p>
                                        <p className="text-sm font-bold text-gray-900 leading-tight">
                                          Parent Record ({unit.totalQuantity}{" "}
                                          Units)
                                        </p>
                                      </div>
                                    </div>
                                    {hasDirectAllocation && (
                                      <div className="mt-2 pt-2 border-t border-amber-100 flex items-start gap-2">
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                                        <p className="text-[9px] text-amber-700 font-medium leading-tight">
                                          Notice: This parent record has a
                                          direct allocation (
                                          {activeAllocation?.parentAssetName
                                            ? `asset ${activeAllocation.parentAssetName}`
                                            : activeAllocation?.userName ||
                                              activeAllocation?.employeeId ||
                                              "Unknown"}
                                          ). We recommend re-allocating this to
                                          a specific individual unit if
                                          possible.
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                ) : hasDirectAllocation &&
                                  (activeAllocation?.employeeId ||
                                    activeAllocation?.userName) ? (
                                  <div className="bg-white border border-blue-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-all overflow-hidden relative">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full -mr-8 -mt-8 opacity-40" />
                                    <div className="relative flex items-center gap-3">
                                      <div className="bg-blue-600 rounded-lg p-1.5 shadow-sm shrink-0">
                                        <User className="w-4 h-4 text-white" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest mb-0.5">
                                          Current Allocation
                                        </p>
                                        <p className="text-sm font-bold text-gray-900 leading-tight truncate">
                                          {activeAllocation?.userName ||
                                            "Unknown User"}
                                        </p>
                                        <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                                          ID:{" "}
                                          {activeAllocation?.employeeId ||
                                            "N/A"}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ) : hasDirectAllocation &&
                                  (activeAllocation?.parentAssetId ||
                                    activeAllocation?.parentAssetName) ? (
                                  <div
                                    className={`bg-white border border-indigo-200 rounded-xl p-3 shadow-sm transition-all overflow-hidden relative ${onViewAsset && parentAllocatedAsset ? "cursor-pointer hover:shadow-md hover:border-indigo-300" : ""}`}
                                    onClick={() => {
                                      if (onViewAsset && parentAllocatedAsset) {
                                        onClose();
                                        onViewAsset(parentAllocatedAsset);
                                      }
                                    }}>
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-full -mr-8 -mt-8 opacity-40" />
                                    <div className="relative flex items-center gap-3">
                                      <div className="bg-indigo-600 rounded-lg p-1.5 shadow-sm shrink-0">
                                        <Link2 className="w-4 h-4 text-white" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mb-0.5">
                                          Allocated to Asset
                                        </p>
                                        <p className="text-sm font-bold text-gray-900 leading-tight truncate">
                                          {activeAllocation?.parentAssetName ||
                                            "Parent Asset"}
                                        </p>
                                        <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                                          Code:{" "}
                                          {parentAllocatedAsset?.assetCode ||
                                            "N/A"}
                                        </p>
                                      </div>
                                      {onViewAsset && parentAllocatedAsset && (
                                        <ExternalLink className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                      )}
                                    </div>
                                  </div>
                                ) : hasDirectAllocation &&
                                  activeAllocation?.installationLocation &&
                                  !activeAllocation?.employeeId &&
                                  !activeAllocation?.parentAssetId ? (
                                  <div className="bg-white border border-emerald-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-all overflow-hidden relative">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full -mr-8 -mt-8 opacity-40" />
                                    <div className="relative flex items-center gap-3">
                                      <div className="bg-emerald-600 rounded-lg p-1.5 shadow-sm shrink-0">
                                        <MapPin className="w-4 h-4 text-white" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mb-0.5">
                                          Allocated to Location
                                        </p>
                                        <p className="text-sm font-bold text-emerald-900 leading-tight truncate">
                                          {
                                            activeAllocation.installationLocation
                                          }
                                        </p>
                                        <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                                          Installed at Location
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ) : isLicenseExpired ? (
                                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-3">
                                    <div className="bg-red-500 rounded-lg p-1.5 shadow-sm shrink-0">
                                      <AlertTriangle className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-[9px] font-bold text-red-600 uppercase tracking-widest mb-0.5">
                                        License Expired
                                      </p>
                                      <p className="text-sm font-bold text-red-900 leading-tight">
                                        Action Required
                                      </p>
                                      <p className="text-[10px] text-red-700 font-medium mt-0.5">
                                        Renew before allocation
                                      </p>
                                    </div>
                                  </div>
                                ) : unit.status === "Under Maintenance" ? (
                                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
                                    <div className="bg-amber-500 rounded-lg p-1.5 shadow-sm shrink-0">
                                      <Wrench className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest mb-0.5">
                                        Maintenance
                                      </p>
                                      <p className="text-sm font-bold text-amber-900 leading-tight">
                                        Under Maintenance
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-white border border-green-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-all overflow-hidden relative">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-green-50 rounded-full -mr-8 -mt-8 opacity-40" />
                                    <div className="relative flex items-center gap-3">
                                      <div className="bg-green-600 rounded-lg p-1.5 shadow-sm shrink-0">
                                        <CheckCircle className="w-4 h-4 text-white" />
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-[9px] font-bold text-green-500 uppercase tracking-widest mb-0.5">
                                          Current Status
                                        </p>
                                        <div className="flex items-baseline gap-2">
                                          <p className="text-sm font-bold text-gray-900 leading-tight">
                                            {userRole === "Viewer"
                                              ? "Return"
                                              : "Available"}
                                          </p>
                                          {userRole !== "Viewer" && (
                                            <p className="text-[10px] text-green-600 font-bold">
                                              • Ready
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* ── Assets Received Section ── */}
                              {allottedAssets.length > 0 && (
                                <div className="pt-2 w-full min-w-0">
                                  <div className="flex items-center justify-between mb-3 px-1">
                                    <div className="flex items-center gap-2">
                                      <div className="p-1 bg-gray-100 rounded-md">
                                        <Link2 className="w-3.5 h-3.5 text-gray-600" />
                                      </div>
                                      <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
                                        Assets Received
                                      </h3>
                                    </div>
                                    <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full">
                                      {allottedAssets.length}
                                    </span>
                                  </div>

                                  <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 min-w-0">
                                    {allottedAssets.map(
                                      ({ asset: childAsset, allocations }) => {
                                        const totalAllocated =
                                          allocations.reduce(
                                            (sum, a) =>
                                              sum + (a.licensesAllocated || 1),
                                            0,
                                          );
                                        const isSoftware =
                                          isSoftwareLikeCategory(
                                            childAsset.category,
                                          );

                                        const isRealAsset = true;

                                        return (
                                          <button
                                            key={childAsset.id}
                                            disabled={!isRealAsset}
                                            onClick={() => {
                                              if (isRealAsset && onViewAsset) {
                                                onClose();
                                                onViewAsset(childAsset);
                                              }
                                            }}
                                            className={`group flex flex-none min-w-[220px] items-center gap-3 p-2.5 bg-gray-50 border border-gray-200 rounded-xl transition-all text-left ${isRealAsset ? "hover:bg-white hover:border-blue-300 hover:shadow-sm cursor-pointer" : "opacity-75 cursor-not-allowed"}`}>
                                            <div
                                              className={`p-2 rounded-lg shrink-0 ${
                                                childAsset.category ===
                                                "Software"
                                                  ? "bg-purple-100 text-purple-600"
                                                  : childAsset.category ===
                                                      "Networking"
                                                    ? "bg-cyan-100 text-cyan-600"
                                                    : "bg-orange-100 text-orange-600"
                                              }`}>
                                              {isSoftware ? (
                                                <Key className="w-4 h-4 shrink-0" />
                                              ) : (
                                                <Box className="w-4 h-4 shrink-0" />
                                              )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <p className="text-xs font-bold text-gray-900 truncate leading-tight">
                                                {childAsset.assetName}
                                              </p>
                                              <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                                                {childAsset.category}
                                              </p>
                                            </div>
                                            {totalAllocated > 1 && (
                                              <div className="px-2 py-0.5 bg-white border border-gray-200 rounded-md text-[10px] font-bold text-gray-600">
                                                ×{totalAllocated}
                                              </div>
                                            )}
                                            <ExternalLink className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500 transition-colors" />
                                          </button>
                                        );
                                      },
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── Row 3: Maintenance Info + System Audit ── */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-4">
                      <div className="space-y-4 lg:space-y-2">
                        <h3 className="ui-section-title">Maintenance Info</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-2">
                          <FieldItem
                            label="Next Schedule"
                            value={
                              nextMaintenance
                                ? formatDisplayDate(
                                    nextMaintenance.scheduledDate,
                                  )
                                : "Not Scheduled"
                            }
                          />
                          <FieldItem
                            label="Last Completion"
                            value={
                              lastMaintenance?.completionDate
                                ? formatDisplayDate(
                                    lastMaintenance.completionDate,
                                  )
                                : "Never"
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-4 lg:space-y-2">
                        <h3 className="ui-section-title">System Audit</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-2">
                          <FieldItem
                            label="Created On"
                            value={formatDisplayDateTime(unit.createdAt)}
                          />
                          <FieldItem
                            label="Last Updated"
                            value={formatDisplayDateTime(unit.updatedAt)}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {mode === "edit" && (
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <h4 className="font-semibold text-gray-900 border-b pb-2">
                        General Information
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                        <div className="sm:col-span-2">
                          <EditField
                            label="Asset Name"
                            value={editFields.assetName}
                            onChange={(v) =>
                              handleEditFieldChange("assetName", v)
                            }
                            placeholder="e.g. Microsoft 365 Office - License 4"
                            maxLength={200}
                            disabled={hasDirectAllocation}
                            disabledHint="Name cannot be changed while the unit is allocated"
                          />
                        </div>
                        <EditField
                          label="Location"
                          value={editFields.installationLocation}
                          onChange={(v) =>
                            handleEditFieldChange("installationLocation", v)
                          }
                          placeholder="e.g. Building A, Floor 3"
                          maxLength={150}
                        />
                        <div>
                          <label className="mobile-xs text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                            Condition
                          </label>
                          <SearchableSelect
                            value={editFields.condition}
                            onChange={(v) =>
                              handleEditFieldChange("condition", v)
                            }
                            options={[...ASSET_CONDITIONS_ARRAY]}
                            placeholder="Select condition..."
                            disabled={hasDirectAllocation}
                          />
                        </div>
                      </div>
                    </div>

                    {showDeploymentEditSection && (
                      <div className="space-y-4">
                        <h4 className="font-semibold text-gray-900 border-b pb-2">
                          Deployment & Network
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                          {showEditIp && (
                            <EditField
                              label="IP Address"
                              value={editFields.ipAddress}
                              onChange={(v) =>
                                handleEditFieldChange("ipAddress", v)
                              }
                              placeholder="e.g. 192.168.1.1"
                              maxLength={50}
                              disabled={hasDirectAllocation}
                              disabledHint="Network settings cannot be changed while the unit is allocated"
                            />
                          )}
                          {showEditMac && (
                            <EditField
                              label="MAC Address"
                              value={editFields.macAddress}
                              onChange={(v) =>
                                handleEditFieldChange("macAddress", v)
                              }
                              placeholder="e.g. AA:BB:CC:DD:EE:FF"
                              maxLength={50}
                              disabled={hasDirectAllocation}
                              disabledHint="Network settings cannot be changed while the unit is allocated"
                            />
                          )}
                          {showEditOperatingSystem && (
                            <EditField
                              label="Operating System"
                              value={editFields.operatingSystem}
                              onChange={(v) =>
                                handleEditFieldChange("operatingSystem", v)
                              }
                              placeholder="e.g. Windows 10"
                              maxLength={100}
                              disabled={hasDirectAllocation}
                              disabledHint="OS cannot be changed while the unit is allocated"
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {showSpecsSection && (
                      <div className="space-y-4">
                        <h4 className="font-semibold text-gray-900 border-b pb-2">
                          {isGeneralCategory
                            ? "Additional Details"
                            : "Technical Specs"}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                          {showEditSpecs && (
                            <>
                              <EditField
                                label="Processor"
                                value={editFields.processor}
                                onChange={(v) =>
                                  handleEditFieldChange("processor", v)
                                }
                                placeholder="e.g. Intel i7"
                              />
                              <div>
                                <label className="mobile-xs text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                                  RAM
                                </label>
                                <SearchableSelect
                                  value={editFields.ram}
                                  onChange={(v) =>
                                    handleEditFieldChange("ram", v)
                                  }
                                  options={RAM_OPTIONS}
                                  creatable={true}
                                  placeholder="e.g. 16GB"
                                />
                              </div>
                              <div>
                                <label className="mobile-xs text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                                  Storage
                                </label>
                                <SearchableSelect
                                  value={editFields.storage}
                                  onChange={(v) =>
                                    handleEditFieldChange("storage", v)
                                  }
                                  options={STORAGE_OPTIONS}
                                  creatable={true}
                                  placeholder="e.g. 512GB SSD"
                                />
                              </div>
                            </>
                          )}
                          {showEditSerial && (
                            <EditField
                              label="Serial Number"
                              value={editFields.serialNumber}
                              onChange={(v) =>
                                handleEditFieldChange("serialNumber", v)
                              }
                              placeholder="e.g. SN-12345"
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Units Tab (for Bulk Orders) */}
            {activeTab === ("units" as any) && isBulkParent && (
              <div className="space-y-4">
                  <IndividualUnitsManagement
                    individualUnits={assets.filter(
                      (a) => String(a.bulkOrderParentId) === String(unit.id),
                    )}
                    baseAssetCode={unit.assetCode}
                    onEdit={onEdit}
                    onViewAsset={(asset) => {
                      if (onViewAsset) onViewAsset(asset);
                      onClose();
                    }}
                    onSwitchToAllocation={() => setActiveTab("allocation")}
                    users={users}
                    licenseAllocations={licenseAllocations}
                    maintenanceRecords={maintenanceRecords}
                    assetHistory={assetHistory}
                    userRole={userRole}
                    allAssets={allAssets}
                    assets={assets}
                    onUpdateUnit={onUpdateUnit}
                    onAllocateUnit={onAllocateUnit}
                    onReturnUnit={onReturnUnit}
                    onAddMaintenance={onAddMaintenance}
                    onEditMaintenance={onEditMaintenance}
                    category={unit.category}
                    purchasePrice={unit.purchasePrice}
                    totalQuantity={unit.totalQuantity}
                  />
              </div>
            )}

            {/* Allocation Tab */}
            {activeTab === "allocation" && canAccessAllocationTab && (
              <AssetAllotmentForm
                asset={{ ...unit, totalQuantity: 1 }}
                assets={assets}
                allocations={relevantUnitAllocations}
                users={users}
                onAllocate={handleAllotmentAllocate}
                onRevoke={handleAllotmentRevoke}
                onBulkRevoke={onBulkReturnUnit}
                onViewUnit={(asset) => {
                  if (onViewAsset) onViewAsset(asset);
                  onClose();
                }}
                userRole={userRole}
                currentUser={currentUser}
                hideStats
                receivedAssets={allottedAssets.map((a) => a.asset)}
              />
            )}

            {/* Maintenance Tab */}
            {activeTab === "maintenance" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b pb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Maintenance Records
                  </h3>
                  {onAddMaintenance &&
                    unit.category !== "Software" &&
                    hasPermission(userRole, PERMISSIONS.MAINTENANCE_CREATE) && (
                      <button
                        onClick={() => onAddMaintenance(String(unit.id))}
                        className="flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">
                          Schedule Maintenance
                        </span>
                        <span className="sm:hidden">Schedule</span>
                      </button>
                    )}
                </div>
                {unitMaintenance.length > 0 ? (
                  <div className="space-y-3">
                    {unitMaintenance.map((record) => {
                      // Determine which asset this record is for
                      const recordAsset = assets.find(
                        (a) => String(a.id) === String(record.assetId),
                      );
                      const isBulkGroupRecord =
                        record.isBulkGroupRecord === true ||
                        Number(record.isBulkGroupRecord) === 1;
                      const isBulkParentRecord =
                        isBulkGroupRecord &&
                        String(recordAsset?.id) ===
                          String(unit.bulkOrderParentId);
                      const isChildUnitRecord =
                        !isBulkGroupRecord &&
                        String(recordAsset?.bulkOrderParentId) ===
                          String(unit.id);

                      // For bulk group records, calculate unit coverage
                      const bulkUnitCount = isBulkParentRecord
                        ? getRecordUnitCount(record)
                        : null;

                      return (
                        <div
                          key={record.id}
                          onClick={() =>
                            setSelectedMaintenanceRecord(
                              resolveMaintenanceRecord(record),
                            )
                          }
                          className="p-4 rounded-lg border border-gray-200 bg-white hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer group">
                          {/* Asset Info Header */}
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                                  {recordAsset?.assetCode ||
                                    record.assetCode ||
                                    "N/A"}
                                </span>
                                <span className="text-xs text-gray-600">
                                  {recordAsset?.assetName ||
                                    record.assetName ||
                                    "Unknown Asset"}
                                </span>
                              </div>
                              <StatusBadge
                                status={record.status}
                                size="xs"
                                userRole={userRole}
                                className="inline-flex"
                              />
                            </div>
                            {record.cost && record.cost > 0 && (
                              <div className="text-right shrink-0">
                                <div className="text-sm font-semibold text-gray-900 flex items-center justify-end gap-1">
                                  {formatCurrencyValue(
                                    isBulkParentRecord &&
                                      bulkUnitCount &&
                                      bulkUnitCount > 0
                                      ? record.cost / bulkUnitCount
                                      : record.cost,
                                  )}
                                  {isBulkParentRecord && (
                                    <span className="text-[10px] font-normal text-gray-500 bg-gray-100 px-1 py-0.5 rounded">
                                      Per-Unit
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {isLicenseRenewalMaintenance(record)
                                    ? "Renewal"
                                    : "Repair"}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Description & Dates */}
                          <h4 className="font-medium text-gray-900 text-sm mb-2">
                            {record.description}
                          </h4>
                          <div className="flex flex-col gap-1 text-xs text-gray-600">
                            {record.scheduledDate && (
                              <div>
                                <span className="text-gray-500">
                                  Scheduled:
                                </span>{" "}
                                <span className="font-medium">
                                  {formatDisplayDate(record.scheduledDate)}
                                </span>
                              </div>
                            )}
                            {record.completionDate && (
                              <div>
                                <span className="text-gray-500">
                                  Completed:
                                </span>{" "}
                                <span className="font-medium">
                                  {formatDisplayDate(record.completionDate)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
                    <Wrench className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">
                      No maintenance records
                    </p>
                    <p className="text-gray-500 text-sm mt-1">
                      No maintenance records for {unit.assetName}.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* History Tab */}
            {activeTab === "history" && (
              <div className="space-y-6">
                <AssetHistory
                  history={effectiveUnitHistory}
                  licenseAllocations={unitAllocations}
                  assetCategory={unit.category}
                  users={users}
                  assetId={String(unit.id)}
                  assetCode={unit.assetCode}
                  assetName={unit.assetName}
                  maintenanceRecords={unitMaintenance}
                  assets={assets}
                  isBulkOrder={false}
                  onViewAsset={(asset) => {
                    if (onViewAsset) onViewAsset(asset);
                    onClose();
                  }}
                  onViewMaintenance={(record) =>
                    setSelectedMaintenanceRecord(
                      resolveMaintenanceRecord(record),
                    )
                  }
                  userRole={userRole}
                />
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Maintenance Detail Modal */}
      <AnimatePresence>
        {selectedMaintenanceRecord && (
          <MaintenanceDetail
            record={selectedMaintenanceRecord}
            assets={(allAssets?.length ?? 0) > 0 ? (allAssets ?? assets) : assets.length > 0 ? assets : [unit as unknown as Asset]}
            maintenanceRecords={maintenanceRecords}
            licenseAllocations={licenseAllocations}
            onClose={() => setSelectedMaintenanceRecord(null)}
            onEdit={(record) => {
              const latestRecord = resolveMaintenanceRecord(record);
              setSelectedMaintenanceRecord(null);
              if (onEditMaintenance) {
                onEditMaintenance(latestRecord);
              } else {
                toast.error("Edit maintenance is unavailable in this view.");
              }
            }}
            userRole={userRole}
          />
        )}
      </AnimatePresence>

      {/* Troubleshoot Modal */}
      {showTroubleshootModal && (
        <TroubleshootModal
          isOpen={showTroubleshootModal}
          onClose={() => setShowTroubleshootModal(false)}
          onSubmit={async (reason) => {
            try {
              await dataService.reportIssue(String(unit.id), reason);
              toast.success(
                "Issue reported successfully. The relevant manager has been notified.",
              );
              window.dispatchEvent(new CustomEvent("REFRESH_APP_DATA"));
              setShowTroubleshootModal(false);
            } catch (err) {
              toast.error(getErrorMessage(err));
            }
          }}
          assetName={unit.assetName || unit.assetCode}
        />
      )}
    </div>,
    document.body,
  );
}
