'use client';

import {
  Box,
  Edit,
  Check,
  CheckCircle,
  User as UserIcon,
  Wrench,
  Trash2,
  Search,
  MoreVertical,
  Eye,
  Info,
  MapPin,
  Filter,
  ChevronDown,
  Plus,
  X,
  Square,
  CheckSquare,
  AlertTriangle,
} from "lucide-react";
import {
  Asset,
  User as UserType,
  MaintenanceRecord,
  AssetHistory as AssetHistoryType,
  LicenseAllocation,
  getQuantityLabel,
} from '@/types';
import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { UnitDetailModal } from "./UnitDetailModal";
import { useSmartDropdownPosition } from '@/hooks/useSmartDropdownPosition';
import {
  canUpdate as canRoleUpdate,
  canDelete as canRoleDelete,
  canDispose as canRoleDispose,
  canCreate as canRoleCreate,
  type UserRole,
  ASSET_STATUS,
  HIDE_DELETE_UI,
} from '@/config/constants';
import { toast } from "sonner";
import { getAssetStatusIcon } from '@/lib/utils/statusHelpers';
import { formatCurrencyValue } from '@/lib/utils/formatCurrency';
import { getErrorMessage } from '@/lib/utils/errorHelpers';

const UNIT_STATUS_STYLES: Record<
  string,
  { border: string; iconBg: string; badge: string }
> = {
  Available: {
    border: "border-green-100 hover:border-green-300",
    iconBg: "bg-green-100",
    badge: "bg-green-50 text-green-700",
  },
  Allocated: {
    border: "border-blue-100 hover:border-blue-300",
    iconBg: "bg-blue-100",
    badge: "bg-blue-50 text-blue-700",
  },
  "Under Maintenance": {
    border: "border-yellow-100 hover:border-yellow-300",
    iconBg: "bg-yellow-100",
    badge: "bg-yellow-50 text-yellow-700",
  },
  Disposed: {
    border: "border-red-100 hover:border-red-300",
    iconBg: "bg-red-100",
    badge: "bg-red-50 text-red-700",
  },
};

import { DisposalModal } from "./DisposalModal";
import { ConfirmationModal } from "./ConfirmationModal";

interface IndividualUnitsManagementProps {
  individualUnits: Asset[];
  baseAssetCode: string;
  onEdit: (asset: Asset) => void;
  onDelete?: (asset: Asset) => void;
  onHardDelete?: (unit: Asset) => void;
  onSwitchToAllocation: () => void;
  onUpdateUnit?: (unitId: string, updates: Partial<Asset>) => Promise<void>;
  onBulkUpdateUnits?: (
    unitIds: string[],
    updates: Partial<Asset>,
  ) => Promise<void>;
  onBulkDisposeUnits?: (
    unitIds: string[],
    reason: string,
    condition: string,
  ) => Promise<void>;
  onBulkDeleteUnits?: (
    unitIds: string[],
    reason?: string,
    condition?: string,
  ) => Promise<void>;
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
  onAddMaintenance?: (assetId: string) => void;
  onEditMaintenance?: (record: MaintenanceRecord) => void;
  /** Callback to add more units to this bulk parent */
  onAddUnits?: (count: number, unitPrice?: number) => Promise<void>;
  onDispose?: (id: string | number) => void;
  users?: UserType[];
  licenseAllocations?: LicenseAllocation[];
  maintenanceRecords?: MaintenanceRecord[];
  assetHistory?: AssetHistoryType[];
  userRole?: UserRole;
  /** All assets for serial number validation and asset allocation */
  allAssets?: Asset[];
  /** All assets in system — passed to UnitDetailModal for "To Asset" allocation */
  assets?: Asset[];
  /** Parent asset status — used to show disposed state */
  parentAssetStatus?: string;
  /** Callback to navigate to an asset */
  onViewAsset?: (asset: Asset) => void;
  /** Parent asset details for cost calculation */
  purchasePrice?: number | null;
  totalQuantity?: number;
  category?: string;
}

export function IndividualUnitsManagement({
  individualUnits,
  baseAssetCode,
  onEdit,
  onDelete,
  onHardDelete,
  onSwitchToAllocation,
  onUpdateUnit,
  onBulkUpdateUnits,
  onBulkDisposeUnits,
  onBulkDeleteUnits,
  onAllocateUnit,
  onReturnUnit,
  onAddMaintenance,
  onEditMaintenance,
  onAddUnits,
  users = [],
  licenseAllocations = [],
  maintenanceRecords = [],
  assetHistory = [],
  userRole = "Viewer" as UserRole,
  allAssets = [],
  assets = [],
  parentAssetStatus,
  onViewAsset,
  purchasePrice = 0,
  totalQuantity = 1,
  category = "Hardware",
}: IndividualUnitsManagementProps) {
  /* State for filters and search */
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const statusDropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const statusDropdownMenuRef = useRef<HTMLDivElement>(null);
  const { openUpward: openStatusUpward, maxHeight: statusDropdownMaxHeight } =
    useSmartDropdownPosition({
      isOpen: isStatusDropdownOpen,
      anchorRef: statusDropdownTriggerRef,
      menuRef: statusDropdownMenuRef,
      preferredMaxHeight: 240,
    });
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);
  const menuTriggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [selectedUnit, setSelectedUnit] = useState<Asset | null>(null);
  const [selectedUnitMode, setSelectedUnitMode] = useState<
    "view" | "edit" | "allocate" | "return"
  >("view");

  /* Bulk Dispose State */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDisposeModal, setShowBulkDisposeModal] = useState(false);
  const [bulkDisposeReason, setBulkDisposeReason] = useState("");
  const [isBulkDisposing, setIsBulkDisposing] = useState(false);

  /* Bulk Delete State */
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  /* State for Add Units modal */
  const [showAddUnitsModal, setShowAddUnitsModal] = useState(false);
  const [addUnitsCount, setAddUnitsCount] = useState<number>(1);
  const [customUnitPrice, setCustomUnitPrice] = useState<number>(
    (purchasePrice ?? 0) / (totalQuantity || 1),
  );
  const [isAddingUnits, setIsAddingUnits] = useState(false);

  /* Reset customUnitPrice when modal opens or props change */
  useEffect(() => {
    if (showAddUnitsModal) {
      const initialPrice = (purchasePrice ?? 0) / (totalQuantity || 1);
      setCustomUnitPrice(initialPrice);
    }
  }, [showAddUnitsModal, purchasePrice, totalQuantity]);

  // Reset selected unit checkboxes when changing views/parent asset or unmounting
  useEffect(() => {
    setSelectedIds(new Set());
    return () => {
      setSelectedIds(new Set());
    };
  }, [baseAssetCode]);

  // Sync selectedUnit when individualUnits updates (e.g., after an allocation or return)
  useEffect(() => {
    if (selectedUnit) {
      const updatedUnit = individualUnits.find(
        (u) => String(u.id) === String(selectedUnit.id)
      );
      if (updatedUnit && JSON.stringify(updatedUnit) !== JSON.stringify(selectedUnit)) {
        setSelectedUnit(updatedUnit);
      }
    }
  }, [individualUnits, selectedUnit]);

  /* Filter Logic - Memoized */
  const activeAllocationsByUnitId = useMemo(() => {
    const map = new Map<string, LicenseAllocation>();
    for (const allocation of licenseAllocations) {
      if (allocation.status !== "Active") continue;
      const key = String(allocation.assetId);
      if (!map.has(key)) map.set(key, allocation);
    }
    return map;
  }, [licenseAllocations]);

  const filteredUnits = useMemo(() => {
    return individualUnits
      .filter((unit) => {
        const matchesStatus =
          statusFilter === "all" || unit.status === statusFilter;
        const searchLower = searchTerm.toLowerCase();
        const activeAllocation = activeAllocationsByUnitId.get(String(unit.id));
        const matchesSearch =
          unit.assetCode.toLowerCase().includes(searchLower) ||
          (activeAllocation?.userName || "")
            .toLowerCase()
            .includes(searchLower) ||
          (activeAllocation?.employeeId || "")
            .toLowerCase()
            .includes(searchLower) ||
          (activeAllocation?.parentAssetName || "")
            .toLowerCase()
            .includes(searchLower) ||
          String(activeAllocation?.parentAssetId || "")
            .toLowerCase()
            .includes(searchLower) ||
          (
            activeAllocation?.installationLocation ||
            unit.installationLocation ||
            ""
          )
            .toLowerCase()
            .includes(searchLower);

        return matchesStatus && matchesSearch;
      })
      .sort((a, b) => {
        const numDiff = (a.unitNumber || 0) - (b.unitNumber || 0);
        if (numDiff !== 0) return numDiff;
        return (a.assetCode || "").localeCompare(b.assetCode || "", undefined, {
          numeric: true,
        });
      });
  }, [individualUnits, statusFilter, searchTerm, activeAllocationsByUnitId]);

  /* Status Statistics - Memoized */
  const statusStats = useMemo(
    () => ({
      available: individualUnits.filter(
        (u) => u.status === ASSET_STATUS.AVAILABLE,
      ).length,
      allocated: individualUnits.filter(
        (u) => u.status === ASSET_STATUS.ALLOCATED,
      ).length,
      maintenance: individualUnits.filter(
        (u) => u.status === ASSET_STATUS.UNDER_MAINTENANCE,
      ).length,
      disposed: individualUnits.filter(
        (u) => u.status === ASSET_STATUS.DISPOSED,
      ).length,
    }),
    [individualUnits],
  );

  const receivedAllocationsByUnit = useMemo(() => {
    const map = new Map<string, LicenseAllocation[]>();
    for (const alloc of licenseAllocations) {
      if (!alloc.parentAssetId) continue;
      if (alloc.status !== "Active") continue;
      const key = String(alloc.parentAssetId);
      const existing = map.get(key);
      if (existing) {
        existing.push(alloc);
      } else {
        map.set(key, [alloc]);
      }
    }
    return map;
  }, [licenseAllocations]);

  // Total non-disposed units (shown in tab badge and header)
  const totalNonDisposedCount = individualUnits.length - statusStats.disposed;
  // Active unit count excludes disposed and under-maintenance units
  const activeUnitCount =
    individualUnits.length - statusStats.disposed - statusStats.maintenance;

  const getStatusIcon = useCallback(
    (status: string) => getAssetStatusIcon(status, "sm"),
    [],
  );

  const handleMenuToggle = useCallback(
    (unitId: string, triggerEl?: HTMLButtonElement | null) => {
      if (openMenuId === unitId) {
        setOpenMenuId(null);
        return;
      }
      // Compute fixed position from trigger button
      const el = triggerEl || menuTriggerRefs.current.get(unitId);
      if (el) {
        const rect = el.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const menuW = 160;
        const r = Math.max(
          8,
          Math.min(
            window.innerWidth - rect.right,
            window.innerWidth - menuW - 8,
          ),
        );
        setMenuPos(
          spaceBelow < 200
            ? { bottom: window.innerHeight - rect.top + 5, right: r }
            : { top: rect.bottom + 5, right: r },
        );
      }
      setOpenMenuId(unitId);
    },
    [openMenuId],
  );

  const handleUnitSelect = useCallback((unit: Asset) => {
    setSelectedUnitMode("view");
    setSelectedUnit(unit);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedUnit(null);
    setSelectedUnitMode("view");
  }, []);

  const handleEditUnit = useCallback((unit: Asset) => {
    setSelectedUnitMode("edit");
    setSelectedUnit(unit);
    setOpenMenuId(null);
  }, []);

  const handleViewUnit = useCallback((unit: Asset) => {
    setSelectedUnitMode("view");
    setSelectedUnit(unit);
    setOpenMenuId(null);
  }, []);

  const handleStatusFilterChange = useCallback((value: string) => {
    setStatusFilter(value);
    setIsStatusDropdownOpen(false);
  }, []);

  const handleAddUnits = useCallback(async () => {
    if (!onAddUnits || addUnitsCount < 1) return;
    setIsAddingUnits(true);
    try {
      await onAddUnits(addUnitsCount, customUnitPrice);
      toast.success(`Successfully added ${addUnitsCount} new unit(s)`);
      setShowAddUnitsModal(false);
      setAddUnitsCount(1);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsAddingUnits(false);
    }
  }, [onAddUnits, addUnitsCount, customUnitPrice]);

  const toggleSelection = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDispose = async (reason: string, condition?: string) => {
    if (
      (!onUpdateUnit && !onBulkUpdateUnits && !onBulkDisposeUnits) ||
      selectedIds.size === 0
    )
      return;
    setIsBulkDisposing(true);
    try {
      const idsArray = Array.from(selectedIds);

      if (onBulkDisposeUnits) {
        await onBulkDisposeUnits(idsArray, reason, condition || "POOR");
      } else {
        const updates = {
          status: ASSET_STATUS.DISPOSED,
          disposalReason: reason,
          disposalDate: new Date().toISOString(),
          condition: condition || "POOR",
        };

        if (onBulkUpdateUnits) {
          await onBulkUpdateUnits(idsArray, updates);
        } else if (onUpdateUnit) {
          for (const unitId of idsArray) {
            await onUpdateUnit(unitId, updates);
          }
        }
      }

      toast.success(`Successfully disposed ${selectedIds.size} unit(s)`);
      setShowBulkDisposeModal(false);
      setSelectedIds(new Set());
      setBulkDisposeReason("");
    } catch (error) {
      toast.error(getErrorMessage(error) || "Failed to dispose some units");
    } finally {
      setIsBulkDisposing(false);
    }
  };

  const handleBulkDelete = async (reason?: string, condition?: string) => {
    if (!onBulkDeleteUnits || selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    try {
      const idsArray = Array.from(selectedIds);
      await onBulkDeleteUnits(idsArray, reason, condition);
      toast.success(`Successfully deleted ${selectedIds.size} unit(s)`);
      setShowBulkDeleteModal(false);
      setSelectedIds(new Set());
    } catch (error) {
      toast.error(getErrorMessage(error) || "Failed to delete some units");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const statusOptions = useMemo(
    () => [
      {
        value: "all",
        label: "All Statuses",
        color: "gray",
        activeClass: "bg-gray-50 text-gray-700",
        dotClass: "bg-gray-400",
      },
      {
        value: ASSET_STATUS.AVAILABLE,
        label: userRole === "Viewer" ? "Return" : "Available",
        color: "green",
        activeClass: "bg-green-50 text-green-700",
        dotClass: "bg-green-500",
      },
      {
        value: ASSET_STATUS.ALLOCATED,
        label: "Allocated",
        color: "blue",
        activeClass: "bg-blue-50 text-blue-700",
        dotClass: "bg-blue-500",
      },
      {
        value: ASSET_STATUS.UNDER_MAINTENANCE,
        label: "Maintenance",
        color: "yellow",
        activeClass: "bg-yellow-50 text-yellow-700",
        dotClass: "bg-yellow-500",
      },
      {
        value: ASSET_STATUS.LICENSE_EXPIRED,
        label: "License Expired",
        color: "red",
        activeClass: "bg-red-50 text-red-700",
        dotClass: "bg-red-500",
      },
      {
        value: ASSET_STATUS.DISPOSED,
        label: "Disposed",
        color: "red",
        activeClass: "bg-red-50 text-red-700",
        dotClass: "bg-red-500",
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gray-50/50 rounded-xl p-3 border border-gray-100">
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm sm:text-base font-bold text-gray-900 truncate">
              Individual Units Management
            </h3>
            <p className="text-[10px] sm:text-xs text-gray-500 truncate">
              {parentAssetStatus === ASSET_STATUS.DISPOSED
                ? `Decommissioned bulk parent with ${individualUnits.length} children`
                : `Managing ${totalNonDisposedCount} units for ${baseAssetCode}`}
            </p>
          </div>

          <div className="flex flex-row items-center gap-3 shrink-0">
            {/* Active Units Metric Stack */}
            <div
              className={`px-3 py-1.5 rounded-lg border flex flex-col items-center justify-center min-w-[70px] ${parentAssetStatus === ASSET_STATUS.DISPOSED
                ? "bg-gray-100 border-gray-200"
                : "bg-blue-50 border-blue-100"
                }`}>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${parentAssetStatus === ASSET_STATUS.DISPOSED
                  ? "text-gray-500"
                  : "text-blue-600"
                  }`}>
                {parentAssetStatus === ASSET_STATUS.DISPOSED
                  ? "Total"
                  : "Active"}
              </span>
              <span
                className={`text-base sm:text-xl font-black leading-none mt-1 ${parentAssetStatus === ASSET_STATUS.DISPOSED
                  ? "text-gray-600"
                  : "text-blue-700"
                  }`}>
                {parentAssetStatus === ASSET_STATUS.DISPOSED
                  ? individualUnits.length
                  : activeUnitCount}
                {!(parentAssetStatus === ASSET_STATUS.DISPOSED) &&
                  (statusStats.disposed > 0 || statusStats.maintenance > 0) && (
                    <span className="text-gray-400 text-xs sm:text-sm font-semibold ml-0.5">
                      /{totalNonDisposedCount}
                    </span>
                  )}
              </span>
            </div>

            {/* Add Units Button */}
            {onAddUnits &&
              canRoleCreate(userRole) &&
              parentAssetStatus !== ASSET_STATUS.DISPOSED && (
                <button
                  onClick={() => setShowAddUnitsModal(true)}
                  className="flex items-center justify-center gap-1.5 p-2 sm:px-4 sm:py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md text-xs font-bold whitespace-nowrap min-w-[36px] sm:min-w-0">
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Add Units</span>
                </button>
              )}
          </div>
        </div>
      </div>

      {/* Controls: Search & Filter */}
      <div className="bg-white rounded-lg shadow-sm p-2 sm:p-3">
        <div className="flex flex-row items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search units..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 h-9 sm:h-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm text-sm"
            />
          </div>
          <div className="relative">
            <button
              ref={statusDropdownTriggerRef}
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              className="flex items-center justify-center gap-2 px-3 h-9 sm:h-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all shadow-sm font-medium text-gray-700 text-sm whitespace-nowrap">
              <Filter className="w-4 h-4 text-gray-500 sm:hidden" />
              <span className="hidden sm:inline">
                {statusOptions.find((o) => o.value === statusFilter)?.label ||
                  "All Statuses"}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 hidden sm:block transition-transform ${isStatusDropdownOpen ? "rotate-180" : ""}`}
              />
            </button>

            <AnimatePresence>
              {isStatusDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsStatusDropdownOpen(false)}
                  />
                  <motion.div
                    ref={statusDropdownMenuRef}
                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                    className={`absolute right-0 w-48 bg-white rounded-xl shadow-xl overflow-hidden z-20 overflow-y-auto ${openStatusUpward ? "bottom-full mb-1" : "top-full mt-1"
                      }`}
                    style={{
                      maxHeight: `${statusDropdownMaxHeight}px`,
                      boxShadow:
                        "0 10px 30px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
                    }}>
                    <div className="py-1">
                      {statusOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => handleStatusFilterChange(option.value)}
                          className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium transition-all duration-150 ${statusFilter === option.value
                            ? option.activeClass
                            : "text-gray-700 hover:bg-gray-50"
                            }`}>
                          <div
                            className={`w-2 h-2 rounded-full ${option.dotClass}`}
                          />
                          <span>{option.label}</span>
                          {statusFilter === option.value && (
                            <div className="ml-auto bg-blue-600 rounded-full p-0.5">
                              <Check className="w-2.5 h-2.5 text-white" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 &&
          (() => {
            const selectedUnits = filteredUnits.filter((u) =>
              selectedIds.has(String(u.id)),
            );
            const canBulkDelete =
              canRoleDelete(userRole) &&
              !!onBulkDeleteUnits &&
              selectedUnits.length > 0 &&
              selectedUnits.every((unit) => {
                const isInitial =
                  !(maintenanceRecords || []).some(
                    (m) => String(m.assetId) === String(unit.id),
                  ) &&
                  !(licenseAllocations || []).some(
                    (a) =>
                      String(a.assetId) === String(unit.id) ||
                      String(a.parentAssetId) === String(unit.id),
                  ) &&
                  !(assetHistory || []).some(
                    (h) =>
                      String(h.assetId) === String(unit.id) &&
                      h.actionType !== "CREATION",
                  );
                return isInitial || !HIDE_DELETE_UI;
              });

            return (
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                className="fixed bottom-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
                <div className="bg-white border-2 border-blue-500 rounded-2xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xl pointer-events-auto w-full max-w-2xl">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-xl shrink-0">
                      <CheckSquare className="w-5 h-5 text-blue-700" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {selectedIds.size} unit
                        {selectedIds.size !== 1 ? "s" : ""} selected
                      </p>
                      <p className="text-xs text-gray-500 font-medium">
                        {canBulkDelete
                          ? "Ready for bulk disposal or deletion"
                          : "Ready for bulk disposal"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="px-4 py-2 text-sm font-bold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors flex-1 sm:flex-none">
                      Cancel
                    </button>
                    {canBulkDelete && (
                      <button
                        onClick={() => setShowBulkDeleteModal(true)}
                        className="px-4 py-2 text-sm font-bold text-red-700 bg-red-50 rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center gap-2 flex-1 sm:flex-none border border-red-200 shadow-sm hover:shadow">
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    )}
                    <button
                      onClick={() => setShowBulkDisposeModal(true)}
                      className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2 flex-1 sm:flex-none shadow-md hover:shadow-lg">
                      <Trash2 className="w-4 h-4" />
                      Dispose
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })()}
      </AnimatePresence>

      {/* Card List */}
      <div className="flex flex-col gap-2">
        {filteredUnits.length > 0 ? (
          filteredUnits.map((unit) => {
            const activeAllocation = activeAllocationsByUnitId.get(
              String(unit.id),
            );
            const allocationLocation =
              activeAllocation?.installationLocation ||
              unit.installationLocation;
            const receivedAllocations =
              receivedAllocationsByUnit.get(String(unit.id)) || [];
            const receivedCount = receivedAllocations.length;
            const receivedPreview = receivedAllocations.slice(0, 2);
            const receivedLabel = receivedPreview
              .map((alloc) => alloc.assetCode || alloc.assetName || "Asset")
              .join(", ");
            const receivedPrefix =
              receivedCount > 1 ? `Received (${receivedCount}):` : "Received:";

            const isDisposed = unit.status === ASSET_STATUS.DISPOSED;
            const hasActiveAllocation = !!activeAllocation;
            const isUnderMaintenance =
              unit.status === ASSET_STATUS.UNDER_MAINTENANCE;
            const hasReceivedAllocations = receivedAllocations.length > 0;
            const canSelect =
              !isDisposed &&
              !hasActiveAllocation &&
              !isUnderMaintenance &&
              !hasReceivedAllocations &&
              canRoleDispose(userRole);

            return (
              <div
                key={unit.id}
                onClick={(e) => {
                  if (openMenuId === unit.id) return;
                  handleUnitSelect(unit);
                }}
                className={`bg-white rounded-lg shadow-sm border transition-all group relative cursor-pointer ${UNIT_STATUS_STYLES[unit.status]?.border ?? "border-red-100 hover:border-red-300"} ${openMenuId === unit.id ? "z-30 ring-1 ring-blue-400" : "z-0"} ${selectedIds.has(String(unit.id)) ? "ring-2 ring-blue-500 border-blue-500 bg-blue-50/10" : ""}`}>
                <div className="p-3">
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    {canRoleDispose(userRole) && (
                      <div
                        className="shrink-0 flex items-center justify-center pt-1"
                        onClick={(e) =>
                          canSelect
                            ? toggleSelection(e, String(unit.id))
                            : e.stopPropagation()
                        }>
                        <button
                          type="button"
                          disabled={!canSelect}
                          className={`transition-colors ${!canSelect ? "opacity-30 cursor-not-allowed" : "hover:text-blue-600 cursor-pointer"}`}
                          title={
                            !canSelect
                              ? "Cannot select allocated, maintenance, disposed units, or units with dependent assets"
                              : "Select unit"
                          }>
                          {selectedIds.has(String(unit.id)) ? (
                            <CheckSquare className="w-5 h-5 text-blue-600" />
                          ) : (
                            <Square className="w-5 h-5 text-gray-300" />
                          )}
                        </button>
                      </div>
                    )}

                    {/* Left: Status Icon & Main Info */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Status Icon */}
                      <div
                        className={`shrink-0 p-2 rounded-lg ${UNIT_STATUS_STYLES[unit.status]?.iconBg ?? "bg-red-100"}`}>
                        {getStatusIcon(unit.status)}
                      </div>

                      {/* Main Content */}
                      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                        {/* Asset Code + Name + Status */}
                        <div className="min-w-0 sm:min-w-35">
                          <h3 className="font-bold text-gray-900 text-sm truncate">
                            {unit.assetName || unit.assetCode}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="mobile-micro text-[11px] text-gray-400 font-mono truncate">
                              {unit.assetCode}
                            </span>
                            <span className="text-gray-300">•</span>
                            <span
                              className={`mobile-micro px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full ${UNIT_STATUS_STYLES[unit.status]?.badge ?? "bg-red-50 text-red-700"}`}>
                              {unit.status === "Available" &&
                                userRole === "Viewer"
                                ? "Return"
                                : unit.status}
                            </span>
                          </div>
                        </div>

                        {/* Assignment Info */}
                        <div className="flex-1 min-w-0">
                          {unit.status === ASSET_STATUS.DISPOSED ? (
                            <span className="text-sm font-medium text-red-600">
                              Decommissioned
                            </span>
                          ) : activeAllocation?.employeeId ||
                            activeAllocation?.userName ? (
                            <div>
                              <span className="mobile-micro text-[10px] font-bold text-blue-500 uppercase tracking-wider">
                                Allocated To (User)
                              </span>
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                <span className="text-sm font-semibold text-gray-900 truncate">
                                  {activeAllocation?.userName || "Unknown User"}
                                </span>
                                <span className="mobile-xs text-xs text-gray-400">
                                  •
                                </span>
                                <span className="mobile-xs text-xs text-gray-600 font-medium">
                                  {activeAllocation?.employeeId || "N/A"}
                                </span>
                              </div>
                            </div>
                          ) : activeAllocation?.parentAssetId ||
                            activeAllocation?.parentAssetName ? (
                            <div>
                              <span className="mobile-micro text-[10px] font-bold text-indigo-500 uppercase tracking-wider">
                                Allocated To (Asset)
                              </span>
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                <span className="text-sm font-semibold text-purple-900 truncate">
                                  {activeAllocation?.parentAssetName ||
                                    "Parent Asset"}
                                </span>
                              </div>
                            </div>
                          ) : activeAllocation?.installationLocation &&
                            !activeAllocation?.employeeId &&
                            !activeAllocation?.parentAssetId ? (
                            <div>
                              <span className="mobile-micro text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
                                Allocated To (Location)
                              </span>
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                <span className="text-sm font-semibold text-gray-900 truncate">
                                  {activeAllocation.installationLocation}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                              <span className="text-sm text-gray-400 italic truncate">
                                Unassigned
                              </span>
                            </div>
                          )}
                          {/* Location — skip if already shown as primary target */}
                          {allocationLocation && !(
                            activeAllocation?.installationLocation &&
                            !activeAllocation?.employeeId &&
                            !activeAllocation?.parentAssetId
                          ) && (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <MapPin className="w-3 h-3 text-gray-400" />
                                <span className="mobile-xs text-xs text-gray-500 font-medium truncate">
                                  {allocationLocation}
                                </span>
                              </div>
                            )}
                          {/* IP Address from active allocation */}
                          {activeAllocation?.ipAddress && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="mobile-xs text-xs text-gray-500 font-mono truncate">
                                IP: {activeAllocation.ipAddress}
                              </span>
                            </div>
                          )}
                          {receivedAllocations.length > 0 && (
                            <div className="mt-0.5 sm:hidden text-[8px] text-purple-600 font-medium truncate max-w-52">
                              <span className="uppercase tracking-wider font-bold text-[7px] mr-1">
                                {receivedPrefix}
                              </span>
                              <span className="text-gray-700">
                                {receivedLabel}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Metadata Badges (Hidden on very small screens if needed, but useful) */}
                        <div className="flex flex-col items-end gap-1 min-w-0 max-w-44">
                          {receivedAllocations.length > 0 && (
                            <div className="hidden sm:block text-[8px] text-purple-600 font-medium truncate max-w-44 text-right">
                              <span className="uppercase tracking-wider font-bold text-[7px] mr-1">
                                {receivedPrefix}
                              </span>
                              <span className="text-gray-700">
                                {receivedLabel}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 flex-wrap justify-end min-w-0">
                            {unit.category && (
                              <div className="mobile-xs hidden sm:block px-2 py-0.5 bg-gray-50 border border-gray-200 rounded text-xs text-gray-500 truncate max-w-20">
                                {unit.category}
                              </div>
                            )}
                            {unit.assetType && (
                              <div className="mobile-xs hidden sm:block px-2 py-0.5 bg-gray-50 border border-gray-200 rounded text-xs text-gray-500 truncate max-w-20">
                                {unit.assetType}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions Menu */}
                    <div
                      className="shrink-0 relative"
                      onClick={(e) => e.stopPropagation()}>
                      <button
                        ref={(el) => {
                          if (el)
                            menuTriggerRefs.current.set(String(unit.id), el);
                        }}
                        onClick={() => handleMenuToggle(String(unit.id))}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all">
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      <AnimatePresence>
                        {openMenuId === String(unit.id) && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(null);
                              }}
                            />
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -5 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -5 }}
                              className="fixed w-48 bg-white rounded-lg shadow-xl overflow-hidden z-50 origin-top-right"
                              style={{
                                top: menuPos?.top,
                                bottom: menuPos?.bottom,
                                right: menuPos?.right,
                              }}>
                              <button
                                onClick={() => handleViewUnit(unit)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors no-push">
                                <Eye className="w-3.5 h-3.5" />
                                View Details
                              </button>
                              {canRoleUpdate(userRole) && (
                                <button
                                  onClick={() => {
                                    if (unit.status !== "Disposed") {
                                      handleEditUnit(unit);
                                    }
                                  }}
                                  disabled={unit.status === "Disposed"}
                                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors no-push border-t border-gray-100 ${unit.status === "Disposed"
                                    ? "text-gray-400 cursor-not-allowed bg-gray-50"
                                    : "text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                                    }`}>
                                  <Edit className="w-3.5 h-3.5" />
                                  <span>Edit Unit</span>
                                  {unit.status === "Disposed" && (
                                    <span className="ml-auto text-[10px] text-gray-400">
                                      Blocked
                                    </span>
                                  )}
                                </button>
                              )}
                              {canRoleDispose(userRole) &&
                                (() => {
                                  const isDisposed = unit.status === "Disposed";
                                  const hasActiveAllocation =
                                    !!activeAllocation;
                                  const isUnderMaintenance =
                                    unit.status === "Under Maintenance";
                                  const hasReceivedAllocations =
                                    receivedAllocations.length > 0;

                                  const isDeleteBlocked =
                                    isDisposed ||
                                    hasActiveAllocation ||
                                    isUnderMaintenance ||
                                    hasReceivedAllocations;
                                  const isDisposeBlocked =
                                    isDisposed ||
                                    hasActiveAllocation ||
                                    hasReceivedAllocations;

                                  const isInitial =
                                    !(maintenanceRecords || []).some(
                                      (m) =>
                                        String(m.assetId) === String(unit.id),
                                    ) &&
                                    !(licenseAllocations || []).some(
                                      (a) =>
                                        String(a.assetId) === String(unit.id) ||
                                        String(a.parentAssetId) ===
                                        String(unit.id),
                                    ) &&
                                    !(assetHistory || []).some(
                                      (h) =>
                                        String(h.assetId) === String(unit.id) &&
                                        h.actionType !== "CREATION",
                                    );

                                  const showDelete =
                                    canRoleDelete(userRole) &&
                                    (isInitial || !HIDE_DELETE_UI);
                                  const showDispose =
                                    canRoleDispose(userRole) &&
                                    (!isInitial || !HIDE_DELETE_UI);

                                  return (
                                    <>
                                      {showDelete && onHardDelete && (
                                        <button
                                          onClick={() => {
                                            onHardDelete(unit);
                                            setOpenMenuId(null);
                                          }}
                                          disabled={isDeleteBlocked}
                                          className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors no-push border-t border-gray-100 ${isDeleteBlocked
                                            ? "text-gray-400 cursor-not-allowed bg-gray-50"
                                            : "text-red-600 hover:bg-red-50 hover:text-red-700"
                                            }`}
                                          title={
                                            isDeleteBlocked
                                              ? "Disposed, allocated, or maintenance units cannot be deleted."
                                              : ""
                                          }>
                                          <Trash2 className="w-3.5 h-3.5" />
                                          <span>Delete Unit</span>
                                          {isDeleteBlocked && (
                                            <span className="ml-auto text-[10px] text-gray-400">
                                              Blocked
                                            </span>
                                          )}
                                        </button>
                                      )}
                                      {showDispose && onDelete && (
                                        <button
                                          onClick={() => {
                                            onDelete(unit);
                                            setOpenMenuId(null);
                                          }}
                                          disabled={isDisposeBlocked}
                                          className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors no-push border-t border-gray-100 ${isDisposeBlocked
                                            ? "text-gray-400 cursor-not-allowed bg-gray-50"
                                            : "text-red-600 hover:bg-red-50 hover:text-red-700"
                                            }`}
                                          title={
                                            isDisposed
                                              ? "Unit is already disposed."
                                              : isDisposeBlocked
                                                ? "Allocated units must be returned before disposing."
                                                : ""
                                          }>
                                          <Trash2 className="w-3.5 h-3.5" />
                                          <span>Dispose Unit</span>
                                          {isDisposeBlocked && (
                                            <span className="ml-auto text-[10px] text-gray-400">
                                              Blocked
                                            </span>
                                          )}
                                        </button>
                                      )}
                                    </>
                                  );
                                })()}
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-white rounded-xl shadow-sm border-2 border-dashed border-gray-200 p-8 text-center">
            <Box className="w-10 h-10 mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-medium text-gray-500 mb-1">
              No units found
            </p>
            <p className="mobile-xs text-xs text-gray-400">
              Try adjusting your search or filter criteria.
            </p>
          </div>
        )}
      </div>

      {/* Unit Detail Modal */}
      <AnimatePresence>
        {selectedUnit && (
          <UnitDetailModal
            unit={selectedUnit}
            onClose={handleCloseModal}
            onEdit={onEdit}
            onUpdateUnit={
              onUpdateUnit
                ? async (unitId, updates) => {
                  await onUpdateUnit(unitId, updates);
                  // Immediately reflect changes in the open modal without requiring close/reopen
                  setSelectedUnit((prev) =>
                    prev ? { ...prev, ...updates } : prev,
                  );
                }
                : undefined
            }
            onAllocateUnit={onAllocateUnit}
            onReturnUnit={onReturnUnit}
            onAddMaintenance={onAddMaintenance}
            onEditMaintenance={onEditMaintenance}
            users={users}
            licenseAllocations={licenseAllocations}
            maintenanceRecords={maintenanceRecords}
            assetHistory={assetHistory}
            userRole={userRole}
            allAssets={allAssets}
            assets={assets}
            initialMode={selectedUnitMode}
            onViewAsset={onViewAsset}
            onDispose={() => {
              if (onDelete) onDelete(selectedUnit);
              handleCloseModal();
            }}
            onDelete={() => {
              if (onHardDelete) onHardDelete(selectedUnit);
              handleCloseModal();
            }}
          />
        )}
      </AnimatePresence>

      {/* Bulk Dispose Modal */}
      <DisposalModal
        isOpen={showBulkDisposeModal}
        onClose={() => setShowBulkDisposeModal(false)}
        onConfirm={handleBulkDispose}
        asset={{ id: -1 } as unknown as Asset}
        warnings={[
          `Confirming disposal will permanently dispose of the ${selectedIds.size} selected units. This action cannot be undone.`,
        ]}
        isConfirmDisabled={isBulkDisposing}
        confirmDisabledTooltip={
          isBulkDisposing ? "Disposing units..." : undefined
        }
      />

      <ConfirmationModal
        isOpen={showBulkDeleteModal}
        onClose={() => setShowBulkDeleteModal(false)}
        onConfirm={(reason, condition) => handleBulkDelete(reason, condition)}
        title="Delete Selected Units"
        message={
          HIDE_DELETE_UI
            ? `Are you sure you want to permanently delete the ${selectedIds.size} selected units? This is only allowed for assets with no prior history and cannot be undone.`
            : `Are you sure you want to permanently delete the ${selectedIds.size} selected units? This action cannot be undone.`
        }
        confirmText={isBulkDeleting ? "Deleting..." : "Confirm Deletion"}
        confirmColor="bg-red-600 hover:bg-red-700"
        requireReason={true}
        showCondition={true}
      />

      {/* Add Units Modal */}
      <AnimatePresence>
        {showAddUnitsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4"
            onClick={() => !isAddingUnits && setShowAddUnitsModal(false)}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl max-w-md w-full p-4 sm:p-6"
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">
                  Add More Units
                </h3>
                <button
                  onClick={() => !isAddingUnits && setShowAddUnitsModal(false)}
                  disabled={isAddingUnits}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Add new individual units to this bulk order. New units will be
                created with sequential unit numbers.
              </p>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Units to Add
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={addUnitsCount}
                  onChange={(e) =>
                    setAddUnitsCount(
                      Math.max(1, Math.min(100, parseInt(e.target.value) || 1)),
                    )
                  }
                  disabled={isAddingUnits}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter a value between 1 and 100
                </p>
              </div>

              {/* Cost Summary Section */}
              {(purchasePrice ?? 0) > 0 && (
                <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 bg-blue-100 rounded-lg">
                      <Info className="w-4 h-4 text-blue-600" />
                    </div>
                    <span className="text-sm font-bold text-blue-900">
                      Cost Details
                    </span>
                  </div>
                  <div className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-bold text-blue-500 uppercase tracking-wider">
                        Cost per {getQuantityLabel(category, true)} (₹)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 font-bold text-sm">
                          ₹
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={Math.round(customUnitPrice)}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setCustomUnitPrice(isNaN(val) ? 0 : val);
                          }}
                          className="w-full h-10 pl-7 pr-3 bg-white border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-bold text-blue-900 transition-all"
                        />
                      </div>
                      <p className="text-[10px] text-blue-400">
                        Defaulted to parent unit cost. Edit if price has
                        changed.
                      </p>
                    </div>

                    <div className="h-px bg-blue-200/50" />

                    <div className="flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-sm text-blue-700 font-bold">
                          Total Additional Cost
                        </span>
                        <span className="text-[10px] text-blue-400">
                          For {addUnitsCount}{" "}
                          {getQuantityLabel(category, addUnitsCount === 1)}
                        </span>
                      </div>
                      <span className="text-lg font-black text-blue-900">
                        ₹{formatCurrencyValue(customUnitPrice * addUnitsCount)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowAddUnitsModal(false)}
                  disabled={isAddingUnits}
                  className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
                  Cancel
                </button>
                <button
                  onClick={handleAddUnits}
                  disabled={isAddingUnits || addUnitsCount < 1}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                  {isAddingUnits ? (
                    <>
                      <div className="w-4 h-4 border-2 border-gray-200 border-t-transparent rounded-full animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Add {addUnitsCount} Unit{addUnitsCount !== 1 ? "s" : ""}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 pt-2">
        <div className="bg-green-50 p-2 sm:p-3 rounded-lg border border-green-200">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="p-1 sm:p-1.5 bg-green-500 rounded-md">
              <CheckCircle className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="mobile-micro text-[9px] sm:text-[10px] text-green-600 font-semibold uppercase">
                {userRole === "Viewer"
                  ? "Return Assets"
                  : "Ready for Allotment"}
              </p>
              <p className="text-sm sm:text-lg font-bold text-green-900 leading-none">
                {statusStats.available}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 p-2 sm:p-3 rounded-lg border border-blue-200">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="p-1 sm:p-1.5 bg-blue-500 rounded-md">
              <UserIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="mobile-micro text-[9px] sm:text-[10px] text-blue-600 font-semibold uppercase">
                Active Assignments
              </p>
              <p className="text-sm sm:text-lg font-bold text-blue-900 leading-none">
                {statusStats.allocated}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-yellow-50 p-2 sm:p-3 rounded-lg border border-yellow-200">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="p-1 sm:p-1.5 bg-yellow-500 rounded-md">
              <Wrench className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[9px] sm:text-[10px] text-yellow-600 font-semibold uppercase">
                Maintenance Queue
              </p>
              <p className="text-sm sm:text-lg font-bold text-yellow-900 leading-none">
                {statusStats.maintenance}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-red-50 p-2 sm:p-3 rounded-lg border border-red-200">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="p-1 sm:p-1.5 bg-red-500 rounded-md">
              <Trash2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[9px] sm:text-[10px] text-red-600 font-semibold uppercase">
                Decommissioned Assets
              </p>
              <p className="text-sm sm:text-lg font-bold text-red-900 leading-none">
                {statusStats.disposed}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
