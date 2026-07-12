'use client';

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import dataService from '@/lib/dataService';
import {
  X,
  Edit,
  MapPin,
  User,
  Key,
  Info,
  Activity,
  Trash2,
  Box,
  CheckCircle,
  ShieldCheck,
  UserPlus,
  Link2,
  ExternalLink,
  XCircle,
  AlertTriangle,
  Wrench,
  Plus,
} from "lucide-react";
import {
  Asset,
  LicenseAllocation,
  AssetHistory as AssetHistoryType,
  MaintenanceRecord,
  User as UserType,
  getAllocatedQuantity,
  getTotalQuantity,
} from '@/types';
import { formatCurrencyValue } from '@/lib/utils/formatCurrency';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/utils/dateHelpers';
import { getErrorMessage } from '@/lib/utils/errorHelpers';
import {
  ASSET_CONDITIONS_ARRAY,
  DEFAULT_ASSET_CONDITION,
  canUpdate as canRoleUpdate,
  hasPermission,
  PERMISSIONS,
  ASSET_STATUS,
  MAINTENANCE_STATUS,
  ALLOCATION_STATUS_DISPLAY,
  type UserRole,
  isSoftwareLikeCategory,
  HIDE_DELETE_UI,
} from '@/config/constants';
import { AssetAllotmentForm } from "./AssetAllotmentForm";
import { AssetHistory } from "./AssetHistory";
import { IndividualUnitsManagement } from "./IndividualUnitsManagement";
import { UnitDetailModal } from "./UnitDetailModal";
import { MaintenanceDetail } from "./MaintenanceDetail";
import { AnimatePresence, motion } from "framer-motion";
import {
  StatusBadge,
  getPillBadgeClass,
  canEdit,
  canDelete,
  getBlockedReason,
} from '@/components/ui/StatusBadge';
import {
  isLicenseRenewalMaintenance,
  getMaintenanceRecordTimestamp,
  getMaintenanceBreakdownLabel,
  sumCosts,
} from '@/lib/utils/assetHelpers';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { DisposalModal } from "./DisposalModal";
import { ConfirmationModal } from "./ConfirmationModal";
import { TroubleshootModal } from "./TroubleshootModal";

interface AssetDetailProps {
  asset: Asset;
  assets?: Asset[]; // Full list of assets for allocation selection
  licenseAllocations?: LicenseAllocation[];
  assetHistory?: AssetHistoryType[];
  maintenanceRecords?: MaintenanceRecord[];
  users?: UserType[];
  onClose: () => void;
  onEdit: (asset: Asset) => void;
  onDispose: (assetId: string, reason: string, condition: string) => void;
  onUpdate: (updates: Partial<Asset>) => Promise<void>;
  onAllocateLicense: (
    allocations: Array<{
      employeeId: string;
      userName: string;
      department: string;
      count: number;
      conditionAtAllocation?: string;
      installationLocation?: string;
      targetUnitId?: string;
      parentAssetId?: string;
      ipAddress?: string;
      macAddress?: string;
      operatingSystem?: string;
      serialNumber?: string;
    }>,
  ) => void;
  onRevokeLicense: (
    allocationId: string,
    conditionAtReturn?: string,
    notes?: string,
  ) => void;
  onBulkRevokeLicense?: (
    revocations: Array<{
      allocationId: string;
      conditionAtReturn: string;
      notes?: string;
    }>,
  ) => void;
  onAddMaintenance?: (assetId: string) => void;
  onEditMaintenance?: (record: MaintenanceRecord) => void;
  onViewAsset?: (asset: Asset) => void;
  onDeleteAsset?: (
    id: string,
    reason?: string,
    condition?: string,
  ) => Promise<void> | void;
  userRole: UserRole;
  currentUser?: Pick<UserType, "employeeId" | "userName"> & {
    role?: string;
    managedCategories?: string[];
  };
}

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <label className="ui-field-label">{label}</label>
    <div className="text-sm font-medium text-gray-900">{value}</div>
  </div>
);

export function AssetDetail({
  asset,
  assets = [],
  licenseAllocations = [],
  assetHistory = [],
  maintenanceRecords = [],
  users = [],
  onClose,
  onEdit,
  onDispose,
  onUpdate,
  onAllocateLicense,
  onRevokeLicense,
  onBulkRevokeLicense,
  onAddMaintenance,
  onEditMaintenance,
  onViewAsset,
  onDeleteAsset,
  userRole,
  currentUser,
}: AssetDetailProps) {
  // === MEMOIZED COMPUTED VALUES (moved up before state) ===
  // Check if this asset has child units - works for ANY category (software, hardware, networking, etc.)
  const individualUnits = useMemo(() => {
    return assets
      .filter(
        (a) =>
          String(a.bulkOrderParentId) === String(asset.id) && !a.isBulkOrder,
      )
      .sort((a, b) => {
        const numDiff = (a.unitNumber || 0) - (b.unitNumber || 0);
        if (numDiff !== 0) return numDiff;
        return (a.assetCode || "").localeCompare(b.assetCode || "", undefined, {
          numeric: true,
        });
      });
  }, [assets, asset.id]);

  // Show Individual Units tab if this asset has ANY child units, regardless of category
  const showManagementTab = individualUnits.length > 0;

  // Also consider this a bulk parent if it has the flag OR has children
  const isBulkParent = useMemo(
    () => asset.isBulkOrder === true || individualUnits.length > 0,
    [asset.isBulkOrder, individualUnits.length],
  );

  const assetCreatedTimestamp = useMemo(() => {
    if (!asset.createdAt) return null;
    const timestamp = new Date(asset.createdAt).getTime();

    return Number.isFinite(timestamp) ? timestamp : null;
  }, [asset.createdAt]);

  const disposalTimestamp = useMemo(() => {
    if (!asset.disposalDate) return null;
    if (asset.status === ASSET_STATUS.DISPOSED && asset.updatedAt) {
      const updatedAt = new Date(asset.updatedAt);
      const updatedTimestamp = updatedAt.getTime();
      if (Number.isFinite(updatedTimestamp)) return updatedTimestamp;
    }

    const disposalDate = new Date(asset.disposalDate);
    disposalDate.setHours(23, 59, 59, 999);
    const timestamp = disposalDate.getTime();

    return Number.isFinite(timestamp) ? timestamp : null;
  }, [asset.disposalDate, asset.status, asset.updatedAt]);

  const isRecordWithinAssetLifetime = useCallback(
    (record: MaintenanceRecord) => {
      const recordTimestamp = getMaintenanceRecordTimestamp(record);

      if (!recordTimestamp) return true;
      if (assetCreatedTimestamp && recordTimestamp < assetCreatedTimestamp) {
        return false;
      }
      if (disposalTimestamp && recordTimestamp > disposalTimestamp) {
        return false;
      }
      return true;
    },
    [assetCreatedTimestamp, disposalTimestamp],
  );

  const getRecordUnitCount = useCallback(
    (record: MaintenanceRecord, parentIdStr: string) => {
      const explicitCount = Number(record.unitCount || 0);
      if (explicitCount > 0) return explicitCount;

      const recordTimestamp = getMaintenanceRecordTimestamp(record);
      const count = assets.filter((child) => {
        if (String(child.bulkOrderParentId) !== parentIdStr) return false;
        if (child.isBulkOrder) return false;
        if (!recordTimestamp) return true;

        const childCreatedAt = new Date(child.createdAt).getTime();
        return Number.isFinite(childCreatedAt)
          ? childCreatedAt <= recordTimestamp
          : true;
      }).length;

      return count || 1;
    },
    [assets],
  );

  const {
    totalMaintenanceCost,
    renewalMaintenanceCost,
    repairMaintenanceCost,
  } = useMemo(() => {
    const assetIdStr = String(asset.id);

    // 1. Direct costs for THIS asset (excluding bulk group records)
    const directRecords = (maintenanceRecords || []).filter(
      (m) =>
        String(m.assetId) === assetIdStr &&
        !m.isBulkGroupRecord &&
        m.status === MAINTENANCE_STATUS.COMPLETED,
    );
    const directTotals = sumCosts(directRecords);

    // 2. Bulk group costs for THIS asset (if it's a bulk parent)
    const bulkGroupRecords = (maintenanceRecords || []).filter(
      (m) =>
        String(m.assetId) === assetIdStr &&
        m.isBulkGroupRecord &&
        m.status === MAINTENANCE_STATUS.COMPLETED,
    );
    // Use the same helper for all cost calculations
    const bulkTotals = sumCosts(bulkGroupRecords);

    // 3. Share of parent's bulk group costs (if this asset is a child unit)
    let sharedTotals = { renewal: 0, repair: 0 };
    if (asset.bulkOrderParentId) {
      const parentIdStr = String(asset.bulkOrderParentId);
      const parentGroupRecords = (maintenanceRecords || []).filter(
        (m) =>
          String(m.assetId) === parentIdStr &&
          m.isBulkGroupRecord &&
          m.status === MAINTENANCE_STATUS.COMPLETED,
      );
      const eligibleParentRecords = parentGroupRecords.filter(
        isRecordWithinAssetLifetime,
      );

      sharedTotals = sumCosts(eligibleParentRecords, (record) =>
        getRecordUnitCount(record, parentIdStr),
      );
    }

    // 4. For bulk parents, include completed maintenance on child units
    const childTotals = isBulkParent
      ? (() => {
          const childIds = new Set(
            individualUnits.map((unit) => String(unit.id)),
          );
          const childRecords = (maintenanceRecords || []).filter(
            (m) =>
              childIds.has(String(m.assetId)) &&
              !m.isBulkGroupRecord &&
              m.status === MAINTENANCE_STATUS.COMPLETED,
          );
          return sumCosts(childRecords);
        })()
      : { renewal: 0, repair: 0 };

    const renewal =
      directTotals.renewal +
      bulkTotals.renewal +
      sharedTotals.renewal +
      childTotals.renewal;
    const repair =
      directTotals.repair +
      bulkTotals.repair +
      sharedTotals.repair +
      childTotals.repair;

    return {
      totalMaintenanceCost: renewal + repair,
      renewalMaintenanceCost: renewal,
      repairMaintenanceCost: repair,
    };
  }, [
    maintenanceRecords,
    asset.id,
    asset.bulkOrderParentId,
    assets,
    individualUnits,
    isBulkParent,
    isRecordWithinAssetLifetime,
    getRecordUnitCount,
  ]);

  const maintenanceBreakdownLabel = useMemo(
    () =>
      getMaintenanceBreakdownLabel(
        renewalMaintenanceCost,
        repairMaintenanceCost,
        isSoftwareLikeCategory(asset.category),
      ),
    [renewalMaintenanceCost, repairMaintenanceCost, asset.category],
  );

  // Filter maintenance records for this asset and its child units
  const assetMaintenanceRecords = useMemo(() => {
    const assetIdStr = String(asset.id);
    const childIds = isBulkParent
      ? new Set(individualUnits.map((unit) => String(unit.id)))
      : new Set<string>();

    return (maintenanceRecords || []).filter(
      (m) =>
        String(m.assetId) === assetIdStr || childIds.has(String(m.assetId)),
    );
  }, [maintenanceRecords, asset.id, isBulkParent, individualUnits]);

  const activeMaintenance = useMemo(() => {
    const assetIdStr = String(asset.id);
    return assetMaintenanceRecords.find(
      (m) =>
        String(m.assetId) === assetIdStr &&
        (m.status === MAINTENANCE_STATUS.SCHEDULED ||
          m.status === MAINTENANCE_STATUS.IN_PROGRESS),
    );
  }, [assetMaintenanceRecords, asset.id]);

  // Always default to "details" tab
  const [activeTab, setActiveTab] = useState<
    "details" | "licenses" | "allocation" | "history" | "units" | "maintenance"
  >("details");

  const tabCls = (tab: string) =>
    `px-2 sm:px-4 py-2 sm:py-3 font-medium transition-colors no-push border-b-2 whitespace-nowrap text-sm ${activeTab === tab ? "text-blue-600 border-blue-600" : "text-gray-600 border-transparent hover:text-gray-900"}`;

  // Reset to details tab when switching between assets
  useEffect(() => {
    setActiveTab("details");
  }, [asset.id]);

  const canAccessAllocationTab =
    hasPermission(userRole, PERMISSIONS.ASSET_ALLOCATE) ||
    hasPermission(userRole, PERMISSIONS.ASSET_RETURN);

  useEffect(() => {
    if (!canAccessAllocationTab && activeTab === "allocation") {
      setActiveTab("details");
    } else if (!showManagementTab && activeTab === "units") {
      setActiveTab("details");
    }
  }, [canAccessAllocationTab, showManagementTab, activeTab]);

  const [showDisposeConfirm, setShowDisposeConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTroubleshootModal, setShowTroubleshootModal] = useState(false);
  const [unitToDispose, setUnitToDispose] = useState<Asset | null>(null);
  const [unitToDelete, setUnitToDelete] = useState<Asset | null>(null);
  const [selectedUnitFromAllocation, setSelectedUnitFromAllocation] =
    useState<Asset | null>(null);
  const [selectedUnitInitialMode, setSelectedUnitInitialMode] = useState<
    "view" | "edit"
  >("view");
  const [selectedUnitHideTabs, setSelectedUnitHideTabs] = useState(false);
  const [selectedMaintenanceRecord, setSelectedMaintenanceRecord] =
    useState<MaintenanceRecord | null>(null);
  const [expandedMaintenanceUnits, setExpandedMaintenanceUnits] = useState<
    Set<string>
  >(new Set());

  const toggleMaintenanceUnitExpansion = (recordId: string) => {
    const newSet = new Set(expandedMaintenanceUnits);
    if (newSet.has(recordId)) {
      newSet.delete(recordId);
    } else {
      newSet.add(recordId);
    }
    setExpandedMaintenanceUnits(newSet);
  };

  // Sync selectedUnitFromAllocation when assets updates (e.g., after an allocation or return)
  useEffect(() => {
    if (selectedUnitFromAllocation) {
      const updatedUnit = assets.find(
        (u) => String(u.id) === String(selectedUnitFromAllocation.id),
      );
      if (
        updatedUnit &&
        JSON.stringify(updatedUnit) !==
          JSON.stringify(selectedUnitFromAllocation)
      ) {
        setSelectedUnitFromAllocation(updatedUnit);
      }
    }
  }, [assets, selectedUnitFromAllocation]);

  // === QUANTITY COMPUTATION (must be before handlers that use them) ===
  // Active units exclude disposed and under-maintenance units — these should not count toward totals
  const activeUnits = useMemo(
    () =>
      individualUnits.filter(
        (u) =>
          u.status !== ASSET_STATUS.DISPOSED &&
          u.status !== ASSET_STATUS.UNDER_MAINTENANCE,
      ),
    [individualUnits],
  );
  const useIndividualUnits = individualUnits.length > 0;
  const totalQuantity = useIndividualUnits
    ? activeUnits.length
    : getTotalQuantity(asset);
  // Always derive allocatedQuantity from allocation records (never stale SQL CTE fields)
  const allocatedQuantity = getAllocatedQuantity(asset);
  const availableQuantity = totalQuantity - allocatedQuantity;

  const isSoftware = useMemo(
    () => isSoftwareLikeCategory(asset.category),
    [asset.category],
  );

  const hasHardwareSpecData = Boolean(
    asset.processor || asset.ram || asset.storage,
  );
  const hasNetworkingSpecData = Boolean(asset.portCount || asset.portSpeed);
  const hasLicenseSpecData = Boolean(
    asset.licenseType || asset.licenseExpiryDate,
  );
  const showTechnicalSpecs =
    hasHardwareSpecData || hasNetworkingSpecData || hasLicenseSpecData;

  const isLicenseExpiredStatus = asset.status === ASSET_STATUS.LICENSE_EXPIRED;

  const activeAllocation = useMemo(
    () =>
      licenseAllocations.find(
        (alloc) =>
          alloc.status === ALLOCATION_STATUS_DISPLAY.ACTIVE &&
          String(alloc.assetId) === String(asset.id),
      ) || null,
    [licenseAllocations, asset.id],
  );

  const parentAllocatedAsset = useMemo(() => {
    if (!activeAllocation?.parentAssetId) return null;
    return (
      assets.find(
        (a) => String(a.id) === String(activeAllocation.parentAssetId),
      ) || null
    );
  }, [assets, activeAllocation?.parentAssetId]);

  const allocationTargetIds = useMemo(() => {
    const ids = new Set<string>();
    ids.add(String(asset.id));
    if (isBulkParent) {
      individualUnits.forEach((unit) => ids.add(String(unit.id)));
    }
    return ids;
  }, [asset.id, isBulkParent, individualUnits]);

  const allowAllocationEdit = !asset.isBulkOrder && !isBulkParent && getTotalQuantity(asset) <= 1;

  const handleViewAllocationUnit = useCallback(
    (unit: Asset) => {
      if (onViewAsset) {
        onViewAsset(unit);
      } else {
        setSelectedUnitInitialMode("view");
        setSelectedUnitHideTabs(false);
        setSelectedUnitFromAllocation(unit);
      }
    },
    [onViewAsset],
  );

  const handleEditAllocationUnit = useCallback((unit: Asset) => {
    // Open the local UnitDetailModal in edit mode with all tabs visible
    setSelectedUnitInitialMode("edit");
    setSelectedUnitHideTabs(false);
    setSelectedUnitFromAllocation(unit);
  }, []);

  const activeAllocationCount = useMemo(() => {
    if (allocationTargetIds.size === 0) return 0;
    return licenseAllocations.reduce((sum, alloc) => {
      if (alloc.status !== ALLOCATION_STATUS_DISPLAY.ACTIVE) return sum;
      if (!allocationTargetIds.has(String(alloc.assetId))) return sum;
      return sum + (alloc.licensesAllocated || 1);
    }, 0);
  }, [licenseAllocations, allocationTargetIds]);

  const hasActiveAllocations = useMemo(
    () => activeAllocationCount > 0,
    [activeAllocationCount],
  );

  const hasDirectAllocation = useMemo(
    () => Boolean(activeAllocation),
    [activeAllocation],
  );

  // Assets allocated TO this asset — with transitive chain resolution
  // e.g., RAM→CPU→Desktop: Desktop shows both CPU and RAM
  const allottedAssets = useMemo(() => {
    const assetMap = new Map<
      string,
      { asset: Asset; allocations: LicenseAllocation[] }
    >();

    // BFS to collect all transitively received assets
    const visited = new Set<string>();
    const queue = [String(asset.id)];

    while (queue.length > 0) {
      const currentParentId = queue.shift()!;
      if (visited.has(currentParentId)) continue;
      visited.add(currentParentId);

      const childAllocations = licenseAllocations.filter(
        (alloc) =>
          String(alloc.parentAssetId) === currentParentId &&
          alloc.status === ALLOCATION_STATUS_DISPLAY.ACTIVE,
      );

      for (const alloc of childAllocations) {
        let childAsset = assets.find(
          (a) => String(a.id) === String(alloc.assetId),
        );

        if (!childAsset) {
          // Construct pseudo-asset for out-of-scope received assets
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
  }, [licenseAllocations, asset.id, assets]);

  const activeUnitAllocationToDispose = useMemo(() => {
    if (!unitToDispose) return null;

    return (
      licenseAllocations.find(
        (alloc) =>
          String(alloc.assetId) === String(unitToDispose.id) &&
          alloc.status === ALLOCATION_STATUS_DISPLAY.ACTIVE,
      ) || null
    );
  }, [unitToDispose, licenseAllocations]);

  const isUnitCurrentlyAllocated = useMemo(() => {
    if (!unitToDispose) return false;

    const hasAssignmentFields =
      Boolean(unitToDispose.employeeId?.trim()) ||
      Boolean(unitToDispose.parentAssetId);

    return (
      Boolean(activeUnitAllocationToDispose) ||
      hasAssignmentFields ||
      unitToDispose.status === ASSET_STATUS.ALLOCATED
    );
  }, [unitToDispose, activeUnitAllocationToDispose]);

  const isDisposalBlocked = unitToDispose
    ? isUnitCurrentlyAllocated
    : hasActiveAllocations || allottedAssets.length > 0;

  // === MEMOIZED HANDLERS ===
  const handleDispose = useCallback(
    (reason: string, condition?: string) => {
      // If unitToDispose is set, we are disposing a child unit
      const targetAsset = unitToDispose || asset;

      if (!canDelete(targetAsset.status)) return;

      if (isDisposalBlocked) {
        toast.error(
          unitToDispose
            ? "This unit is currently allocated. Please return or unassign it before retiring."
            : "This asset has active allocations or assets allocated to it. Please revoke or unassign them before retiring.",
        );
        return;
      }

      if (onDispose && reason.trim()) {
        onDispose(targetAsset.id, reason, condition || DEFAULT_ASSET_CONDITION);
        setShowDisposeConfirm(false);
        setUnitToDispose(null);
        if (unitToDispose) {
          setSelectedUnitFromAllocation(null);
        }
      }
    },
    [asset, unitToDispose, isDisposalBlocked, onDispose],
  );

  const handleEdit = useCallback(() => {
    if (canEdit(asset.status)) {
      onEdit(asset);
    } else {
      toast.error(
        getBlockedReason(asset.status, "edit") || "Cannot edit this asset.",
      );
    }
  }, [asset, onEdit]);

  const handleDelete = useCallback(() => {
    if (!canDelete(asset.status)) {
      toast.error(
        getBlockedReason(asset.status, "delete") ||
          "Cannot dispose this asset.",
      );
      return;
    }

    setUnitToDispose(null);
    setShowDisposeConfirm(true);
  }, [asset.status]);

  const handleDeleteUnit = useCallback((unit: Asset) => {
    if (canDelete(unit.status)) {
      setUnitToDispose(unit);
      setShowDisposeConfirm(true);
    } else {
      toast.error(
        getBlockedReason(unit.status, "delete") || "Cannot dispose this unit.",
      );
    }
  }, []);

  const handleHardDeleteUnit = useCallback((unit: Asset) => {
    setUnitToDelete(unit);
    setShowDeleteConfirm(true);
  }, []);

  // For bulk order parents, include allocations for all child units and transitive received assets
  const relevantAllocations = useMemo(() => {
    const rootAssetIds = new Set<string>([String(asset.id)]);

    if (isBulkParent) {
      individualUnits.forEach((u) => rootAssetIds.add(String(u.id)));
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
        (alloc as LicenseAllocation & { targetUnitId?: string | number | null })
          .targetUnitId || "",
      );

      return (
        chainAssetIds.has(allocationAssetId) ||
        (parentId && chainAssetIds.has(parentId)) ||
        (targetUnitId && chainAssetIds.has(targetUnitId))
      );
    });
  }, [isBulkParent, licenseAllocations, asset.id, individualUnits]);

  const lastMaintenance = useMemo(() => {
    const completed = assetMaintenanceRecords
      .filter(
        (r) => r.status === MAINTENANCE_STATUS.COMPLETED && r.completionDate,
      )
      .sort(
        (a, b) =>
          new Date(b.completionDate!).getTime() -
          new Date(a.completionDate!).getTime(),
      );
    return completed[0] || null;
  }, [assetMaintenanceRecords]);

  const nextMaintenance = useMemo(() => {
    const scheduled = assetMaintenanceRecords
      .filter(
        (r) => r.status === MAINTENANCE_STATUS.SCHEDULED && r.scheduledDate,
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledDate).getTime() -
          new Date(b.scheduledDate).getTime(),
      );
    return scheduled[0] || null;
  }, [assetMaintenanceRecords]);

  const disposalWarningItems = useMemo(() => {
    const items: string[] = [];

    if (unitToDispose) {
      if (isUnitCurrentlyAllocated) {
        const allocationTarget = activeUnitAllocationToDispose?.parentAssetName
          ? `asset ${activeUnitAllocationToDispose.parentAssetName}`
          : activeUnitAllocationToDispose?.userName ||
            activeUnitAllocationToDispose?.employeeId ||
            unitToDispose.userName ||
            unitToDispose.parentAssetName ||
            unitToDispose.employeeId ||
            "a user/asset";

        items.push(
          `This unit is currently assigned to ${allocationTarget}. Please revoke/unassign it from the Allotment tab before retiring.`,
        );
      }
    } else {
      if (hasActiveAllocations) {
        if (isSoftware) {
          items.push(
            `This software has ${activeAllocationCount} active license(s) allocated. Please revoke all licenses before retiring.`,
          );
        } else if (activeAllocationCount > 1) {
          items.push(
            `This asset has ${activeAllocationCount} active unit allocation(s). Please revoke all allocations from the Allotment tab before retiring.`,
          );
        } else {
          const allocationTarget = activeAllocation?.parentAssetName
            ? `asset ${activeAllocation.parentAssetName}`
            : activeAllocation?.userName || activeAllocation?.employeeId;

          items.push(
            `This asset is currently assigned to ${allocationTarget || "a user/asset"}. Please unassign it first from the Allotment tab before retiring.`,
          );
        }
      }

      if (allottedAssets.length > 0) {
        const previewAssets = allottedAssets
          .slice(0, 2)
          .map(({ asset: child }) => child.assetName || child.assetCode)
          .join(", ");
        const extraCount = Math.max(0, allottedAssets.length - 2);

        items.push(
          `${allottedAssets.length} asset(s) allocated to this asset will be released/unassigned on disposal${previewAssets ? ` (${previewAssets}${extraCount > 0 ? ` +${extraCount} more` : ""})` : ""}.`,
        );
      }

      if (isBulkParent) {
        items.push(
          `This is a Bulk Order Parent. Confirming disposal will permanently dispose of the whole asset record as well as all ${totalQuantity} associated individual units. This action cannot be undone.`,
        );
      }
    }

    // NEW: Check for active maintenance records and add cancellation warning
    const targetAssetIds = new Set<string>();
    if (unitToDispose) {
      targetAssetIds.add(String((unitToDispose as Asset).id));
    } else {
      targetAssetIds.add(String(asset.id));
      if (isBulkParent) {
        (individualUnits as Asset[]).forEach((u) =>
          targetAssetIds.add(String(u.id)),
        );
      }
    }

    const activeMaintCount = maintenanceRecords.filter(
      (m) =>
        targetAssetIds.has(String(m.assetId)) &&
        (m.status === MAINTENANCE_STATUS.SCHEDULED ||
          m.status === MAINTENANCE_STATUS.IN_PROGRESS),
    ).length;

    if (activeMaintCount > 0) {
      items.push(
        `This asset has ${activeMaintCount} active maintenance record(s) that will be automatically cancelled upon disposal.`,
      );
    }

    return items;
  }, [
    unitToDispose,
    isUnitCurrentlyAllocated,
    activeUnitAllocationToDispose,
    hasActiveAllocations,
    isSoftware,
    activeAllocationCount,
    asset,
    activeAllocation,
    allottedAssets,
    isBulkParent,
    totalQuantity,
    maintenanceRecords,
    individualUnits,
  ]);

  const disposalWarningTone =
    isDisposalBlocked || isBulkParent
      ? "bg-red-50 border-red-300 text-red-800"
      : allottedAssets.length > 0
        ? "bg-orange-50 border-orange-300 text-orange-800"
        : "bg-amber-50 border-amber-300 text-amber-800";

  const disposalWarningIconTone =
    isDisposalBlocked || isBulkParent
      ? "text-red-600"
      : allottedAssets.length > 0
        ? "text-orange-600"
        : "text-amber-600";

  const isDisposed = asset.status === ASSET_STATUS.DISPOSED;

  const handleAllocateUnit = useCallback(
    (
      unitId: string,
      data: {
        employeeId: string;
        userName: string;
        department: string;
        condition: string;
        parentAssetId?: string;
        installationLocation?: string;
        ipAddress?: string;
        macAddress?: string;
        operatingSystem?: string;
        serialNumber?: string;
      },
    ) =>
      onAllocateLicense([
        {
          employeeId: data.employeeId,
          userName: data.userName,
          department: data.department,
          count: 1,
          conditionAtAllocation: data.condition,
          targetUnitId: String(unitId),
          ...(data.parentAssetId && { parentAssetId: data.parentAssetId }),
          ...(data.installationLocation && {
            installationLocation: data.installationLocation,
          }),
          ...(data.ipAddress && { ipAddress: data.ipAddress }),
          ...(data.macAddress && { macAddress: data.macAddress }),
          ...(data.operatingSystem && {
            operatingSystem: data.operatingSystem,
          }),
          ...(data.serialNumber && { serialNumber: data.serialNumber }),
        },
      ]),
    [onAllocateLicense],
  );

  const handleReturnUnit = useCallback(
    (unitId: string, conditionAtReturn: string, notes?: string) => {
      const allocation = licenseAllocations.find(
        (a) =>
          String(a.assetId) === String(unitId) &&
          a.status === ALLOCATION_STATUS_DISPLAY.ACTIVE,
      );
      if (allocation)
        return onRevokeLicense(allocation.id, conditionAtReturn, notes);
      return Promise.resolve();
    },
    [licenseAllocations, onRevokeLicense],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
      role="presentation">
      <AnimatePresence mode="wait">
        <motion.div
          key={asset.id}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="asset-detail-modal bg-white rounded-xl shadow-2xl max-w-6xl w-full h-[85dvh] sm:h-[85vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}>
          <div className="sticky top-0 bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between z-10 shrink-0">
            <div className="min-w-0 flex-1 pr-2">
              <h2 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">
                {asset.assetName}
              </h2>
              <p className="mobile-xs text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1 truncate">
                <span className="hidden sm:inline">
                  Asset Code: {asset.assetCode}
                </span>
                <span className="sm:hidden">{asset.assetCode}</span>
              </p>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {canRoleUpdate(userRole) && (
                <button
                  onClick={handleEdit}
                  disabled={!canEdit(asset.status)}
                  title={
                    !canEdit(asset.status)
                      ? getBlockedReason(asset.status, "edit") || ""
                      : isBulkParent && allocatedQuantity > 0
                        ? `Some fields are locked — ${allocatedQuantity} unit(s) allocated.`
                        : ""
                  }
                  className={`px-2 sm:px-4 py-2 text-white rounded-lg flex items-center gap-1 sm:gap-2 text-sm font-semibold transition-colors ${
                    canEdit(asset.status)
                      ? "bg-blue-600 hover:bg-blue-700"
                      : "bg-gray-400 cursor-not-allowed opacity-70"
                  }`}>
                  <Edit className="w-4 h-4" />
                  <span className="hidden sm:inline">Edit</span>
                </button>
              )}

              {hasPermission(userRole, PERMISSIONS.ASSET_DISPOSE) && (
                <button
                  onClick={handleDelete}
                  disabled={!canDelete(asset.status)}
                  title={
                    !canDelete(asset.status)
                      ? getBlockedReason(asset.status, "delete") || ""
                      : ""
                  }
                  className={`px-2 sm:px-4 py-2 border rounded-lg flex items-center gap-1 sm:gap-2 text-sm font-semibold transition-colors ${
                    canDelete(asset.status)
                      ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                      : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                  }`}>
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Dispose</span>
                </button>
              )}
              {!isDisposed && (
                <button
                  onClick={() => setShowTroubleshootModal(true)}
                  title="Report an issue with this asset"
                  className="px-2 sm:px-4 py-2 border rounded-lg flex items-center gap-1 sm:gap-2 text-sm font-semibold transition-colors bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="hidden sm:inline">Report Issue</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Disposal Modal */}
          <DisposalModal
            isOpen={showDisposeConfirm}
            onClose={() => setShowDisposeConfirm(false)}
            onConfirm={handleDispose}
            asset={unitToDispose || asset}
            warnings={disposalWarningItems}
            isConfirmDisabled={isDisposalBlocked}
            confirmDisabledTooltip={
              isDisposalBlocked
                ? unitToDispose
                  ? "Unit is currently allocated. Return/unassign it first."
                  : "Asset has active allocations. Revoke/unassign first."
                : ""
            }
          />

          {/* Delete Confirmation Modal */}
          <ConfirmationModal
            isOpen={showDeleteConfirm}
            onClose={() => {
              setShowDeleteConfirm(false);
              setUnitToDelete(null);
            }}
            onConfirm={(reason, condition) => {
              if (unitToDelete && onDeleteAsset) {
                onDeleteAsset(String(unitToDelete.id), reason, condition);
                setSelectedUnitFromAllocation(null);
                setShowDeleteConfirm(false);
                setUnitToDelete(null);
              }
            }}
            title="Delete Asset"
            message={
              HIDE_DELETE_UI
                ? `Are you sure you want to permanently delete "${unitToDelete?.assetName || unitToDelete?.assetCode}"? This is only allowed for assets with no prior history and cannot be undone.`
                : `Are you sure you want to permanently delete "${unitToDelete?.assetName || unitToDelete?.assetCode}"? This action cannot be undone.`
            }
            confirmText="Confirm Deletion"
            confirmColor="bg-red-600 hover:bg-red-700"
            requireReason={true}
            showCondition={true}
            initialCondition={unitToDelete?.condition ?? undefined}
          />

          <TroubleshootModal
            isOpen={showTroubleshootModal}
            onClose={() => setShowTroubleshootModal(false)}
            onSubmit={async (reason) => {
              try {
                await dataService.reportIssue(asset.id, reason);
                toast.success(
                  "Issue reported successfully. The relevant manager has been notified.",
                );
                window.dispatchEvent(new CustomEvent("REFRESH_APP_DATA"));
                setShowTroubleshootModal(false);
              } catch (err) {
                toast.error(getErrorMessage(err));
              }
            }}
            assetName={asset.assetName || asset.assetCode}
          />

          {/* Tabs */}
          <div className="sticky top-18.25 bg-white border-b border-gray-200 px-3 sm:px-6 z-10">
            <div className="flex gap-1 sm:gap-4 overflow-x-auto">
              <button
                onClick={() => setActiveTab("details")}
                className={tabCls("details")}>
                <div className="flex items-center gap-1 sm:gap-2">
                  Details
                </div>
              </button>

              {canAccessAllocationTab &&
                !isBulkParent &&
                !isDisposed &&
                asset.status !== ASSET_STATUS.UNDER_MAINTENANCE &&
                (availableQuantity > 0 || hasActiveAllocations) && (
                  <button
                    onClick={() => setActiveTab("allocation")}
                    className={tabCls("allocation")}>
                    <div className="flex items-center gap-1 sm:gap-2">
                      <span className="hidden sm:inline">Asset Allotment</span>
                      <span className="sm:hidden">Allotment</span>
                      {asset.status !== ASSET_STATUS.DISPOSED &&
                        relevantAllocations.filter(
                          (l) => l.status === ALLOCATION_STATUS_DISPLAY.ACTIVE,
                        ).length > 0 && (
                          <span className="mobile-xs px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                            {
                              relevantAllocations.filter(
                                (l) =>
                                  l.status === ALLOCATION_STATUS_DISPLAY.ACTIVE,
                              ).length
                            }
                          </span>
                        )}
                    </div>
                  </button>
                )}
              {showManagementTab && (
                <button
                  onClick={() => setActiveTab("units")}
                  className={tabCls("units")}>
                  <div className="flex items-center gap-1 sm:gap-2">
                    <span className="hidden sm:inline">
                      {isBulkParent ? "Units & Allocation" : "Individual Units"}
                    </span>
                    <span className="sm:hidden">Units</span>
                    {individualUnits.length > 0 && !isDisposed && (
                      <span className="mobile-xs px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                        {
                          individualUnits.filter(
                            (u) => u.status !== ASSET_STATUS.DISPOSED,
                          ).length
                        }
                      </span>
                    )}
                    {individualUnits.length > 0 && isDisposed && (
                      <span className="mobile-xs px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full">
                        {individualUnits.length}
                      </span>
                    )}
                  </div>
                </button>
              )}
              <button
                onClick={() => setActiveTab("maintenance")}
                className={tabCls("maintenance")}>
                <div className="flex items-center gap-1 sm:gap-2">
                  <span className="hidden sm:inline">Maintenance</span>
                  <span className="sm:hidden">Maintenance</span>
                  {assetMaintenanceRecords.length > 0 && (
                    <span className="mobile-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-semibold">
                      {assetMaintenanceRecords.length}
                    </span>
                  )}
                </div>
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={tabCls("history")}>
                <div className="flex items-center gap-1 sm:gap-2">
                  <span className="hidden sm:inline">Asset History</span>
                  <span className="sm:hidden">History</span>
                </div>
              </button>
            </div>
          </div>

          <div className="p-3 sm:p-6 overflow-y-auto flex-1 modal-safe-bottom">
            {activeTab === "details" && (
              <div className="space-y-4 sm:space-y-8 lg:space-y-4">
                {/* Header Info: Status & Condition */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:gap-2">
                  {isLicenseExpiredStatus ? (
                    <span
                      className={getPillBadgeClass(
                        "bg-red-100 text-red-800 border-red-200",
                        "md",
                        "gap-1.5",
                      )}>
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      License Expired
                    </span>
                  ) : (
                    <StatusBadge
                      status={asset.status}
                      size="md"
                      userRole={userRole}
                      showIcon={true}
                      className="flex items-center gap-1.5"
                    />
                  )}
                  {asset.condition && (
                    <span
                      className={getPillBadgeClass(
                        "bg-indigo-100 text-indigo-800 border-indigo-200",
                        "md",
                        "gap-1.5",
                      )}>
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      Condition: {asset.condition}
                    </span>
                  )}
                  {asset.installationLocation && (
                    <span className="mobile-xs px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1 sm:gap-1.5 max-w-full">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        {asset.installationLocation}
                      </span>
                    </span>
                  )}
                </div>

                {/* Core Information Section */}
                <div
                  className={`grid grid-cols-1 gap-4 sm:gap-8 lg:gap-4 ${
                    showTechnicalSpecs ? "md:grid-cols-3" : "md:grid-cols-2"
                  }`}>
                  <div className="space-y-4 lg:space-y-2">
                    <h3 className="ui-section-title">Identification & Core</h3>
                    <div className="grid grid-cols-2 md:grid-cols-1 gap-x-4 gap-y-3 lg:gap-y-1.5">
                      <Field label="Category" value={asset.category} />
                      <Field label="Asset Type" value={asset.assetType} />
                      {asset.model && (
                        <Field label="Model" value={asset.model} />
                      )}
                      {asset.serialNumber && !isBulkParent && (
                        <Field
                          label="Serial Number"
                          value={asset.serialNumber}
                        />
                      )}
                    </div>
                  </div>

                  {showTechnicalSpecs && (
                    <div className="space-y-4 lg:space-y-2">
                      <h3 className="ui-section-title">
                        Technical Specifications
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-1 gap-x-4 gap-y-3 lg:gap-y-1.5">
                        {hasHardwareSpecData && (
                          <>
                            {asset.processor && (
                              <Field
                                label="Processor"
                                value={asset.processor}
                              />
                            )}
                            {!isDisposed && asset.ram && (
                              <Field label="RAM" value={asset.ram} />
                            )}
                            {asset.storage && (
                              <Field label="Storage" value={asset.storage} />
                            )}
                          </>
                        )}
                        {hasLicenseSpecData && (
                          <>
                            <Field
                              label="License Type"
                              value={asset.licenseType || "N/A"}
                            />
                            {asset.licenseExpiryDate && (
                              <Field
                                label="License Expiry"
                                value={
                                  <span
                                    className={
                                      isLicenseExpiredStatus
                                        ? "text-red-600 font-semibold"
                                        : ""
                                    }>
                                    {formatDisplayDate(asset.licenseExpiryDate)}
                                    {isLicenseExpiredStatus && " — Expired"}
                                  </span>
                                }
                              />
                            )}
                          </>
                        )}
                        {hasNetworkingSpecData && (
                          <>
                            <Field
                              label="Ports / Speed"
                              value={`${asset.portCount ? `${asset.portCount} Ports` : ""} ${asset.portSpeed ? `@ ${asset.portSpeed}` : ""}`}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 lg:space-y-2">
                    <h3 className="ui-section-title">Inventory & Cost</h3>
                    <div className="grid grid-cols-2 md:grid-cols-1 gap-x-4 gap-y-3 lg:gap-y-1.5">
                      <Field
                        label="Purchase Price"
                        value={
                          asset.purchasePrice !== null &&
                          asset.purchasePrice !== undefined ? (
                            `₹${formatCurrencyValue(asset.purchasePrice)}`
                          ) : (
                            <span className="text-gray-400 text-sm">₹0</span>
                          )
                        }
                      />
                      {((asset.purchasePrice !== null &&
                        asset.purchasePrice !== undefined) ||
                        totalMaintenanceCost > 0) && (
                        <div className="col-span-1 md:col-span-1">
                          <Field
                            label="Current Total Cost"
                            value={
                              <div className="flex flex-col">
                                <span className="font-bold text-blue-700">
                                  ₹
                                  {formatCurrencyValue(
                                    (isSoftwareLikeCategory(asset.category) &&
                                    renewalMaintenanceCost > 0
                                      ? 0
                                      : (asset.purchasePrice ?? 0)) +
                                      totalMaintenanceCost,
                                  )}
                                </span>
                                {totalMaintenanceCost > 0 &&
                                  maintenanceBreakdownLabel && (
                                    <span className="text-[10px] text-gray-500 font-normal leading-tight mt-0.5">
                                      ({maintenanceBreakdownLabel})
                                    </span>
                                  )}
                              </div>
                            }
                          />
                        </div>
                      )}
                      {/* Quantity / License display — disposed show decommissioned state */}
                      {asset.status === ASSET_STATUS.DISPOSED ? (
                        <div className="col-span-1 md:col-span-1">
                          <label className="ui-field-label">
                            {isSoftwareLikeCategory(asset.category)
                              ? "License Status"
                              : "Quantity Status"}
                          </label>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                              <XCircle className="w-3.5 h-3.5" />
                              Decommissioned
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            Had{" "}
                            {individualUnits.length > 0
                              ? individualUnits.length
                              : getTotalQuantity(asset)}{" "}
                            {isSoftwareLikeCategory(asset.category)
                              ? (individualUnits.length > 0
                                  ? individualUnits.length
                                  : getTotalQuantity(asset)) === 1
                                ? "license"
                                : "licenses"
                              : (individualUnits.length > 0
                                    ? individualUnits.length
                                    : getTotalQuantity(asset)) === 1
                                ? "unit"
                                : "units"}{" "}
                            before disposal
                          </p>
                        </div>
                      ) : !isSoftwareLikeCategory(asset.category) ? (
                        <div className="col-span-1 md:col-span-1">
                          <label className="ui-field-label">Quantity</label>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">
                              {allocatedQuantity} / {totalQuantity} allocated
                            </p>
                            {totalQuantity > 1 && (
                              <div className="w-24 sm:w-32 bg-gray-200 rounded-full h-1.5">
                                <div
                                  className="bg-blue-600 h-1.5 rounded-full"
                                  style={{
                                    width: `${(allocatedQuantity / totalQuantity) * 100}%`,
                                  }}
                                />
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {availableQuantity}{" "}
                            {userRole === "Viewer" ? "returned" : "available"}
                          </p>
                        </div>
                      ) : (
                        <div className="col-span-1 md:col-span-1">
                          <label className="ui-field-label">
                            License Usage
                          </label>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">
                              {allocatedQuantity} / {totalQuantity}
                            </p>
                            <div className="w-24 sm:w-32 bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-blue-600 h-1.5 rounded-full"
                                style={{
                                  width: `${(allocatedQuantity / (totalQuantity || 1)) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {availableQuantity}{" "}
                            {userRole === "Viewer"
                              ? "returned"
                              : "licenses remaining"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Purchase & Current Allocation Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-4">
                  <div className="space-y-4 lg:space-y-2">
                    <h3 className="ui-section-title">Purchase Details</h3>
                    <div className="grid grid-cols-2 gap-4 lg:gap-2">
                      <Field
                        label="Invoice No"
                        value={asset.invoiceNumber || "N/A"}
                      />
                      <Field
                        label="Invoice Date"
                        value={
                          asset.invoiceDate
                            ? formatDisplayDate(asset.invoiceDate)
                            : "N/A"
                        }
                      />
                      {asset.purchaseNumber && (
                        <Field label="PO Number" value={asset.purchaseNumber} />
                      )}
                      {asset.prNumber && (
                        <Field label="PR Number" value={asset.prNumber} />
                      )}
                      {asset.importBillUrl && (
                        <div className="col-span-2">
                          <label className="ui-field-label">
                            Invoice Upload
                          </label>
                          <a
                            href={`${asset.importBillUrl}?token=${sessionStorage.getItem("inventoryToken") || localStorage.getItem("inventoryToken") || ""}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline mt-0.5">
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                            View Invoice
                          </a>
                        </div>
                      )}
                      <div className="col-span-2">
                        <label className="ui-field-label">Vendor</label>
                        <p className="text-sm font-medium text-gray-900">
                          {asset.vendorName || "N/A"}
                        </p>
                        <p className="text-xs text-gray-500">
                          ID: {asset.vendorId || "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 lg:space-y-2">
                    <h3 className="ui-section-title">Current Allocation</h3>
                    <div className="min-h-20 flex items-start">
                      {/* Disposed — asset is out of service */}
                      {asset.status === ASSET_STATUS.DISPOSED ? (
                        <div className="bg-gray-50 rounded-lg p-3 w-full flex items-center gap-3">
                          <div className="bg-gray-400 rounded-lg p-2 shadow-sm shrink-0">
                            <XCircle className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="ui-copy-strong-muted">
                              Asset Disposed
                            </p>
                            <p className="text-xs text-gray-500 font-medium">
                              {asset.disposalDate
                                ? `Disposed on ${formatDisplayDate(asset.disposalDate)}`
                                : "No longer in service"}
                            </p>
                            {asset.disposalReason && (
                              <p
                                className="text-xs text-gray-400 mt-0.5 truncate max-w-62.5"
                                title={asset.disposalReason}>
                                Reason: {asset.disposalReason}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : isBulkParent ? (
                        <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 w-full">
                          <p className="mobile-micro text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-2">
                            Allocation Summary
                          </p>
                          <div className="flex items-center gap-3">
                            <div className="bg-blue-600 rounded p-2 shadow-sm shrink-0">
                              {isSoftware ? (
                                <Key className="w-5 h-5 text-white" />
                              ) : (
                                <Box className="w-5 h-5 text-white" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-bold text-gray-900 truncate">
                                  {allocatedQuantity} / {totalQuantity}{" "}
                                  {isSoftware ? "Licenses" : "Units"} Allocated
                                </p>
                                <span className="text-xs font-semibold text-blue-600">
                                  {Math.round(
                                    (allocatedQuantity / (totalQuantity || 1)) *
                                      100,
                                  )}
                                  %
                                </span>
                              </div>
                              <div className="w-full bg-blue-100 rounded-full h-1.5">
                                <div
                                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
                                  style={{
                                    width: `${(allocatedQuantity / (totalQuantity || 1)) * 100}%`,
                                  }}
                                />
                              </div>
                              <p className="text-[10px] text-gray-500 mt-1.5 font-medium">
                                {availableQuantity}{" "}
                                {isSoftware ? "remaining" : "available"} in
                                inventory
                              </p>
                            </div>
                          </div>
                          {hasDirectAllocation && (
                            <div className="mt-3 pt-3 border-t border-blue-100 flex items-center gap-2">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <p className="text-[10px] text-amber-700 font-medium leading-tight">
                                Notice: This parent record has a direct
                                allocation (
                                {activeAllocation?.parentAssetName
                                  ? `asset ${activeAllocation.parentAssetName}`
                                  : activeAllocation?.userName ||
                                    activeAllocation?.employeeId ||
                                    "Unknown"}
                                ). This is usually legacy data; please
                                re-allocate to a specific unit if needed.
                              </p>
                            </div>
                          )}
                        </div>
                      ) : activeAllocation &&
                        (activeAllocation.employeeId ||
                          activeAllocation.userName) ? (
                        <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 w-full">
                          <p className="mobile-micro text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-2">
                            Allocated To (User)
                          </p>
                          <div className="flex items-center gap-3">
                            <div className="bg-blue-600 rounded p-1.5 shadow-sm shrink-0">
                              <User className="w-4 h-4 text-white" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900 leading-tight mb-0.5">
                                {activeAllocation.userName || "Unknown User"}
                              </p>
                              <p className="text-xs text-blue-600 font-medium">
                                Employee ID:{" "}
                                {activeAllocation.employeeId || "N/A"}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : activeAllocation &&
                        (activeAllocation.parentAssetId ||
                          activeAllocation.parentAssetName) ? (
                        <div 
                          className={`bg-indigo-50/50 border border-indigo-100 rounded-lg p-3 w-full transition-all ${onViewAsset && parentAllocatedAsset ? "cursor-pointer hover:border-indigo-300 hover:shadow-sm" : ""}`}
                          onClick={() => {
                            if (onViewAsset && parentAllocatedAsset) {
                              onClose();
                              onViewAsset(parentAllocatedAsset);
                            }
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="mobile-micro text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-2">
                                Allocated To (Asset)
                              </p>
                              <div className="flex items-center gap-3">
                                <div className="bg-indigo-600 rounded p-1.5 shadow-sm shrink-0">
                                  <Link2 className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-gray-900 leading-tight mb-0.5">
                                    {activeAllocation.parentAssetName ||
                                      "Parent Asset"}
                                  </p>
                                  <p className="text-xs text-indigo-600 font-medium">
                                    Asset Code:{" "}
                                    {parentAllocatedAsset?.assetCode || "N/A"}
                                  </p>
                                </div>
                              </div>
                            </div>
                            {onViewAsset && parentAllocatedAsset && (
                              <ExternalLink className="w-4 h-4 text-indigo-400 mt-1 mr-1 opacity-70" />
                            )}
                          </div>
                        </div>
                      ) : activeAllocation &&
                        activeAllocation.installationLocation &&
                        !activeAllocation.employeeId &&
                        !activeAllocation.parentAssetId ? (
                        <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-3 w-full">
                          <p className="mobile-micro text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-2">
                            Allocated To (Location)
                          </p>
                          <div className="flex items-center gap-3">
                            <div className="bg-emerald-600 rounded p-1.5 shadow-sm shrink-0">
                              <MapPin className="w-4 h-4 text-white" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900 leading-tight mb-0.5">
                                {activeAllocation.installationLocation}
                              </p>
                              <p className="text-xs text-emerald-600 font-medium">
                                Installed at Location
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : asset.status === "Under Maintenance" ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 w-full flex items-center gap-3">
                          <div className="bg-amber-200 rounded p-1.5 shrink-0">
                            <AlertTriangle className="w-4 h-4 text-amber-700" />
                          </div>
                          <div>
                            <p className="ui-copy-strong-dark">
                              Under Maintenance
                            </p>
                            <p className="text-xs text-amber-700 font-medium">
                              {totalQuantity}{" "}
                              {isSoftware ? "Licenses" : "Units"} — Maintenance
                              in Progress
                            </p>
                          </div>
                        </div>
                      ) : isLicenseExpiredStatus ? (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 w-full flex items-center gap-3">
                          <div className="bg-red-500 rounded-lg p-2 shadow-sm shrink-0">
                            <AlertTriangle className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="ui-copy-strong-dark">
                              License Expired
                            </p>
                            <p className="text-xs text-red-600 font-medium">
                              Expired on{" "}
                              {asset.licenseExpiryDate
                                ? formatDisplayDate(asset.licenseExpiryDate)
                                : "an earlier date"}
                              {" — "}
                              renew to allocate
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-green-50 border border-green-100 rounded-lg p-3 w-full flex items-center gap-3">
                          <div className="bg-green-200 rounded p-1.5 shrink-0">
                            <CheckCircle className="w-4 h-4 text-green-700" />
                          </div>
                          <div>
                            <p className="ui-copy-strong-dark">
                              {userRole === "Viewer"
                                ? "Fully Returned"
                                : "Fully Available"}
                            </p>
                            {userRole !== "Viewer" && (
                              <p className="text-xs text-green-700 font-medium">
                                {totalQuantity}{" "}
                                {isSoftware ? "Licenses" : "Units"} Ready for
                                Allocation
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Assets Received / Allocated To This Asset */}
                    {allottedAssets.length > 0 && (
                      <div className="pt-4 lg:pt-2 border-t border-gray-200">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Link2 className="w-3.5 h-3.5 text-gray-400" />
                          <h3 className="text-sm font-semibold text-gray-900">
                            Assets Received
                          </h3>
                          <span className="mobile-micro px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded-full font-semibold leading-none">
                            {allottedAssets.length}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 mb-2 ml-5">
                          {isBulkParent
                            ? "Total active assets received across all units"
                            : "Currently allocated to this asset"}
                        </p>

                        {/* Bulk parent: show compact count only */}
                        {isBulkParent ? (
                          <div className="bg-blue-50/50 border border-blue-100 rounded-md p-2 flex items-center gap-2">
                            <div className="bg-blue-600 rounded p-1.5 shadow-sm shrink-0">
                              <Link2 className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div>
                              <p className="ui-copy-strong-xs">
                                {allottedAssets.length}{" "}
                                {allottedAssets.length === 1
                                  ? "Asset"
                                  : "Assets"}{" "}
                                Received
                              </p>
                              <p className="text-[10px] text-blue-600 font-medium">
                                View individual units for details
                              </p>
                            </div>
                          </div>
                        ) : (
                          /* Non-bulk: show full clickable chip list */
                          <div className="flex flex-wrap gap-1.5">
                            {allottedAssets.map(
                              ({ asset: childAsset, allocations }) => {
                                const totalAllocated = allocations.reduce(
                                  (sum, a) => sum + (a.licensesAllocated || 1),
                                  0,
                                );
                                const catColors: Record<string, string> = {
                                  Software:
                                    "bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100",
                                  Networking:
                                    "bg-cyan-50 border-cyan-200 text-cyan-800 hover:bg-cyan-100",
                                  Hardware:
                                    "bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100",
                                };
                                const colorClass =
                                  catColors[childAsset.category] ||
                                  "bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100";

                                const canAccessChildCategory = true;


                                return (
                                  <button
                                    key={childAsset.id}
                                    onClick={() =>
                                      canAccessChildCategory &&
                                      onViewAsset?.(childAsset)
                                    }
                                    disabled={!canAccessChildCategory}
                                    className={`group inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-all ${canAccessChildCategory ? "cursor-pointer " + colorClass : "cursor-not-allowed opacity-50 bg-gray-50 border-gray-200 text-gray-500"}`}
                                    title={
                                      canAccessChildCategory
                                        ? `View ${childAsset.assetName} (${childAsset.assetCode})`
                                        : `No permission to view ${childAsset.assetName}`
                                    }>
                                    {isSoftwareLikeCategory(
                                      childAsset.category,
                                    ) ? (
                                      <Key className="w-3.5 h-3.5 shrink-0 opacity-60" />
                                    ) : (
                                      <Box className="w-3.5 h-3.5 shrink-0 opacity-60" />
                                    )}
                                    <span className="truncate max-w-28 sm:max-w-35">
                                      {childAsset.assetName}
                                    </span>
                                    {totalAllocated > 1 && (
                                      <span className="px-1 py-0.5 rounded bg-white/60 text-[9px] font-bold">
                                        ×{totalAllocated}
                                      </span>
                                    )}
                                    <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
                                  </button>
                                );
                              },
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Deployment & Network — from active allocation */}
                {(() => {
                  const depIp =
                    String(activeAllocation?.ipAddress || "").trim() || null;
                  const depMac = String(asset.macAddress || "").trim() || null;
                  const depOs =
                    String(activeAllocation?.operatingSystem || "").trim() ||
                    null;
                  const depLoc =
                    String(
                      activeAllocation?.installationLocation ||
                        asset.installationLocation ||
                        "",
                    ).trim() || null;
                  if (!depIp && !depMac && !depOs && !depLoc) return null;
                  return (
                    <div className="pt-6 lg:pt-3 border-t border-gray-200">
                      <div className="space-y-4 lg:space-y-2">
                        <h3 className="ui-section-title">
                          Deployment &amp; Network
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-2">
                          {depLoc && (
                            <div>
                              <label className="ui-field-label">Location</label>
                              <p className="font-medium text-gray-900">
                                {depLoc}
                              </p>
                            </div>
                          )}
                          {depIp && (
                            <div>
                              <label className="ui-field-label">
                                IP Address
                              </label>
                              <p className="font-medium text-gray-900 font-mono">
                                {depIp}
                              </p>
                            </div>
                          )}
                          {depMac &&
                            !isSoftwareLikeCategory(asset.category) && (
                              <div>
                                <label className="ui-field-label">
                                  MAC Address
                                </label>
                                <p className="font-medium text-gray-900 font-mono">
                                  {depMac}
                                </p>
                              </div>
                            )}
                          {depOs && !isSoftwareLikeCategory(asset.category) && (
                            <div>
                              <label className="ui-field-label">
                                Operating System
                              </label>
                              <p className="font-medium text-gray-900">
                                {depOs}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Maintenance & Audit */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-4">
                  <div className="space-y-4 lg:space-y-2">
                    <h3 className="ui-section-title">Maintenance Info</h3>
                    <div className="grid grid-cols-2 gap-4 lg:gap-2">
                      <Field
                        label="Next Schedule"
                        value={
                          nextMaintenance
                            ? formatDisplayDate(nextMaintenance.scheduledDate)
                            : "Not Scheduled"
                        }
                      />
                      <Field
                        label="Last Completion"
                        value={
                          lastMaintenance?.completionDate
                            ? formatDisplayDate(lastMaintenance.completionDate)
                            : "Never"
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-4 lg:space-y-2">
                    <h3 className="ui-section-title">System Audit</h3>
                    <div className="grid grid-cols-2 gap-4 lg:gap-2">
                      <Field
                        label="Created On"
                        value={formatDisplayDateTime(asset.createdAt)}
                      />
                      <Field
                        label="Last Updated"
                        value={formatDisplayDateTime(asset.updatedAt)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "allocation" && canAccessAllocationTab && (
              <AssetAllotmentForm
                asset={{ ...asset, totalQuantity: totalQuantity }}
                assets={assets}
                allocations={relevantAllocations}
                users={users}
                onAllocate={onAllocateLicense}
                onRevoke={onRevokeLicense}
                onBulkRevoke={onBulkRevokeLicense}
                onViewUnit={handleViewAllocationUnit}
                onEditUnit={
                  allowAllocationEdit ? handleEditAllocationUnit : undefined
                }
                allowAllocationEdit={allowAllocationEdit}
                userRole={userRole}
                currentUser={currentUser}
                receivedAssets={allottedAssets.map((a) => a.asset)}
              />
            )}

            {activeTab === "units" && showManagementTab && (
              <IndividualUnitsManagement
                individualUnits={individualUnits}
                baseAssetCode={asset.assetCode}
                parentAssetStatus={asset.status}
                onEdit={onEdit}
                onDelete={handleDeleteUnit}
                onHardDelete={handleHardDeleteUnit}
                onSwitchToAllocation={() => {
                  if (canAccessAllocationTab) setActiveTab("allocation");
                }}
                onUpdateUnit={async (unitId, updates) => {
                  try {
                    await dataService.updateAsset(unitId, updates);
                    // Trigger a data refresh so the parent re-fetches all assets
                    if (onUpdate) {
                      await onUpdate({
                        _refreshAfterUnitEdit: true,
                      } as Partial<Asset>);
                    }
                  } catch (err) {
                    const msg = getErrorMessage(err);
                    toast.error(msg);
                    throw err; // Re-throw so UnitDetailModal can handle it
                  }
                }}
                onBulkUpdateUnits={async (unitIds, updates) => {
                  try {
                    // Perform single bulk update using the transactional bulk update endpoint
                    await dataService.bulkUpdateAssets(unitIds, updates);
                    // Trigger a SINGLE data refresh after all units are updated
                    if (onUpdate) {
                      await onUpdate({
                        _refreshAfterUnitEdit: true,
                      } as Partial<Asset>);
                    }
                  } catch (err) {
                    const msg = getErrorMessage(err);
                    toast.error(msg);
                    throw err;
                  }
                }}
                onBulkDisposeUnits={async (unitIds, reason, condition) => {
                  try {
                    // Perform single bulk disposal using the new bulk disposal endpoint
                    await dataService.bulkDisposeAssets(unitIds, {
                      disposalDate: new Date().toISOString(),
                      reason: reason || "Disposed",
                      condition: condition || "POOR",
                      disposedBy: currentUser?.employeeId || "SYSTEM",
                    });
                    // Trigger a SINGLE data refresh after all units are disposed
                    if (onUpdate) {
                      await onUpdate({
                        _refreshAfterUnitEdit: true,
                      } as Partial<Asset>);
                    }
                  } catch (err) {
                    const msg = getErrorMessage(err);
                    toast.error(msg);
                    throw err;
                  }
                }}
                onBulkDeleteUnits={async (unitIds, reason, condition) => {
                  try {
                    // Perform single bulk delete using the new bulk delete endpoint
                    await dataService.bulkDeleteAssets(unitIds, reason, condition);

                    // Trigger a SINGLE data refresh after all units are deleted
                    if (onUpdate) {
                      await onUpdate({
                        _refreshAfterUnitEdit: true,
                      } as Partial<Asset>);
                    }
                  } catch (err) {
                    const msg = getErrorMessage(err);
                    toast.error(msg);
                    throw err;
                  }
                }}
                onAllocateUnit={handleAllocateUnit}
                onReturnUnit={handleReturnUnit}
                onAddMaintenance={onAddMaintenance}
                onEditMaintenance={onEditMaintenance}
                users={users}
                licenseAllocations={licenseAllocations}
                maintenanceRecords={maintenanceRecords}
                assetHistory={assetHistory}
                userRole={userRole}
                allAssets={assets}
                assets={assets}
                onViewAsset={onViewAsset}
                purchasePrice={asset.purchasePrice}
                totalQuantity={totalQuantity}
                category={asset.category}
                onAddUnits={async (count, unitPrice) => {
                  await dataService.addUnitsToParent(
                    asset.id,
                    count,
                    unitPrice,
                  );
                  // Trigger a data refresh
                  if (onUpdate) {
                    await onUpdate({
                      _refreshAfterUnitEdit: true,
                    } as Partial<Asset>);
                  }
                }}
              />
            )}

            {activeTab === "history" && (
              <AssetHistory
                history={assetHistory}
                licenseAllocations={licenseAllocations}
                assetCategory={asset.category}
                users={users}
                assetId={asset.id}
                isBulkOrder={asset.isBulkOrder}
                assets={assets}
                onViewAsset={onViewAsset}
                onViewMaintenance={(record) =>
                  setSelectedMaintenanceRecord(record)
                }
                assetCode={asset.assetCode}
                assetName={asset.assetName}
                maintenanceRecords={maintenanceRecords}
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
                    asset.category !== "Software" &&
                    hasPermission(userRole, PERMISSIONS.MAINTENANCE_CREATE) && (
                      <button
                        onClick={() => onAddMaintenance(String(asset.id))}
                        className="flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">
                          Schedule Maintenance
                        </span>
                        <span className="sm:hidden">Schedule</span>
                      </button>
                    )}
                </div>
                {assetMaintenanceRecords.length > 0 ? (
                  <div className="space-y-3">
                    {assetMaintenanceRecords.map((record) => {
                      // Determine which asset this record is for
                      const recordAsset = assets.find(
                        (a) => String(a.id) === String(record.assetId),
                      );
                      const isBulkGroupRecord =
                        record.isBulkGroupRecord === true ||
                        Number(record.isBulkGroupRecord) === 1;
                      const isBulkParentRecord =
                        isBulkGroupRecord &&
                        String(recordAsset?.id) === String(asset.id);
                      const isChildUnitRecord =
                        !isBulkGroupRecord &&
                        String(recordAsset?.bulkOrderParentId) ===
                          String(asset.id);

                      // For bulk group records, calculate unit coverage
                      const bulkUnitCount = isBulkParentRecord
                        ? getRecordUnitCount(record, String(asset.id))
                        : null;

                      return (
                        <div
                          key={record.id}
                          onClick={() => setSelectedMaintenanceRecord(record)}
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
                                {isBulkParentRecord && (
                                  <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                                    Bulk Group • {bulkUnitCount}/
                                    {individualUnits.length} units
                                  </span>
                                )}
                                {isChildUnitRecord && (
                                  <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                                    Child Unit
                                  </span>
                                )}
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
                                <div className="text-sm font-semibold text-gray-900">
                                  {formatCurrencyValue(record.cost)}
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

                          {/* Bulk Coverage Info */}
                          {isBulkParentRecord &&
                            record.snapshotCoveredUnits &&
                            record.snapshotCoveredUnits.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-gray-100">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <div className="text-xs font-medium text-gray-700">
                                    Covered Units (
                                    {record.snapshotCoveredUnits.length}):
                                  </div>
                                  {record.snapshotCoveredUnits.length > 12 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleMaintenanceUnitExpansion(
                                          record.id,
                                        );
                                      }}
                                      className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                                      {expandedMaintenanceUnits.has(record.id)
                                        ? "Hide"
                                        : "Show All"}
                                    </button>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {(expandedMaintenanceUnits.has(record.id)
                                    ? record.snapshotCoveredUnits
                                    : record.snapshotCoveredUnits.slice(0, 12)
                                  ).map((unit, idx) => (
                                    <span
                                      key={unit.id || idx}
                                      className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-medium whitespace-nowrap">
                                      {unit.code}
                                    </span>
                                  ))}
                                  {!expandedMaintenanceUnits.has(record.id) &&
                                    record.snapshotCoveredUnits.length > 12 && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleMaintenanceUnitExpansion(
                                            record.id,
                                          );
                                        }}
                                        className="text-xs bg-gray-50 text-gray-600 px-2 py-0.5 rounded border border-gray-200 font-medium whitespace-nowrap hover:bg-gray-100 transition-colors">
                                        +
                                        {record.snapshotCoveredUnits.length -
                                          12}{" "}
                                        more
                                      </button>
                                    )}
                                </div>
                              </div>
                            )}
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
                      No maintenance records for {asset.assetName}
                      {isBulkParent ? " or its child units." : "."}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Unit Detail Modal from Allocation Click */}
      <AnimatePresence>
        {selectedUnitFromAllocation && (
          <UnitDetailModal
            unit={selectedUnitFromAllocation}
            onClose={() => {
              setSelectedUnitFromAllocation(null);
              setSelectedUnitInitialMode("view");
              setSelectedUnitHideTabs(false);
            }}
            onEdit={onEdit}
            initialMode={selectedUnitInitialMode}
            hideExtraTabs={selectedUnitHideTabs}
            onUpdateUnit={async (unitId, updates) => {
              try {
                await dataService.updateAsset(unitId, updates);
                // Immediately reflect changes in the open modal
                setSelectedUnitFromAllocation((prev) =>
                  prev ? { ...prev, ...updates } : prev,
                );
                if (onUpdate) {
                  await onUpdate({
                    _refreshAfterUnitEdit: true,
                  } as Partial<Asset>);
                }
              } catch (err) {
                const msg = getErrorMessage(err);
                toast.error(msg);
                throw err;
              }
            }}
            onAllocateUnit={handleAllocateUnit}
            onReturnUnit={handleReturnUnit}
            onAddMaintenance={onAddMaintenance}
            onEditMaintenance={onEditMaintenance}
            users={users}
            licenseAllocations={licenseAllocations}
            maintenanceRecords={maintenanceRecords}
            assetHistory={assetHistory}
            userRole={userRole}
            currentUser={currentUser}
            allAssets={assets}
            assets={assets}
            onViewAsset={onViewAsset}
            onDispose={(unitId) => {
              const unitAsset = assets.find(
                (a) => String(a.id) === String(unitId),
              );
              if (unitAsset) {
                handleDeleteUnit(unitAsset);
              }
            }}
            onDelete={(unitId) => {
              const unitAsset = assets.find(
                (a) => String(a.id) === String(unitId),
              );
              if (unitAsset) {
                handleHardDeleteUnit(unitAsset);
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Maintenance Detail Modal */}
      <AnimatePresence>
        {selectedMaintenanceRecord && (
          <MaintenanceDetail
            record={selectedMaintenanceRecord}
            assets={assets}
            onClose={() => setSelectedMaintenanceRecord(null)}
            onEdit={onEditMaintenance || (() => {})}
            onViewAsset={onViewAsset}
            userRole={userRole}
            maintenanceRecords={assetMaintenanceRecords}
            licenseAllocations={licenseAllocations}
          />
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
