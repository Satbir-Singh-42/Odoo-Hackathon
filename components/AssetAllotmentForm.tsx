'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  Users,
  Monitor,
  Key,
  UserIcon,
  Box,
  Trash2,
  Pencil,
  CheckCircle,
  X,
  Search,
  Package,
  Plus,
  ChevronDown,
  ChevronUp,
  MapPin,
} from "lucide-react";
import { z } from "zod";
import { allotmentSchema } from "@/lib/validations";
import { useDebounce } from '@/hooks/useDebounce';
import { toast } from "sonner";
import { getErrorMessage } from '@/lib/utils/errorHelpers';
import {
  User,
  Asset,
  LicenseAllocation,
  getQuantityLabel,
  getTotalQuantity,
} from '@/types';
import {
  ASSET_CONDITIONS_ARRAY,
  ASSET_CONDITIONS,
  DEFAULT_ASSET_CONDITION,
  ASSET_STATUS,
  ALLOCATION_STATUS_DISPLAY,
  hasPermission,
  PERMISSIONS,
  type UserRole,
  hasDeploymentFields,
  hasOperatingSystemField,
  isSoftwareLikeCategory,
} from '@/config/constants';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { canAllocate, getBlockedReason } from '@/components/ui/StatusBadge';
import { toDateInputValue, formatDisplayDate } from '@/lib/utils/dateHelpers';
import dataService from '@/lib/dataService';

interface AssetAllotmentFormProps {
  asset: Asset;
  assets?: Asset[];
  allocations: LicenseAllocation[];
  users: User[];
  onAllocate: (
    allocations: Array<{
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
  ) => void;
  onRevoke: (
    allocationId: string,
    conditionAtReturn?: string,
    notes?: string,
  ) => void;
  onBulkRevoke?: (
    revocations: Array<{
      allocationId: string;
      conditionAtReturn: string;
      notes?: string;
    }>,
  ) => void;
  onViewUnit?: (unit: Asset) => void;
  onEditUnit?: (unit: Asset) => void;
  userRole?: UserRole;
  /** Hide the Total/Allocated/Available stats and progress bar */
  hideStats?: boolean;
  /** Show allocation edit action for single-unit assets */
  allowAllocationEdit?: boolean;
  /** Assets that have been received by this asset (to prevent circular allocation) */
  receivedAssets?: Asset[];
  /** Current user for permission checks */
  currentUser?: { role?: string; managedCategories?: string[] };
}

export function AssetAllotmentForm({
  asset,
  assets = [],
  allocations,
  users,
  onAllocate,
  onRevoke,
  onBulkRevoke,
  onViewUnit,
  onEditUnit,
  userRole = "Viewer" as UserRole,
  hideStats = false,
  allowAllocationEdit = false,
  receivedAssets = [],
  currentUser,
}: AssetAllotmentFormProps) {
  // === STATE ===
  const [showAllocationForm, setShowAllocationForm] = useState(false);
  const [allocationType, setAllocationType] = useState<
    "User" | "Asset" | "Location"
  >("User");
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [enableLocationAllocation, setEnableLocationAllocation] =
    useState(true);

  useEffect(() => {
    dataService
      .getNotificationControlSettings()
      .then((settings) => {
        setEnableLocationAllocation(
          settings.enableLocationAllocation !== false,
        );
        if (
          settings.enableLocationAllocation === false &&
          allocationType === "Location"
        ) {
          setAllocationType("User");
        }
      })
      .catch(console.error);
  }, [allocationType]);

  interface BulkRow {
    id: string;
    unitId: string;
    targetId: string;
    date: string;
    condition: string;
    location: string;
    ipAddress: string;
    macAddress: string;
    operatingSystem: string;
    serialNumber: string;
    isExpanded: boolean;
  }
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([
    {
      id: Date.now().toString(),
      unitId: "",
      targetId: "",
      date: new Date().toISOString().split("T")[0],
      condition: DEFAULT_ASSET_CONDITION,
      location: "",
      ipAddress: "",
      macAddress: "",
      operatingSystem: "",
      serialNumber: "",
      isExpanded: false,
    },
  ]);

  // USER Selection - SINGLE USER ONLY
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // ASSET Selection - SINGLE ASSET ONLY
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");

  // SPECIFIC UNIT Selection - For bulk orders, select which specific unit to allocate
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");

  // Allocation metadata
  const [allocationCondition, setAllocationCondition] = useState<string>(
    DEFAULT_ASSET_CONDITION,
  );
  const [allocationLocation, setAllocationLocation] = useState<string>("");

  // Deployment-specific fields (NEW - v8.0)
  const [ipAddress, setIpAddress] = useState<string>("");
  const [macAddress, setMacAddress] = useState<string>("");
  const [operatingSystem, setOperatingSystem] = useState<string>("");

  // Serial number — shown only when the target asset/unit has no serial yet
  const [serialNumber, setSerialNumber] = useState<string>("");

  // Allocation date — defaults to today
  const [allocationDate, setAllocationDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );

  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  // Revoke confirmation state — ALL hooks MUST be before any conditional return
  const [pendingRevoke, setPendingRevoke] = useState<LicenseAllocation | null>(
    null,
  );
  const [conditionAtReturn, setConditionAtReturn] = useState<string>(
    DEFAULT_ASSET_CONDITION,
  );
  const [revokeNotes, setRevokeNotes] = useState<string>("");

  // Revoke ALL state
  const [showRevokeAllModal, setShowRevokeAllModal] = useState(false);
  const [revokeAllCondition, setRevokeAllCondition] = useState<string>(
    DEFAULT_ASSET_CONDITION,
  );
  const [revokeAllNotes, setRevokeAllNotes] = useState<string>("");

  // Search + multi-select revoke
  const [allocationSearch, setAllocationSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showRevokeSelectedModal, setShowRevokeSelectedModal] = useState(false);
  const [revokeSelectedCondition, setRevokeSelectedCondition] =
    useState<string>(DEFAULT_ASSET_CONDITION);
  const [revokeSelectedNotes, setRevokeSelectedNotes] = useState("");
  const [isProcessingRevoke, setIsProcessingRevoke] = useState(false);

  // Timeout tracking for cleanup
  const [successTimeout, setSuccessTimeout] = useState<NodeJS.Timeout>();

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (successTimeout) clearTimeout(successTimeout);
    };
  }, [successTimeout]);

  // Reset condition when asset changes
  useEffect(() => {
    if (asset?.condition) {
      setConditionAtReturn(asset.condition || DEFAULT_ASSET_CONDITION);
      setAllocationCondition(asset.condition || DEFAULT_ASSET_CONDITION);
    }
  }, [asset?.condition]);

  // Safety check — AFTER all hooks
  if (!asset) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg font-medium">Loading...</p>
      </div>
    );
  }

  // === MEMOIZED COMPUTED VALUES ===
  const quantityLabel = useMemo(
    () => getQuantityLabel(asset.category),
    [asset.category],
  );

  const isSoftwareCategory = useMemo(
    () => isSoftwareLikeCategory(asset.category),
    [asset.category],
  );

  const totalLicenses = useMemo(() => getTotalQuantity(asset), [asset]);

  // Auto-hide stats when there's only 1 unit and it's not software (always shows 1/0/1)
  const effectiveHideStats =
    hideStats || (totalLicenses <= 1 && !isSoftwareCategory);

  const canEditAllocation =
    allowAllocationEdit &&
    !!onEditUnit &&
    hasPermission(userRole, PERMISSIONS.ASSET_ALLOCATE);

  const isLicenseExpiredStatus = asset.status === ASSET_STATUS.LICENSE_EXPIRED;

  const allocatedCount = useMemo(
    () =>
      allocations
        .filter((a) => a.status === ALLOCATION_STATUS_DISPLAY.ACTIVE)
        // Only count allocations where THIS asset (or its children) is being allocated, not received
        .filter((a) => {
          const allocatedAsset = assets.find(
            (assetItem) => String(assetItem.id) === String(a.assetId)
          );
          return (
            String(asset.id) === String(allocatedAsset?.id) ||
            (!!allocatedAsset?.bulkOrderParentId && String(asset.id) === String(allocatedAsset.bulkOrderParentId))
          );
        })
        .reduce((sum, a) => sum + (a.licensesAllocated || 1), 0),
    [allocations, asset.id, assets],
  );

  const availableLicenses = useMemo(
    () => Math.max(0, totalLicenses - allocatedCount),
    [totalLicenses, allocatedCount],
  );

  // Auto-close form if background refresh makes it unavailable (e.g. after a conflict)
  useEffect(() => {
    if (availableLicenses <= 0 && showAllocationForm && asset.status !== ASSET_STATUS.ALLOCATED) {
      setShowAllocationForm(false);
    }
  }, [availableLicenses, showAllocationForm, asset.status]);

  const conflictAsset = useMemo(() => {
    if (isBulkMode) return null;

    if (allocationType === "User") {
      const isAllocated = asset.status === ASSET_STATUS.ALLOCATED || (asset.totalQuantity !== undefined && asset.totalQuantity > 0 && availableLicenses <= 0);
      if (isAllocated) {
        const activeAlloc = allocations.find(
          (a) => a.status === ALLOCATION_STATUS_DISPLAY.ACTIVE && String(a.assetId) === String(asset.id)
        );
        return {
          id: asset.id,
          name: asset.assetName || asset.assetCode || "Current Asset",
          holderName: asset.userName || activeAlloc?.userName || "Another employee",
          holderId: asset.employeeId || activeAlloc?.employeeId || null,
          allocationId: activeAlloc?.id || null
        };
      }
    } else if (allocationType === "Asset") {
      if (selectedAssetId) {
        const selectedAsset = assets.find((a) => String(a.id) === String(selectedAssetId));
        const isAllocated = selectedAsset?.status === ASSET_STATUS.ALLOCATED || selectedAsset?.employeeId;
        if (isAllocated) {
          return {
            id: selectedAsset.id,
            name: selectedAsset.assetName || selectedAsset.assetCode || "Selected Asset",
            holderName: selectedAsset.userName || "Another employee",
            holderId: selectedAsset.employeeId || null,
            allocationId: null
          };
        }
      }
    }
    return null;
  }, [allocationType, isBulkMode, asset, assets, selectedAssetId, availableLicenses, allocations]);

  const handleRequestTransfer = useCallback(async () => {
    if (!conflictAsset) return;

    try {
      const response = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: Number(conflictAsset.id),
          reason: `Transfer requested due to allocation conflict.`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to submit transfer request.");
      }

      toast.success("Transfer request submitted successfully!");
      setShowAllocationForm(false);
      
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("REFRESH_ANOMALIES"));
        window.dispatchEvent(new CustomEvent("refreshNotifications"));
        window.location.reload();
      }, 500);
    } catch (err: any) {
      toast.error(err.message || "Error submitting transfer request.");
    }
  }, [conflictAsset]);

  const activeAllocations = useMemo(
    () =>
      allocations
        .filter((a) => a.status === ALLOCATION_STATUS_DISPLAY.ACTIVE)
        .filter((a) => {
          const allocatedAsset = assets.find(
            (assetItem) => String(assetItem.id) === String(a.assetId)
          );
          return (
            String(asset.id) === String(allocatedAsset?.id) ||
            (!!allocatedAsset?.bulkOrderParentId && String(asset.id) === String(allocatedAsset.bulkOrderParentId))
          );
        })
        .filter(
          (allocation, index, self) =>
            index === self.findIndex((a) => a.id === allocation.id),
        ),
    [allocations, asset.id, assets],
  );

  const filteredAllocations = useMemo(() => {
    if (!allocationSearch.trim()) return activeAllocations;
    const q = allocationSearch.toLowerCase();
    return activeAllocations.filter(
      (a) =>
        (a.userName || "").toLowerCase().includes(q) ||
        (a.employeeId || "").toLowerCase().includes(q) ||
        (a.assetName || "").toLowerCase().includes(q) ||
        (a.assetCode || "").toLowerCase().includes(q) ||
        (a.parentAssetName || "").toLowerCase().includes(q),
    );
  }, [activeAllocations, allocationSearch]);

  const receivedAllocations = useMemo(
    () =>
      allocations
        .filter((a) => a.status === ALLOCATION_STATUS_DISPLAY.ACTIVE)
        .filter((a) => {
          const allocatedAsset = assets.find(
            (assetItem) => String(assetItem.id) === String(a.assetId)
          );
          return !(
            String(asset.id) === String(allocatedAsset?.id) ||
            (!!allocatedAsset?.bulkOrderParentId && String(asset.id) === String(allocatedAsset.bulkOrderParentId))
          );
        })
        .filter(
          (allocation, index, self) =>
            index === self.findIndex((a) => a.id === allocation.id),
        ),
    [allocations, asset.id, assets],
  );

  const allocatedEmployeeIds = useMemo(() => {
    if (asset.isBulkOrder) {
      if (!selectedUnitId) {
        // No unit selected yet — don't exclude anyone
        return [];
      }
      // For bulk orders: only exclude users who are allocated to the SELECTED unit
      return activeAllocations
        .filter((a) => String(a.assetId) === String(selectedUnitId))
        .map((a) => a.employeeId)
        .filter(Boolean);
    }
    // For non-bulk assets: exclude users who already have an active allocation to this asset
    return activeAllocations.map((a) => a.employeeId).filter(Boolean);
  }, [activeAllocations, asset.isBulkOrder, selectedUnitId]);

  const availableUsers = useMemo(
    () =>
      users.filter((user) => !allocatedEmployeeIds.includes(user.employeeId)),
    [users, allocatedEmployeeIds],
  );

  // Filter individual assets only (exclude bulk parents, include children and single assets)
  // Build a set of IDs to exclude: this asset + its parent + all sibling children
  const excludedAssetIds = useMemo(() => {
    const ids = new Set<string | number>();
    ids.add(asset.id);
    // If this asset is a child, exclude its parent and all siblings
    if (asset.bulkOrderParentId) {
      ids.add(asset.bulkOrderParentId);
      assets.forEach((a) => {
        if (a.bulkOrderParentId === asset.bulkOrderParentId) ids.add(a.id);
      });
    }
    // If this asset is a bulk parent, exclude all its children
    if (asset.isBulkOrder) {
      assets.forEach((a) => {
        if (a.bulkOrderParentId === asset.id) ids.add(a.id);
      });
    }
    // Prevent circular dependencies: Exclude any assets that have been received by this asset
    // Also exclude their bulk order parents and siblings to prevent allocating to another unit of the same bulk asset
    receivedAssets.forEach((a) => {
      ids.add(a.id);

      if (a.bulkOrderParentId) {
        ids.add(a.bulkOrderParentId);
        // Exclude all siblings of the received asset
        assets.forEach((sibling) => {
          if (sibling.bulkOrderParentId === a.bulkOrderParentId) {
            ids.add(sibling.id);
          }
        });
      }

      // If a received asset is a bulk parent, exclude its children
      if (a.isBulkOrder) {
        assets.forEach((child) => {
          if (child.bulkOrderParentId === a.id) {
            ids.add(child.id);
          }
        });
      }
    });
    return ids;
  }, [
    assets,
    asset.id,
    asset.bulkOrderParentId,
    asset.isBulkOrder,
    receivedAssets,
  ]);

  const availableAssets = useMemo(
    () =>
      assets
        .filter(
          (a) =>
            !excludedAssetIds.has(a.id) &&
            [
              ASSET_STATUS.AVAILABLE,
              ASSET_STATUS.UNDER_MAINTENANCE,
              ASSET_STATUS.ALLOCATED,
              ASSET_STATUS.PARTIALLY_ALLOCATED,
            ].includes(a.status as any) &&
            !isSoftwareLikeCategory(a.category) &&
            !a.isBulkOrder && // Exclude bulk order parents - only show individual units
            (a.totalQuantity || 1) <= 1, // Exclude parent assets with multiple units — must allocate to child units
        )
        .sort((a, b) =>
          (a.assetCode || "").localeCompare(b.assetCode || "", undefined, {
            numeric: true,
          }),
        ),
    [assets, excludedAssetIds],
  );

  // For bulk orders: get available individual units (children) of THIS asset
  const availableUnitsForAllocation = useMemo(() => {
    if (!asset.isBulkOrder) return [];

    return assets
      .filter(
        (a) =>
          a.bulkOrderParentId === asset.id &&
          a.status === ASSET_STATUS.AVAILABLE &&
          String(a.condition || "").toUpperCase() !== ASSET_CONDITIONS.POOR &&
          !a.employeeId && // Not allocated to user
          !a.parentAssetId, // Not allocated to another asset
      )
      .sort((a, b) =>
        (a.assetCode || "").localeCompare(b.assetCode || "", undefined, {
          numeric: true,
        }),
      );
  }, [assets, asset.id, asset.isBulkOrder]);

  const poorUnitsForAllocation = useMemo(() => {
    if (!asset.isBulkOrder) return [];
    return assets.filter(
      (a) =>
        a.bulkOrderParentId === asset.id &&
        String(a.condition || "").toUpperCase() === ASSET_CONDITIONS.POOR,
    );
  }, [asset.id, asset.isBulkOrder, assets]);

  const poorUnitLabels = useMemo(
    () =>
      poorUnitsForAllocation
        .map(
          (unit) =>
            unit.assetCode || unit.assetName || `Unit ${String(unit.id)}`,
        )
        .join(", "),
    [poorUnitsForAllocation],
  );

  const selectedUnitForAllocation = useMemo(() => {
    if (!asset.isBulkOrder || !selectedUnitId) return null;
    return (
      assets.find((unit) => String(unit.id) === String(selectedUnitId)) || null
    );
  }, [asset.isBulkOrder, assets, selectedUnitId]);

  const isAssetConditionPoor =
    String(asset.condition || "").toUpperCase() === ASSET_CONDITIONS.POOR;

  const isSelectedUnitConditionPoor =
    asset.isBulkOrder &&
    selectedUnitForAllocation &&
    String(selectedUnitForAllocation.condition || "").toUpperCase() ===
      ASSET_CONDITIONS.POOR;

  const isAllocationBlockedByCondition = asset.isBulkOrder
    ? Boolean(isSelectedUnitConditionPoor)
    : isAssetConditionPoor;

  const isNewAllocationBlockedByCondition =
    !asset.isBulkOrder && isAssetConditionPoor;

  const allocationConditionOptions = ASSET_CONDITIONS_ARRAY.filter(
    (condition) => condition.value !== ASSET_CONDITIONS.POOR,
  );

  const allocationBlockedMessage = useMemo(() => {
    if (!isAllocationBlockedByCondition) return "";
    if (asset.isBulkOrder && selectedUnitForAllocation) {
      const unitLabel =
        selectedUnitForAllocation.assetCode ||
        selectedUnitForAllocation.assetName ||
        "Selected unit";
      return `${unitLabel} is in Poor condition. Allocation is blocked.`;
    }
    return "This asset is in Poor condition. Allocation is blocked.";
  }, [
    asset.isBulkOrder,
    isAllocationBlockedByCondition,
    selectedUnitForAllocation,
  ]);

  const unitOptions = useMemo(
    () =>
      availableUnitsForAllocation.map((unit) => ({
        value: unit.id,
        label: unit.assetName || unit.assetCode || `Unit ${unit.id}`,
        sublabel: [
          unit.assetCode,
          unit.condition || "N/A",
          unit.installationLocation || "",
        ]
          .filter(Boolean)
          .join(" • "),
      })),
    [availableUnitsForAllocation],
  );

  const userOptions = useMemo(
    () =>
      availableUsers.map((user) => ({
        value: user.employeeId,
        label: `${user.userName} (${user.employeeId})`,
        sublabel: `${user.department || "No dept"}`,
      })),
    [availableUsers],
  );

  const assetOptions = useMemo(
    () =>
      availableAssets.map((a) => ({
        value: a.id,
        label: a.assetName || a.assetCode || "Unknown Asset",
        sublabel: `${a.assetCode ? a.assetCode + " • " : ""}${a.category} • ${a.assetType}`,
      })),
    [availableAssets],
  );

  const handleBulkAllocate = useCallback(async () => {
    if (!canAllocate(asset.status)) {
      toast.error(
        getBlockedReason(asset.status, "allocate") ||
          "Could not find the asset or users for allocation.",
      );
      return;
    }

    const validRows = bulkRows.filter(
      (r) =>
        r.unitId && (allocationType === "Location" ? r.location : r.targetId),
    );
    if (validRows.length === 0) {
      toast.error(
        `Please fill out Target Unit and ${allocationType} for at least one row.`,
      );
      return;
    }

    try {
      validRows.forEach(r => {
        allotmentSchema.parse({
          employeeId: allocationType === "User" ? r.targetId : undefined,
          targetUnitId: allocationType === "Asset" ? r.targetId : undefined,
          installationLocation: allocationType === "Location" ? r.location : undefined,
          allocationDate: r.date,
        });
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(`Validation Error: ${(err as any).errors[0].message}`);
        return;
      }
    }

    const unitIds = validRows.map((r) => r.unitId);
    if (new Set(unitIds).size !== unitIds.length) {
      toast.error("Cannot allocate the same unit multiple times.");
      return;
    }

    const allocationsToMake = validRows.map((row) => {
      if (allocationType === "User") {
        const selectedUser = users.find((u) => u.employeeId === row.targetId);
        return {
          employeeId: selectedUser?.employeeId || "",
          userName: selectedUser?.userName || "Unknown",
          department: selectedUser?.department || "N/A",
          count: 1,
          conditionAtAllocation: row.condition,
          allocationDate: row.date || undefined,
          targetUnitId: row.unitId,
          installationLocation: row.location,
          ipAddress: row.ipAddress,
          macAddress: row.macAddress,
          operatingSystem: row.operatingSystem,
          serialNumber: row.serialNumber || undefined,
        };
      } else if (allocationType === "Asset") {
        const selectedAsset = assets.find((a) => a.id === row.targetId);
        return {
          employeeId: "",
          userName: `[Asset] ${selectedAsset?.assetName || "Unknown"}`,
          department: "Asset Allocation",
          count: 1,
          parentAssetId: selectedAsset?.id,
          conditionAtAllocation: row.condition,
          allocationDate: row.date || undefined,
          targetUnitId: row.unitId,
          installationLocation: row.location,
          ipAddress: row.ipAddress,
          macAddress: row.macAddress,
          operatingSystem: row.operatingSystem,
          serialNumber: row.serialNumber || undefined,
        };
      } else {
        return {
          employeeId: "",
          userName: `[Location] ${row.location}`,
          department: "Location Allocation",
          count: 1,
          conditionAtAllocation: row.condition,
          allocationDate: row.date || undefined,
          targetUnitId: row.unitId,
          installationLocation: row.location,
          ipAddress: row.ipAddress,
          macAddress: row.macAddress,
          operatingSystem: row.operatingSystem,
          serialNumber: row.serialNumber || undefined,
        };
      }
    });

    // Check if allocating to software asset
    if (allocationType === "Asset") {
      const hasSoftwareTarget = allocationsToMake.some((alloc) => {
        const targetAsset = assets.find((a) => a.id === alloc.parentAssetId);
        return targetAsset && isSoftwareLikeCategory(targetAsset.category);
      });
      if (hasSoftwareTarget) {
        toast.error("Allocating to software assets is not allowed.");
        return;
      }
    }

    try {
      await Promise.resolve(onAllocate(allocationsToMake));
      setShowSuccessMessage(true);

      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("REFRESH_ANOMALIES"));
        window.dispatchEvent(new CustomEvent("refreshNotifications"));
      }, 800);

      if (successTimeout) clearTimeout(successTimeout);
      const timeout = setTimeout(() => setShowSuccessMessage(false), 3000);
      setSuccessTimeout(timeout);
      
      setBulkRows([
        {
          id: Date.now().toString(),
          unitId: "",
          targetId: "",
          date: new Date().toISOString().split("T")[0],
          condition: DEFAULT_ASSET_CONDITION,
          location: "",
          ipAddress: "",
          macAddress: "",
          operatingSystem: "",
          serialNumber: "",
          isExpanded: false,
        },
      ]);
      setShowAllocationForm(false);
    } catch (err) {
      // Show the error toast instead of succeeding
      toast.error(getErrorMessage(err) || "Failed to allocate units");
    }
  }, [
    asset.status,
    bulkRows,
    users,
    assets,
    allocationType,
    onAllocate,
    successTimeout,
  ]);

  const handleAllocate = useCallback(async () => {
    if (isBulkMode) {
      return handleBulkAllocate();
    }

    if (!canAllocate(asset.status)) {
      toast.error(
        getBlockedReason(asset.status, "allocate") ||
          "Could not find the asset or users for allocation.",
      );
      return;
    }

    if (isAllocationBlockedByCondition) {
      toast.error("Assets in Poor condition cannot be allocated.");
      return;
    }

    if (allocationType === "User" && !selectedUserId) return;
    if (allocationType === "Asset" && !selectedAssetId) return;
    if (allocationType === "Location" && !allocationLocation.trim()) return;

    try {
      allotmentSchema.parse({
        employeeId: allocationType === "User" ? selectedUserId : undefined,
        targetUnitId: allocationType === "Asset" ? selectedAssetId : undefined,
        installationLocation: allocationType === "Location" ? allocationLocation : undefined,
        allocationDate: allocationDate,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(`Validation Error: ${(err as any).errors[0].message}`);
        return;
      }
    }

    // Always allocate exactly 1 unit
    if (availableLicenses < 1) {
      toast.error(`No available ${quantityLabel.toLowerCase()} to allocate.`);
      return;
    }

    const macValue = macAddress.trim();
    if (macValue && hasDeploymentFields(asset.category)) {
      const targetId = asset.isBulkOrder ? selectedUnitId : asset.id;
      const duplicateMac = assets.find(
        (a) =>
          String(a.id) !== String(targetId) &&
          String(a.macAddress || "")
            .trim()
            .toLowerCase() === macValue.toLowerCase(),
      );
      if (duplicateMac) {
        toast.error(
          `MAC Address "${macAddress}" already exists on asset ${
            duplicateMac.assetCode || duplicateMac.assetName || duplicateMac.id
          }. Please use a unique MAC address.`,
        );
        return;
      }
    }

    const allocationsToMake: any[] = [];

    if (allocationType === "User") {
      const selectedUser = users.find((u) => u.employeeId === selectedUserId);
      if (selectedUser) {
        allocationsToMake.push({
          employeeId: selectedUser.employeeId,
          userName: selectedUser.userName,
          department: selectedUser.department,
          count: 1, // Always 1 unit
          conditionAtAllocation: allocationCondition,
          installationLocation: allocationLocation,
          ipAddress: ipAddress,
          macAddress: macAddress,
          operatingSystem: operatingSystem,
          serialNumber: serialNumber || undefined,
          allocationDate: allocationDate || undefined,
          // If it's a bulk order, we track which unit was selected
          targetUnitId: asset.isBulkOrder ? selectedUnitId : undefined,
        });
      }
    } else if (allocationType === "Asset") {
      const selectedAsset = assets.find((a) => a.id === selectedAssetId);
      if (selectedAsset && isSoftwareLikeCategory(selectedAsset.category)) {
        toast.error("Allocating to software assets is not allowed.");
        return;
      }
      if (selectedAsset) {
        allocationsToMake.push({
          employeeId: "",
          userName: `[Asset] ${selectedAsset.assetName}`,
          department: "Asset Allocation",
          count: 1, // Always 1 unit
          parentAssetId: selectedAsset.id,
          conditionAtAllocation: allocationCondition,
          installationLocation: allocationLocation,
          ipAddress: ipAddress,
          macAddress: macAddress,
          operatingSystem: operatingSystem,
          serialNumber: serialNumber || undefined,
          allocationDate: allocationDate || undefined,
          // If it's a bulk order, we track which unit was selected
          targetUnitId: asset.isBulkOrder ? selectedUnitId : undefined,
        });
      }
    } else if (allocationType === "Location") {
      if (allocationLocation.trim()) {
        allocationsToMake.push({
          employeeId: "",
          userName: `[Location] ${allocationLocation}`,
          department: "Location Allocation",
          count: 1, // Always 1 unit
          conditionAtAllocation: allocationCondition,
          installationLocation: allocationLocation,
          ipAddress: ipAddress,
          macAddress: macAddress,
          operatingSystem: operatingSystem,
          serialNumber: serialNumber || undefined,
          allocationDate: allocationDate || undefined,
          // If it's a bulk order, we track which unit was selected
          targetUnitId: asset.isBulkOrder ? selectedUnitId : undefined,
        });
      }
    }

    // Guard: if no valid allocation was built, do NOT show success
    if (allocationsToMake.length === 0) {
      toast.error(
        "Could not find the selected user or asset. Please try again.",
      );
      return;
    }

    try {
      await Promise.resolve(onAllocate(allocationsToMake));
      setShowSuccessMessage(true);

      // Trigger anomaly check in App.tsx after a slight delay
      // This allows the server's background detection (setImmediate) to finish.
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("REFRESH_ANOMALIES"));
        window.dispatchEvent(new CustomEvent("refreshNotifications"));
      }, 800);

      // Clear existing timeout if any
      if (successTimeout) clearTimeout(successTimeout);

      const timeout = setTimeout(() => setShowSuccessMessage(false), 3000);
      setSuccessTimeout(timeout);

      setSelectedUserId("");
      setSelectedAssetId("");
      setSelectedUnitId("");
      setAllocationLocation("");
      setIpAddress("");
      setMacAddress("");
      setOperatingSystem("");
      setSerialNumber("");
      setAllocationDate(new Date().toISOString().split("T")[0]);
      setShowAllocationForm(false);
    } catch (err) {
      toast.error(getErrorMessage(err) || "Failed to allocate unit");
    }
  }, [
    asset.status,
    asset.isBulkOrder,
    allocationType,
    selectedUserId,
    selectedAssetId,
    selectedUnitId,
    availableLicenses,
    users,
    assets,
    onAllocate,
    successTimeout,
    quantityLabel,
    allocationCondition,
    allocationLocation,
    allocationDate,
    ipAddress,
    macAddress,
    operatingSystem,
    serialNumber,
    isAllocationBlockedByCondition,
    handleBulkAllocate,
  ]);

  const handleRevokeConfirm = useCallback(() => {
    if (!pendingRevoke) return;
    onRevoke(pendingRevoke.id, conditionAtReturn, revokeNotes || undefined);
    setPendingRevoke(null);
    setConditionAtReturn(asset.condition || DEFAULT_ASSET_CONDITION);
    setRevokeNotes("");
  }, [
    pendingRevoke,
    conditionAtReturn,
    revokeNotes,
    onRevoke,
    asset.condition,
  ]);

  const handleRevokeAllConfirm = useCallback(async () => {
    const count = activeAllocations.length;
    setIsProcessingRevoke(true);

    try {
      if (onBulkRevoke) {
        await Promise.resolve(
          onBulkRevoke(
            activeAllocations.map((a) => ({
              allocationId: String(a.id),
              conditionAtReturn: revokeAllCondition,
              notes: revokeAllNotes || undefined,
            })),
          ),
        );
      } else {
        // Fallback for older implementations (Sequential - Avoid if possible)
        for (const allocation of activeAllocations) {
          await Promise.resolve(
            onRevoke(
              allocation.id,
              revokeAllCondition,
              revokeAllNotes || undefined,
            ),
          );
        }
      }

      setShowRevokeAllModal(false);
      setRevokeAllCondition(asset.condition || DEFAULT_ASSET_CONDITION);
      setRevokeAllNotes("");
      toast.dismiss();
      toast.success(`All ${count} allocation(s) revoked successfully.`);
    } finally {
      setIsProcessingRevoke(false);
    }
  }, [
    activeAllocations,
    onRevoke,
    revokeAllCondition,
    revokeAllNotes,
    asset.condition,
  ]);

  const handleRevokeSelectedConfirm = useCallback(async () => {
    const toRevoke =
      selectedIds.size > 0
        ? activeAllocations.filter((a) => selectedIds.has(String(a.id)))
        : activeAllocations;
    const count = toRevoke.length;
    setIsProcessingRevoke(true);

    try {
      if (onBulkRevoke) {
        await Promise.resolve(
          onBulkRevoke(
            toRevoke.map((a) => ({
              allocationId: String(a.id),
              conditionAtReturn: revokeSelectedCondition,
              notes: revokeSelectedNotes || undefined,
            })),
          ),
        );
      } else {
        // Fallback
        for (const allocation of toRevoke) {
          await Promise.resolve(
            onRevoke(
              allocation.id,
              revokeSelectedCondition,
              revokeSelectedNotes || undefined,
            ),
          );
        }
      }

      setShowRevokeSelectedModal(false);
      setSelectedIds(new Set());
      setRevokeSelectedCondition(asset.condition || DEFAULT_ASSET_CONDITION);
      setRevokeSelectedNotes("");
      toast.dismiss();
      toast.success(`${count} allocation(s) revoked successfully.`);
    } finally {
      setIsProcessingRevoke(false);
    }
  }, [
    activeAllocations,
    selectedIds,
    onRevoke,
    revokeSelectedCondition,
    revokeSelectedNotes,
    asset.condition,
  ]);

  const resolveAllocationAsset = useCallback(
    (allocation: LicenseAllocation): Asset | undefined => {
      const targetUnitId = String(
        (
          allocation as LicenseAllocation & {
            targetUnitId?: string | number | null;
          }
        ).targetUnitId || "",
      ).trim();

      const parentAssetId = allocation.parentAssetId
        ? String(allocation.parentAssetId).trim()
        : "";
      const isAllocatedFromCurrent =
        String(asset.id) === String(allocation.assetId);

      // If we are looking at the asset that is being allocated, the navigable target is the receiver.
      if (isAllocatedFromCurrent) {
        if (targetUnitId)
          return assets.find((a) => String(a.id) === targetUnitId);
        if (parentAssetId)
          return assets.find((a) => String(a.id) === parentAssetId);
      } else {
        // We are looking at the receiver, so the navigable target is the allocated asset.
        return assets.find((a) => String(a.id) === String(allocation.assetId));
      }

      // Fallback to name/code resolution if ID matching fails
      const normalizedCode = String(allocation.assetCode || "")
        .trim()
        .toLowerCase();
      const normalizedName = String(allocation.assetName || "")
        .trim()
        .toLowerCase();

      return (
        (normalizedCode
          ? assets.find(
              (a) =>
                String(a.assetCode || "")
                  .trim()
                  .toLowerCase() === normalizedCode,
            )
          : undefined) ||
        (normalizedName
          ? assets.find(
              (a) =>
                String(a.assetName || "")
                  .trim()
                  .toLowerCase() === normalizedName,
            )
          : undefined)
      );
    },
    [assets],
  );

  return (
    <div className="space-y-6">
      {/* Success Messages */}
      {showSuccessMessage && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-4 flex items-center gap-3 animate-fade-in">
          <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
          <p className="text-sm text-green-800 font-semibold">
            {quantityLabel} allocated successfully!
          </p>
        </div>
      )}

      {/* ==================== */}
      {/* ALLOCATION FORM      */}
      {/* ==================== */}
      <div
        className={
          effectiveHideStats
            ? ""
            : "bg-white border border-blue-300 rounded-lg p-4 shadow-sm transition-all"
        }>
        {/* Status Overview - Stats */}
        {!effectiveHideStats && !showAllocationForm && (
          <>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="p-3 bg-gray-50 rounded-lg shadow-sm text-center">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">
                  Total
                </p>
                <p className="text-xl font-bold text-gray-900 mt-1">
                  {totalLicenses}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg shadow-sm text-center">
                <p className="text-xs text-purple-500 font-medium uppercase tracking-wider">
                  Allocated
                </p>
                <p className="text-xl font-bold text-purple-700 mt-1">
                  {allocatedCount}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg shadow-sm text-center">
                <p className="text-xs text-green-500 font-medium uppercase tracking-wider">
                  Available
                </p>
                <p className="text-xl font-bold text-green-700 mt-1">
                  {availableLicenses}
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-6">
              <div className="flex justify-between text-xs font-medium text-gray-500 uppercase mb-2">
                <span>Progress</span>
                <span>
                  {((allocatedCount / (totalLicenses || 1)) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min((allocatedCount / (totalLicenses || 1)) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          </>
        )}

        {/* Allocate Header + Button */}
        <div
          className={`flex items-center justify-between ${effectiveHideStats || showAllocationForm ? "" : "mt-8 pt-6 border-t border-gray-200"}`}>
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
            Allocate {quantityLabel}
          </h4>
          {hasPermission(userRole, PERMISSIONS.ASSET_ALLOCATE) &&
            !showAllocationForm && (
              <button
                onClick={() => setShowAllocationForm(true)}
                disabled={
                  (availableLicenses === 0 && asset.status !== ASSET_STATUS.ALLOCATED) ||
                  !canAllocate(asset.status) ||
                  isNewAllocationBlockedByCondition
                }
                className="px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-semibold transition-all bg-blue-600 text-white hover:bg-blue-700 shadow-sm disabled:opacity-50">
                New Allocation
              </button>
            )}
        </div>

        {showAllocationForm &&
          asset.isBulkOrder &&
          poorUnitsForAllocation.length > 0 && (
            <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg">
              <svg
                className="w-4 h-4 text-gray-400 mt-0.5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                />
              </svg>
              <div>
                <p className="text-xs font-semibold text-gray-700">
                  Not Allocatable Units
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {poorUnitLabels}{" "}
                  {poorUnitsForAllocation.length === 1 ? "is" : "are"} not
                  allocatable due to Poor condition.
                </p>
              </div>
            </div>
          )}

        {/* Expired license warning banner */}
        {isLicenseExpiredStatus && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg">
            <svg
              className="w-4 h-4 text-red-500 mt-0.5 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
            <div>
              <p className="text-xs font-bold text-red-700">License Expired</p>
              <p className="text-xs text-red-600 mt-0.5">
                This license expired on{" "}
                <span className="font-semibold">
                  {asset.licenseExpiryDate
                    ? formatDisplayDate(asset.licenseExpiryDate)
                    : "an earlier date"}
                </span>
                . New allocations are blocked. Please renew the license first.
              </p>
            </div>
          </div>
        )}

        {isAllocationBlockedByCondition && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg">
            <svg
              className="w-4 h-4 text-gray-400 mt-0.5 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
            <div>
              <p className="text-xs font-semibold text-gray-700">
                Allocation Blocked
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                {allocationBlockedMessage}
              </p>
            </div>
          </div>
        )}

        {showAllocationForm && (
          <div className="space-y-3 animate-in slide-in-from-top-2 duration-200 mt-3 mb-3">
            {/* Allocation Type Toggle */}
            <div className="flex flex-wrap items-center justify-between gap-4 w-full">
              <div className="flex p-0.5 bg-gray-100 rounded-lg w-full sm:w-fit overflow-x-auto custom-scrollbar flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setAllocationType("User");
                    setSelectedAssetId("");
                    setAllocationLocation("");
                    setBulkRows((prev) => prev.map((r) => ({ ...r, targetId: "", location: "" })));
                  }}
                  className={`flex-1 sm:flex-none px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                    allocationType === "User"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}>
                  <Users className="w-3.5 h-3.5" />
                  To User
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAllocationType("Asset");
                    setSelectedUserId("");
                    setAllocationLocation("");
                    setBulkRows((prev) => prev.map((r) => ({ ...r, targetId: "", location: "" })));
                  }}
                  className={`flex-1 sm:flex-none px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                    allocationType === "Asset"
                      ? "bg-white text-purple-600 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}>
                  <Monitor className="w-3.5 h-3.5" />
                  To Asset
                </button>
                {enableLocationAllocation && (
                    <button
                      type="button"
                      onClick={() => {
                        setAllocationType("Location");
                        setSelectedUserId("");
                        setSelectedAssetId("");
                        setBulkRows((prev) => prev.map((r) => ({ ...r, targetId: "", location: "" })));
                      }}
                      className={`flex-1 sm:flex-none px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                        allocationType === "Location"
                          ? "bg-white text-emerald-600 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}>
                      <MapPin className="w-3.5 h-3.5" />
                      To Location
                    </button>
                  )}
              </div>

              {asset.isBulkOrder && (
                <button
                  type="button"
                  onClick={() => setIsBulkMode(!isBulkMode)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 border ${
                    isBulkMode
                      ? "bg-green-50 text-green-700 border-green-200 shadow-sm ring-1 ring-green-500/20"
                      : "bg-white text-gray-700 hover:bg-gray-50 border-gray-200 shadow-sm"
                  }`}>
                  <Package className="w-4 h-4" />
                  Bulk (Multiple)
                </button>
              )}
            </div>

            {isBulkMode ? (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[600px] border-collapse table-fixed">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase w-[23%] min-w-[150px]">
                          Target Unit *
                        </th>
                        <th className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase w-[27%] min-w-[170px]">
                          {allocationType === "User"
                            ? "Select User *"
                            : allocationType === "Asset"
                              ? "Select Asset *"
                              : "Location *"}
                        </th>
                        <th className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase w-[22%] min-w-[140px]">
                          Allocation Date
                        </th>
                        <th className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase w-[18%] min-w-[130px]">
                          Condition
                        </th>
                        <th className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase text-right w-[10%] min-w-[80px]">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bulkRows.map((row, index) => (
                        <Fragment key={row.id}>
                          <tr
                            className={`hover:bg-gray-50/50 ${row.isExpanded ? "bg-gray-50/50" : ""}`}>
                            <td className="px-2 py-2">
                              <SearchableSelect
                                value={row.unitId}
                                onChange={(val) => {
                                  const newRows = [...bulkRows];
                                  newRows[index].unitId = val;

                                  if (val) {
                                    const selectedUnit =
                                      availableUnitsForAllocation.find(
                                        (u) => u.id === val,
                                      );
                                    if (
                                      selectedUnit &&
                                      selectedUnit.condition
                                    ) {
                                      newRows[index].condition =
                                        selectedUnit.condition;
                                    }
                                  }

                                  setBulkRows(newRows);
                                }}
                                options={unitOptions.filter(
                                  (opt) =>
                                    opt.value === row.unitId ||
                                    !bulkRows.some(
                                      (r) => r.unitId === opt.value,
                                    ),
                                )}
                                placeholder="Choose unit..."
                              />
                            </td>
                            <td className="px-2 py-2">
                              {allocationType === "Location" ? (
                                <input
                                  type="text"
                                  value={row.location}
                                  onChange={(e) => {
                                    const newRows = [...bulkRows];
                                    newRows[index].location = e.target.value;
                                    setBulkRows(newRows);
                                  }}
                                  className="w-full h-9 sm:h-10 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm font-normal bg-white transition-all"
                                  placeholder="e.g. Building A"
                                />
                              ) : (
                                <SearchableSelect
                                  value={row.targetId}
                                  onChange={(val) => {
                                    const newRows = [...bulkRows];
                                    newRows[index].targetId = val;
                                    setBulkRows(newRows);
                                  }}
                                  options={
                                    allocationType === "User"
                                      ? userOptions
                                      : assetOptions
                                  }
                                  placeholder={
                                    allocationType === "User"
                                      ? "Search user..."
                                      : "Search asset..."
                                  }
                                />
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="date"
                                value={row.date}
                                onChange={(e) => {
                                  const newRows = [...bulkRows];
                                  newRows[index].date = e.target.value;
                                  setBulkRows(newRows);
                                }}
                                className="ui-control block w-full box-border h-9 sm:h-10 px-3 text-sm font-normal bg-white cursor-pointer"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <SearchableSelect
                                value={row.condition}
                                onChange={(val) => {
                                  const newRows = [...bulkRows];
                                  newRows[index].condition = val;
                                  setBulkRows(newRows);
                                }}
                                options={allocationConditionOptions}
                                placeholder="Condition..."
                              />
                            </td>
                            <td className="px-2 py-2 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  const newRows = [...bulkRows];
                                  newRows[index].isExpanded = !row.isExpanded;
                                  setBulkRows(newRows);
                                }}
                                className="p-1.5 mr-1 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                title="Toggle details">
                                {row.isExpanded ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setBulkRows(
                                    bulkRows.filter((r) => r.id !== row.id),
                                  );
                                }}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Remove row">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                          {row.isExpanded && (
                            <tr className="bg-gray-50/50 border-b border-gray-100">
                              <td colSpan={5} className="px-4 py-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {allocationType !== "Location" && (
                                    <div>
                                      <label className="ui-form-label text-xs">
                                        Location
                                      </label>
                                      <input
                                        type="text"
                                        value={row.location}
                                        onChange={(e) => {
                                          const newRows = [...bulkRows];
                                          newRows[index].location =
                                            e.target.value;
                                          setBulkRows(newRows);
                                        }}
                                        className="w-full h-8 px-2 border border-gray-300 rounded-lg text-xs font-normal"
                                        placeholder="e.g. Building A - Lobby"
                                      />
                                    </div>
                                  )}

                                  {(hasDeploymentFields(asset.category) || isSoftwareLikeCategory(asset.category)) && (
                                    <div>
                                      <label className="ui-form-label text-xs">
                                        IP Address
                                      </label>
                                      <input
                                        type="text"
                                        value={row.ipAddress}
                                        onChange={(e) => {
                                          const newRows = [...bulkRows];
                                          newRows[index].ipAddress =
                                            e.target.value;
                                          setBulkRows(newRows);
                                        }}
                                        className="w-full h-8 px-2 border border-gray-300 rounded-lg text-xs font-normal"
                                        placeholder="e.g. 192.168.1.1"
                                      />
                                    </div>
                                  )}

                                  {hasDeploymentFields(asset.category) && (
                                    <div>
                                      <label className="ui-form-label text-xs">
                                        MAC Address
                                      </label>
                                      <input
                                        type="text"
                                        value={row.macAddress}
                                        onChange={(e) => {
                                          const newRows = [...bulkRows];
                                          newRows[index].macAddress =
                                            e.target.value;
                                          setBulkRows(newRows);
                                        }}
                                        className="w-full h-8 px-2 border border-gray-300 rounded-lg text-xs font-normal"
                                        placeholder="e.g. AA:BB:CC:DD:EE:FF"
                                      />
                                    </div>
                                  )}

                                  <div>
                                    <label className="ui-form-label text-xs">
                                      Serial Number
                                    </label>
                                    <input
                                      type="text"
                                      value={row.serialNumber}
                                      onChange={(e) => {
                                        const newRows = [...bulkRows];
                                        newRows[index].serialNumber =
                                          e.target.value;
                                        setBulkRows(newRows);
                                      }}
                                      className="w-full h-8 px-2 border border-gray-300 rounded-lg text-xs font-normal"
                                      placeholder="e.g. SN-12345678"
                                    />
                                  </div>

                                  {hasOperatingSystemField(asset.category) && (
                                    <div>
                                      <label className="ui-form-label text-xs">
                                        Operating System
                                      </label>
                                      <input
                                        type="text"
                                        value={row.operatingSystem}
                                        onChange={(e) => {
                                          const newRows = [...bulkRows];
                                          newRows[index].operatingSystem =
                                            e.target.value;
                                          setBulkRows(newRows);
                                        }}
                                        className="w-full h-8 px-2 border border-gray-300 rounded-lg text-xs font-normal"
                                        placeholder="e.g. Windows 10"
                                      />
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setBulkRows([
                      ...bulkRows,
                      {
                        id: Date.now().toString() + Math.random().toString(),
                        unitId: "",
                        targetId: "",
                        date: new Date().toISOString().split("T")[0],
                        condition: DEFAULT_ASSET_CONDITION,
                        location: "",
                        ipAddress: "",
                        macAddress: "",
                        operatingSystem: "",
                        serialNumber: "",
                        isExpanded: false,
                      },
                    ]);
                  }}
                  className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
                  <Plus className="w-4 h-4" /> Add Row
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2">
                {/* Row 1: User/Asset/Location select + Allocation Date */}
                {allocationType === "User" ? (
                  <div>
                    <label className="ui-form-label">Select User *</label>
                    <SearchableSelect
                      value={selectedUserId}
                      onChange={setSelectedUserId}
                      options={userOptions}
                      placeholder="Search user..."
                    />
                  </div>
                ) : allocationType === "Asset" ? (
                  <div>
                    <label className="ui-form-label">Select Asset *</label>
                    <SearchableSelect
                      value={selectedAssetId}
                      onChange={setSelectedAssetId}
                      options={assetOptions}
                      placeholder="Search asset..."
                    />
                  </div>
                ) : (
                  <div>
                    <label className="ui-form-label">Location *</label>
                    <input
                      type="text"
                      value={allocationLocation}
                      onChange={(e) => setAllocationLocation(e.target.value)}
                      maxLength={150}
                      className="w-full h-9 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm font-normal bg-white transition-all"
                      placeholder="e.g. Building A - Lobby"
                    />
                  </div>
                )}

                <div className="min-w-0">
                  <label className="ui-form-label">Allocation Date</label>
                  <input
                    type="date"
                    value={toDateInputValue(allocationDate)}
                    onChange={(e) => setAllocationDate(e.target.value)}
                    className="ui-control block w-full min-w-0 max-w-full box-border h-9 px-3 text-sm font-normal bg-white cursor-pointer"
                  />
                </div>

                {/* Row 2: Target Unit (if bulk) + Condition */}
                {asset.isBulkOrder && (
                  <div>
                    <label className="ui-form-label">Target Unit *</label>
                    <SearchableSelect
                      value={selectedUnitId}
                      onChange={(val) => {
                        setSelectedUnitId(val);
                        if (val) {
                          const selectedUnit = availableUnitsForAllocation.find(
                            (u) => String(u.id) === String(val),
                          );
                          if (selectedUnit && selectedUnit.condition) {
                            setAllocationCondition(selectedUnit.condition);
                          }
                        }
                      }}
                      options={unitOptions}
                      placeholder="Choose unit..."
                    />
                  </div>
                )}

                <div>
                  <label className="ui-form-label">Condition</label>
                  <SearchableSelect
                    value={allocationCondition}
                    onChange={setAllocationCondition}
                    options={allocationConditionOptions}
                    placeholder="Condition..."
                  />
                </div>

                {/* Row 3: Location + IP Address */}
                {allocationType !== "Location" && (
                  <div>
                    <label className="ui-form-label">Location</label>
                    <input
                      type="text"
                      value={allocationLocation}
                      onChange={(e) => setAllocationLocation(e.target.value)}
                      maxLength={150}
                      className="w-full h-9 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white transition-all"
                      placeholder="e.g. Building A"
                    />
                  </div>
                )}

                {/* IP Address for Hardware, Networking, Software, and future categories */}
                {(hasDeploymentFields(asset.category) || isSoftwareLikeCategory(asset.category)) && (
                  <div>
                    <label className="ui-form-label">IP Address</label>
                    <input
                      type="text"
                      value={ipAddress}
                      onChange={(e) => setIpAddress(e.target.value)}
                      maxLength={150}
                      className="w-full h-9 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white transition-all"
                      placeholder="e.g. 192.168.1.1"
                    />
                  </div>
                )}

                {/* MAC Address — only shown if target unit/asset has no MAC address yet */}
                {(() => {
                  const targetUnit = asset.isBulkOrder
                    ? availableUnitsForAllocation.find(
                        (u) => u.id === selectedUnitId,
                      )
                    : asset;
                  const existingMac = String(
                    targetUnit?.macAddress || "",
                  ).trim();
                  const needsMac =
                    hasDeploymentFields(asset.category) &&
                    (!existingMac || existingMac.toLowerCase() === "na");
                  return needsMac ? (
                    <div>
                      <label className="ui-form-label">MAC Address</label>
                      <input
                        type="text"
                        value={macAddress}
                        onChange={(e) => setMacAddress(e.target.value)}
                        maxLength={50}
                        className="w-full h-9 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white transition-all"
                        placeholder="e.g. AA:BB:CC:DD:EE:FF"
                      />
                    </div>
                  ) : null;
                })()}

                {/* Serial Number — only shown if target unit/asset has no serial number yet */}
                {(() => {
                  const targetUnit = asset.isBulkOrder
                    ? availableUnitsForAllocation.find(
                        (u) => u.id === selectedUnitId,
                      )
                    : asset;
                  const needsSerial = targetUnit && !targetUnit.serialNumber;
                  return needsSerial ? (
                    <div>
                      <label className="ui-form-label">Serial Number</label>
                      <input
                        type="text"
                        value={serialNumber}
                        onChange={(e) => setSerialNumber(e.target.value)}
                        maxLength={100}
                        className="w-full h-9 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white transition-all"
                        placeholder="e.g. SN-12345678"
                      />
                    </div>
                  ) : null;
                })()}

                {/* Operating System for Hardware and future categories */}
                {hasOperatingSystemField(asset.category) && (
                  <div>
                    <label className="ui-form-label">Operating System</label>
                    <input
                      type="text"
                      value={operatingSystem}
                      onChange={(e) => setOperatingSystem(e.target.value)}
                      maxLength={150}
                      className="w-full h-9 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white transition-all"
                      placeholder="e.g. Windows 10"
                    />
                  </div>
                )}
              </div>
            )}

            {conflictAsset && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex flex-col gap-1 my-2">
                <p className="font-semibold flex items-center gap-1">
                  <span>Conflict Detected:</span>
                  <span>"{conflictAsset.name}" is currently held by {conflictAsset.holderName} {conflictAsset.holderId ? `(ID: ${conflictAsset.holderId})` : ""}.</span>
                </p>
                <p className="text-gray-600">
                  Standard allocation is blocked. You can submit a transfer request instead to request access.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-4 pt-2 border-t mt-4">
              <div className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-100 uppercase">
                {isBulkMode
                  ? `Allocating ${bulkRows.filter((r) => r.unitId && r.targetId).length} Unit(s)`
                  : "Allocating 1 Unit"}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAllocationForm(false)}
                  className="px-4 py-1.5 bg-gray-100 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-200">
                  Cancel
                </button>
                {conflictAsset ? (
                  <button
                    type="button"
                    onClick={handleRequestTransfer}
                    className="px-4 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 shadow-sm transition-all">
                    Request Transfer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleAllocate}
                    disabled={
                      isAllocationBlockedByCondition ||
                      (!isBulkMode &&
                        allocationType === "User" &&
                        (!selectedUserId ||
                          (asset.isBulkOrder && !selectedUnitId))) ||
                      (!isBulkMode &&
                        allocationType === "Asset" &&
                        (!selectedAssetId ||
                          (asset.isBulkOrder && !selectedUnitId))) ||
                      (!isBulkMode &&
                        allocationType === "Location" &&
                        (!allocationLocation.trim() ||
                          (asset.isBulkOrder && !selectedUnitId))) ||
                      (isBulkMode &&
                        bulkRows.filter(
                          (r) =>
                            r.unitId &&
                            (allocationType === "Location"
                              ? r.location
                              : r.targetId),
                        ).length === 0)
                    }
                    className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:bg-gray-300">
                    Allocate
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==================== */}
      {/* CURRENT ALLOCATIONS  */}
      {/* ==================== */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Header row */}
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-2 flex-wrap">
          <h4 className="font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Active Assignments
          </h4>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-black uppercase">
              {activeAllocations.length} Units
            </span>
            {hasPermission(userRole, PERMISSIONS.ASSET_RETURN) &&
              activeAllocations.length > 0 && (
                <button
                  onClick={() => {
                    setRevokeSelectedCondition(
                      asset.condition || DEFAULT_ASSET_CONDITION,
                    );
                    setRevokeSelectedNotes("");
                    setShowRevokeSelectedModal(true);
                  }}
                  className="px-2.5 py-1 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 hover:border-red-300 transition-colors flex items-center gap-1.5"
                  title={
                    selectedIds.size > 0
                      ? "Revoke selected allocations"
                      : "Revoke all allocations"
                  }>
                  <Trash2 className="w-3.5 h-3.5" />
                  {selectedIds.size > 0
                    ? `Revoke Selected (${selectedIds.size})`
                    : `Revoke All (${activeAllocations.length})`}
                </button>
              )}
          </div>
        </div>
        {/* Search bar */}
        {activeAllocations.length > 0 && (
          <div className="px-4 py-2.5 border-b border-gray-100 bg-white">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={allocationSearch}
                onChange={(e) => {
                  setAllocationSearch(e.target.value);
                }}
                placeholder="Search by name, employee ID, or asset..."
                className="w-full pl-9 pr-8 py-1.5 sm:py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all shadow-sm"
              />
              {allocationSearch && (
                <button
                  onClick={() => setAllocationSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 transition-colors"
                  title="Clear search">
                  <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
          </div>
        )}

        {activeAllocations.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {filteredAllocations.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-400 text-xs italic">
                No allocations match your search.
              </div>
            ) : (
              filteredAllocations.map((allocation) => {
                const allocatedUser = allocation.employeeId
                  ? users.find((u) => u.employeeId === allocation.employeeId)
                  : null;

                const displayName =
                  allocation.userName ||
                  allocatedUser?.userName ||
                  "Unknown User";
                const displayDepartment =
                  allocation.department ||
                  allocatedUser?.department ||
                  "No Department";
                const displayEmployeeId = allocation.employeeId || "N/A";

                const navigableAsset = resolveAllocationAsset(allocation);
                const isChecked = selectedIds.has(String(allocation.id));

                const toggleCheck = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(String(allocation.id)))
                      next.delete(String(allocation.id));
                    else next.add(String(allocation.id));
                    return next;
                  });
                };

                const allocatedAsset = assets.find(
                  (a) => String(a.id) === String(allocation.assetId),
                );

                const targetUnitId = String(
                  (allocation as any).targetUnitId || "",
                ).trim();
                const parentId = allocation.parentAssetId
                  ? String(allocation.parentAssetId).trim()
                  : "";
                const receiverAsset = targetUnitId
                  ? assets.find((a) => String(a.id) === targetUnitId)
                  : parentId
                    ? assets.find((a) => String(a.id) === parentId)
                    : undefined;

                const isCurrentReceiver =
                  String(asset.id) === String(receiverAsset?.id) ||
                  (!!receiverAsset?.bulkOrderParentId && String(asset.id) === String(receiverAsset.bulkOrderParentId));

                const canAccessReceiverCategory = currentUser?.role === "Admin" || (currentUser?.managedCategories && (currentUser.managedCategories.includes("ALL") || currentUser.managedCategories.includes(receiverAsset?.category || "")));

                const canNavigateToReceiver =
                  receiverAsset && onViewUnit && !isCurrentReceiver && canAccessReceiverCategory;

                const defaultNavTarget = canNavigateToReceiver ? receiverAsset : null;

                return (
                  <div
                    key={allocation.id}
                    className={`p-4 hover:bg-gray-50 flex items-center gap-3 transition-colors group ${
                      isChecked ? "bg-red-50/40" : ""
                    }`}>
                    {/* Checkbox */}
                    {hasPermission(userRole, PERMISSIONS.ASSET_RETURN) && (
                      <div
                        onClick={toggleCheck}
                        className="shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          onClick={toggleCheck}
                          className="w-4 h-4 rounded border-gray-300 text-red-600 accent-red-600 cursor-pointer"
                        />
                      </div>
                    )}
                    {/* Content */}
                    <div
                      className={`flex-1 min-w-0 flex items-center justify-between gap-4 ${
                        defaultNavTarget ? "cursor-pointer" : ""
                      }`}
                      onClick={() => {
                        if (defaultNavTarget && onViewUnit)
                          onViewUnit(defaultNavTarget);
                      }}>
                      <div className="flex-1 min-w-0">
                        <h5 className="font-bold text-gray-900 flex items-center gap-2">
                          {allocation.parentAssetName ? (
                            canNavigateToReceiver ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (receiverAsset && onViewUnit)
                                    onViewUnit(receiverAsset);
                                }}
                                className={`flex items-center gap-2 hover:underline underline-offset-2 transition-colors text-left ${isSoftwareLikeCategory(receiverAsset?.category || "") ? "text-purple-600 hover:text-purple-700" : "text-indigo-600 hover:text-indigo-700"}`}
                                title="View receiver asset">
                                {isSoftwareLikeCategory(
                                  receiverAsset?.category || "",
                                ) ? (
                                  <Key className="w-4 h-4 shrink-0" />
                                ) : (
                                  <Box className="w-4 h-4 shrink-0" />
                                )}
                                {allocation.parentAssetName}
                              </button>
                            ) : (
                              <span
                                className={`flex items-center gap-2 ${isSoftwareLikeCategory(receiverAsset?.category || "") ? "text-purple-600" : "text-indigo-600"}`}>
                                {isSoftwareLikeCategory(
                                  receiverAsset?.category || "",
                                ) ? (
                                  <Key className="w-4 h-4 shrink-0" />
                                ) : (
                                  <Box className="w-4 h-4 shrink-0" />
                                )}
                                {allocation.parentAssetName}
                              </span>
                            )
                          ) : allocation.employeeId ? (
                            <span className="flex items-center gap-2 text-blue-600">
                              <UserIcon className="w-4 h-4 shrink-0" />
                              {displayName}
                            </span>
                          ) : allocation.installationLocation ? (
                            <span className="flex items-center gap-2 text-emerald-600">
                              <MapPin className="w-4 h-4 shrink-0" />
                              {allocation.installationLocation}
                            </span>
                          ) : (
                            <span className="flex items-center gap-2 text-blue-600">
                              <UserIcon className="w-4 h-4 shrink-0" />
                              {displayName}
                            </span>
                          )}
                        </h5>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            Allocated From
                          </span>
                          <span className="text-xs font-medium text-gray-700 flex items-center gap-1">
                            {isSoftwareLikeCategory(asset.category) ? (
                              <Key className="w-3 h-3 text-gray-400 shrink-0" />
                            ) : (
                              <Box className="w-3 h-3 text-gray-400 shrink-0" />
                            )}
                            {allocation.assetName || allocation.assetCode}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <p className="text-xs text-gray-500 font-semibold">
                            {allocation.parentAssetId
                              ? "Asset Allocation"
                              : !allocation.employeeId &&
                                  allocation.installationLocation
                                ? "Location Allocation"
                                : `${displayEmployeeId} • ${displayDepartment}`}
                          </p>
                          {allocation.allocationDate && (
                            <>
                              <span className="text-gray-300">•</span>
                              <p className="text-xs text-gray-400 font-medium">
                                {formatDisplayDate(allocation.allocationDate)}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter leading-none mb-1">
                            Type
                          </p>
                          <div className="flex flex-col items-end gap-1">
                            <span className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded font-bold uppercase tracking-wider">
                              Allocated
                            </span>
                          </div>
                        </div>
                        {canEditAllocation && defaultNavTarget && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditUnit(defaultNavTarget);
                            }}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                            title="Edit allocation details">
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {hasPermission(userRole, PERMISSIONS.ASSET_RETURN) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingRevoke(allocation);
                            }}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                            title="Return allocation">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div
            className="px-12 py-20 text-center text-gray-400 italic text-sm bg-gray-50/30 flex items-center justify-center"
            style={{ minHeight: "80px" }}>
            No active {quantityLabel.toLowerCase()} allocations found for this
            asset.
          </div>
        )}
      </div>

      {/* Received Allocations (Read-only list of assets allocated TO this one) */}
      {receivedAllocations.length > 0 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Key className="w-4 h-4 text-purple-600" />
              Received Assets
            </h3>
            <span className="mobile-xs bg-purple-100 text-purple-700 py-1 px-2.5 rounded-md text-xs font-bold shrink-0 shadow-sm border border-purple-200 uppercase tracking-wide">
              {receivedAllocations.length} UNITS
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {receivedAllocations.map((allocation) => {
              let allocatedAsset = assets.find(
                (a) => String(a.id) === String(allocation.assetId),
              );

              if (!allocatedAsset) {
                allocatedAsset = {
                  id: allocation.assetId,
                  assetName: allocation.assetName || allocation.assetCode || "Unknown Asset",
                  assetCode: allocation.assetCode || "",
                  category: (allocation as any).category || "Unknown",
                } as Asset;
              }

              const canAccessAllocatedCategory = currentUser?.role === "Admin" || (currentUser?.managedCategories && (currentUser.managedCategories.includes("ALL") || currentUser.managedCategories.includes(allocatedAsset?.category || "")));

              // Intentionally require that the asset exists in the 'assets' list to navigate, 
              // but since we create a pseudo-asset, we must check if it was truly found or not.
              // We'll just rely on the pseudo-asset being passed to onViewUnit, but wait, the parent components
              // (UnitDetailModal, etc.) also won't find it in their arrays, so navigating to it might be broken anyway.
              // To be safe, if we don't have the real asset, we can't navigate to it.
              const isRealAsset = assets.some(a => String(a.id) === String(allocation.assetId));
              const canNavigateToAllocated = isRealAsset && allocatedAsset && onViewUnit && canAccessAllocatedCategory;

              return (
                <div
                  key={allocation.id}
                  className={`p-4 hover:bg-gray-50 flex items-center gap-3 transition-colors group ${canNavigateToAllocated ? "cursor-pointer" : ""}`}
                  onClick={() => {
                    if (canNavigateToAllocated) onViewUnit(allocatedAsset!);
                  }}>
                  <div className="flex-1 min-w-0">
                    <h5 className="font-bold text-gray-900 flex items-center gap-2">
                      <span className={`flex items-center gap-2 ${isSoftwareLikeCategory(allocatedAsset?.category || "") ? "text-purple-600" : "text-indigo-600"} ${canNavigateToAllocated ? "group-hover:underline underline-offset-2" : ""} transition-colors text-left`}>
                        {isSoftwareLikeCategory(allocatedAsset?.category || "") ? (
                          <Key className="w-4 h-4 shrink-0" />
                        ) : (
                          <Box className="w-4 h-4 shrink-0" />
                        )}
                        {allocation.assetName || allocation.assetCode}
                      </span>
                    </h5>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Received By
                      </span>
                      <span className="text-xs font-medium text-gray-700 flex items-center gap-1">
                        {isSoftwareLikeCategory(asset.category) ? (
                          <Key className="w-3 h-3 text-gray-400 shrink-0" />
                        ) : (
                          <Box className="w-3 h-3 text-gray-400 shrink-0" />
                        )}
                        {allocation.parentAssetName || asset.assetName || asset.assetCode}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-gray-500 font-semibold">
                        Asset Allocation
                      </p>
                      {allocation.allocationDate && (
                        <>
                          <span className="text-gray-300">•</span>
                          <p className="text-xs text-gray-400 font-medium">
                            {formatDisplayDate(allocation.allocationDate)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter leading-none mb-1">
                      Type
                    </p>
                    <div className="flex flex-col items-end gap-1">
                      <span className="px-1.5 py-0.5 text-[10px] bg-purple-100 text-purple-700 rounded font-bold uppercase tracking-wider">
                        Received
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {pendingRevoke && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setPendingRevoke(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-4 sm:p-6 animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                Confirm Return
              </h3>
              <button
                onClick={() => setPendingRevoke(null)}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-sm font-semibold text-gray-600 mb-4 bg-red-50 border border-red-100 p-3 rounded-lg">
              This will return{" "}
              <span className="text-red-600">1 selected allocation</span>. This
              action cannot be undone.
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Condition at Return <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  value={conditionAtReturn}
                  onChange={setConditionAtReturn}
                  options={[...ASSET_CONDITIONS_ARRAY]}
                  placeholder="Select condition..."
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Notes (optional)
                </label>
                <textarea
                  value={revokeNotes}
                  onChange={(e) => setRevokeNotes(e.target.value)}
                  placeholder="Additional notes..."
                  maxLength={255}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 text-sm font-normal min-h-20"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setPendingRevoke(null);
                  setConditionAtReturn(
                    asset.condition || DEFAULT_ASSET_CONDITION,
                  );
                  setRevokeNotes("");
                }}
                className="px-6 py-2 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 text-sm font-bold text-gray-700 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleRevokeConfirm}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-sm text-sm font-bold transition-colors">
                Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal (Selected or All) */}
      {showRevokeSelectedModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowRevokeSelectedModal(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-4 sm:p-6 animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-500" />
                {selectedIds.size > 0
                  ? "Return Selected"
                  : "Return All Allocations"}
              </h3>
              <button
                onClick={() => setShowRevokeSelectedModal(false)}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm font-semibold text-gray-600 mb-1 bg-red-50 border border-red-100 p-3 rounded-lg">
              This will return{" "}
              <span className="text-red-600">
                {selectedIds.size > 0
                  ? `${selectedIds.size} selected allocation${selectedIds.size > 1 ? "s" : ""}`
                  : `all ${activeAllocations.length} active allocation${activeAllocations.length > 1 ? "s" : ""}`}
              </span>
              . This action cannot be undone.
            </p>
            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Condition at Return <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  value={revokeSelectedCondition}
                  onChange={setRevokeSelectedCondition}
                  options={[...ASSET_CONDITIONS_ARRAY]}
                  placeholder="Select condition..."
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Notes (optional)
                </label>
                <textarea
                  value={revokeSelectedNotes}
                  onChange={(e) => setRevokeSelectedNotes(e.target.value)}
                  placeholder="Additional notes..."
                  maxLength={255}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 text-sm font-normal min-h-20"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowRevokeSelectedModal(false)}
                className="px-6 py-2 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 text-sm font-bold text-gray-700 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleRevokeSelectedConfirm}
                disabled={isProcessingRevoke}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-sm text-sm font-bold transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                <Trash2 className="w-4 h-4" />
                {selectedIds.size > 0
                  ? `Return Selected (${selectedIds.size})`
                  : `Return All (${activeAllocations.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
