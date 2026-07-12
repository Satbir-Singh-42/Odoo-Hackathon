'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Search,
  Filter,
  ChevronDown,
  X,
  Check,
  Download,
  Package,
  ExternalLink,
  Plus,
  History,
} from "lucide-react";
import type {
  Asset,
  User,
  Vendor,
  LicenseAllocation,
  AssetHistory as AssetHistoryType,
  MaintenanceRecord,
} from '@/types';
import {
  getAllocatedQuantity,
  getTotalQuantity,
  getQuantityLabel,
} from '@/types';
import {
  ASSET_STATUS,
  ASSET_CONDITIONS_ARRAY,
  ALLOCATION_STATUS_DISPLAY,
  hasPermission,
  PERMISSIONS,
  isSoftwareLikeCategory,
  RECORDS_PER_PAGE,
  type UserRole,
} from '@/config/constants';
import { Pagination } from '@/components/ui/pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useDebounce } from '@/hooks/useDebounce';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSmartDropdownPosition } from '@/hooks/useSmartDropdownPosition';
import { motion, AnimatePresence } from "framer-motion";
import { openDataView } from '@/lib/utils/dataViewHelpers';
import { generateAllocationsExport } from '@/lib/utils/exportHelpers';
import { AssetAllotmentForm } from "./AssetAllotmentForm";
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  getAllocationDisplay,
  STATUS_DOT_HL,
} from '@/lib/utils/assetDisplayHelpers';
import { AssetHistory } from "./AssetHistory";

// =============================================
// TYPES
// =============================================
interface AllocationsPageProps {
  allocations: LicenseAllocation[];
  assets: Asset[];
  users: User[];
  vendors: Vendor[];
  assetHistory?: AssetHistoryType[];
  maintenanceRecords?: MaintenanceRecord[];
  onViewAsset?: (asset: Asset) => void;
  onAllocate?: (
    assetId: string,
    data: Array<{
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
  ) => Promise<void>;
  onRevoke?: (
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
  ) => Promise<void> | void;
  userRole?: UserRole;
  currentUser?: Pick<User, "employeeId" | "userName"> & { role?: string; managedCategories?: string[] };
}

// =============================================
// HELPERS
// =============================================

const CONDITION_DOT: Record<string, string> = {
  all: "bg-gray-400",
  EXCELLENT: "bg-green-500",
  GOOD: "bg-blue-500",
  FAIR: "bg-amber-500",
  POOR: "bg-red-500",
};

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses", dot: STATUS_DOT_HL.all.dot },
  {
    value: ASSET_STATUS.AVAILABLE,
    label: "Available",
    dot: STATUS_DOT_HL.Available.dot,
  },
  {
    value: ASSET_STATUS.ALLOCATED,
    label: "Allocated",
    dot: STATUS_DOT_HL.Allocated.dot,
  },
  {
    value: ASSET_STATUS.PARTIALLY_ALLOCATED,
    label: "Partially Allocated",
    dot: STATUS_DOT_HL["Partially Allocated"].dot,
  },
  {
    value: ASSET_STATUS.UNDER_MAINTENANCE,
    label: "Under Maintenance",
    dot: STATUS_DOT_HL["Under Maintenance"].dot,
  },
  {
    value: ASSET_STATUS.LICENSE_EXPIRED,
    label: "License Expired",
    dot: STATUS_DOT_HL["License Expired"].dot,
  },
  {
    value: ASSET_STATUS.DISPOSED,
    label: "Disposed",
    dot: STATUS_DOT_HL.Disposed.dot,
  },
];

const noopRevoke = () => { };

// =============================================
// FILTER DROPDOWN (reusable)
// =============================================
function FilterDropdown({
  id,
  label,
  value,
  options,
  activeDropdown,
  setActiveDropdown,
  onChange,
  dot,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string; dot?: string }[];
  activeDropdown: string | null;
  setActiveDropdown: (v: string | null) => void;
  onChange: (v: string) => void;
  dot?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOpen = activeDropdown === id;
  const selected = options.find((o) => o.value === value);

  const { openUpward, maxHeight } = useSmartDropdownPosition({
    isOpen,
    anchorRef: triggerRef,
    menuRef,
    preferredMaxHeight: Math.min(240, options.length * 36 + 8),
  });

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setActiveDropdown(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, setActiveDropdown]);

  return (
    <div className="relative flex-1 min-w-[150px] max-w-[240px]" ref={ref}>
      <label className="ui-filter-label">{label}</label>
      <button
        ref={triggerRef}
        onClick={() => setActiveDropdown(isOpen ? null : id)}
        className={`mt-1 w-full flex items-center justify-between px-3.5 pr-3 py-2 border rounded-lg transition-all text-sm font-medium shadow-sm bg-white hover:border-gray-400 group border-gray-300`}>
        <span
          className={`flex items-center gap-2 truncate ${value === "all" ? "text-gray-400" : "text-gray-900"}`}>
          {dot && selected?.dot && (
            <span className={`w-2 h-2 rounded-full shrink-0 ${selected.dot}`} />
          )}
          {selected?.label ?? value}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {isOpen && (
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
              className={`absolute z-50 w-full bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden py-1 overflow-y-auto custom-scrollbar ${openUpward ? "bottom-full mb-1" : "top-full mt-1"
                }`}
              style={{ maxHeight: `${maxHeight}px` }}>
              {options.map((opt) => {
                const isSelected = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      setActiveDropdown(null);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium transition-all duration-150 ${isSelected
                      ? dot
                        ? STATUS_DOT_HL[opt.value]?.hl ||
                        "bg-blue-50 text-blue-700"
                        : "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-50"
                      }`}>
                    {dot && opt.dot && (
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`}
                      />
                    )}
                    <span className="truncate flex-1 text-left">
                      {opt.label}
                    </span>
                    {isSelected && (
                      <div className="ml-auto bg-blue-600 rounded-full p-0.5 shrink-0">
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
}

// =============================================
// DESKTOP ROW
// =============================================
function DesktopAssetRow({
  asset,
  allAssets,
  isSelected,
  onClick,
}: {
  asset: Asset;
  allAssets: Asset[];
  isSelected: boolean;
  onClick: () => void;
}) {
  const isSoftware = isSoftwareLikeCategory(asset.category || "");
  const isChildUnit = !!(asset.bulkOrderParentId && !asset.isBulkOrder);
  const isBulkParent = !!asset.isBulkOrder;
  const allocation = getAllocationDisplay(asset);

  // Get parent name for child units
  const parentAsset = isChildUnit
    ? allAssets.find((a) => String(a.id) === String(asset.bulkOrderParentId))
    : null;

  // For bulk parents, compute child unit stats
  const childUnits = isBulkParent
    ? allAssets.filter(
      (a) =>
        String(a.bulkOrderParentId) === String(asset.id) && !a.isBulkOrder,
    )
    : [];
  const nonDisposedChildUnits = childUnits.filter(
    (u) => u.status !== ASSET_STATUS.DISPOSED,
  );
  const allocatedChildCount = asset.allocatedQuantity || 0;
  const totalChildCount = nonDisposedChildUnits.length || asset.totalQuantity || 0;

  return (
    <tr
      className={`transition-colors cursor-pointer border-b border-gray-100 last:border-b-0 ${isSelected
        ? "bg-blue-50 ring-1 ring-inset ring-blue-200"
        : "hover:bg-blue-50/40"
        }`}
      onClick={onClick}>
      {/* Asset Code */}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">
            {asset.assetCode}
          </span>
          {/* Badge Logic: Show ONLY ONE badge based on priority */}
          {isBulkParent && (childUnits.length > 0 || asset.totalQuantity) ? (
            // Bulk Order (software or hardware): Show unit count badge
            <span className="inline-flex items-center justify-center min-w-6 h-5 px-1.5 rounded bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
              {asset.status === ASSET_STATUS.DISPOSED
                ? childUnits.length
                : totalChildCount || asset.totalQuantity}{" "}
              Bulk
            </span>
          ) : (
            isChildUnit && (
              <span className="inline-flex items-center justify-center px-1.5 h-5 rounded bg-gray-100 text-gray-500 text-[10px] font-semibold border border-gray-200">
                Unit
              </span>
            )
          )}
          {isSoftware &&
            !isChildUnit &&
            !isBulkParent &&
            asset.totalQuantity &&
            asset.totalQuantity > 1 && (
              <span className="inline-flex items-center justify-center min-w-6 h-5 px-1.5 rounded bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
                {asset.totalQuantity} Bulk
              </span>
            )}
        </div>
      </td>

      {/* Asset Name */}
      <td className="px-6 py-4">
        <div>
          <p className="text-sm font-medium text-gray-900">{asset.assetName}</p>
          {isChildUnit && parentAsset ? (
            <p className="text-xs text-gray-500 mt-0.5">
              Part of: {parentAsset.assetName}
            </p>
          ) : asset.model ? (
            <p className="text-xs text-gray-500 mt-0.5">{asset.model}</p>
          ) : null}
        </div>
      </td>

      {/* Category */}
      <td className="px-6 py-4">
        <div>
          <p className="text-sm font-medium text-gray-900">{asset.category}</p>
          <p className="text-xs text-gray-500 mt-0.5">{asset.assetType}</p>
        </div>
      </td>

      {/* Status */}
      <td className="px-6 py-4 whitespace-nowrap">
        {asset.status === ASSET_STATUS.LICENSE_EXPIRED ? (
          <span className="inline-flex items-center rounded-full border font-semibold leading-none px-2 py-0.5 text-xs bg-red-100 text-red-800 border-red-200">
            License Expired
          </span>
        ) : (
          <StatusBadge status={asset.status} />
        )}
      </td>

      {/* Assigned To */}
      <td className="px-6 py-4">
        {isBulkParent ? (
          <div>
            <p className="text-sm font-medium text-gray-900">
              {allocatedChildCount} / {totalChildCount}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Units Allocated</p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-gray-900">
              {getAllocatedQuantity(asset)} / {getTotalQuantity(asset)}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {getQuantityLabel(asset.category)} Allocated
            </p>
          </div>
        )}
      </td>

      {/* Vendor */}
      <td className="px-6 py-4">
        <span className="text-sm text-gray-600 truncate block max-w-32">
          {asset.vendorName || "\u2014"}
        </span>
      </td>
    </tr>
  );
}

// =============================================
// MAIN COMPONENT
// =============================================
export function AllocationsPage({
  allocations,
  assets,
  users,
  vendors,
  assetHistory = [],
  maintenanceRecords = [],
  onViewAsset,
  onAllocate,
  onRevoke,
  onBulkRevoke,
  userRole = "Viewer" as UserRole,
  currentUser,
}: AllocationsPageProps) {
  // ── State ──
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [assetTypeFilter, setAssetTypeFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [conditionFilter, setConditionFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const isMobile = useIsMobile();

  // Selected asset for allocation modal
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<"allocation" | "history">(
    "allocation",
  );

  // Asset picker modal state
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [modalSearchTerm, setModalSearchTerm] = useState("");
  const debouncedModalSearch = useDebounce(modalSearchTerm, 300);
  const [modalCategoryFilter, setModalCategoryFilter] = useState<string>("all");
  const [modalAssetTypeFilter, setModalAssetTypeFilter] =
    useState<string>("all");
  const [modalVendorFilter, setModalVendorFilter] = useState<string>("all");
  const [modalConditionFilter, setModalConditionFilter] =
    useState<string>("all");
  const [showModalFilters, setShowModalFilters] = useState(false);
  const [activeModalDropdown, setActiveModalDropdown] = useState<string | null>(
    null,
  );
  const [modalCurrentPage, setModalCurrentPage] = useState(1);

  useEffect(() => {
    if (!showFilters) return;
    const handler = (e: MouseEvent) => {
      if (
        filterPanelRef.current &&
        !filterPanelRef.current.contains(e.target as Node)
      ) {
        setShowFilters(false);
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFilters]);

  const canAllocatePermission = hasPermission(
    userRole,
    PERMISSIONS.ASSET_ALLOCATE,
  );

  const childUnitsByParentId = useMemo(() => {
    const map = new Map<string, Asset[]>();

    for (const asset of assets) {
      if (asset.bulkOrderParentId && !asset.isBulkOrder) {
        const parentId = String(asset.bulkOrderParentId);
        const existing = map.get(parentId);
        if (existing) {
          existing.push(asset);
        } else {
          map.set(parentId, [asset]);
        }
      }
    }

    return map;
  }, [assets]);

  const nonChildAssets = useMemo(
    () => assets.filter((a) => !(a.bulkOrderParentId && !a.isBulkOrder)),
    [assets],
  );

  const activeAllocationsByAssetId = useMemo(() => {
    const map = new Map<string, LicenseAllocation[]>();

    for (const allocation of allocations) {
      if (allocation.status !== ALLOCATION_STATUS_DISPLAY.ACTIVE) continue;
      const key = String(allocation.assetId);
      const existing = map.get(key);
      if (existing) {
        existing.push(allocation);
      } else {
        map.set(key, [allocation]);
      }
    }

    return map;
  }, [allocations]);

  // Selected asset derived from assets array (auto-updates on data refresh)
  const selectedAsset = useMemo(
    () =>
      selectedAssetId
        ? assets.find((a) => a.id === selectedAssetId) || null
        : null,
    [selectedAssetId, assets],
  );

  // Allocations for the selected asset (for bulk parents, include child allocations)
  // Also include transitive received allocations (chain allocations) via parentAssetId/targetUnitId.
  const selectedAssetAllocations = useMemo(() => {
    if (!selectedAsset) return [];

    const rootAssetIds = new Set<string>([String(selectedAsset.id)]);

    if (selectedAsset.isBulkOrder) {
      const childUnits =
        childUnitsByParentId.get(String(selectedAsset.id)) || [];
      childUnits.forEach((a) => rootAssetIds.add(String(a.id)));
    }

    const chainAssetIds = new Set(rootAssetIds);
    let changed = true;

    while (changed) {
      changed = false;

      for (const alloc of allocations) {
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

    return allocations.filter((alloc) => {
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
  }, [selectedAsset, allocations, childUnitsByParentId]);

  // ── Derived filter options ──

  const categories = useMemo(() => {
    const cats = new Set<string>();
    assets.forEach((a) => {
      if (a.category) cats.add(a.category);
    });
    return Array.from(cats).sort();
  }, [assets]);

  const assetTypes = useMemo(() => {
    const types = new Set<string>();
    assets.forEach((a) => {
      if (a.assetType) types.add(a.assetType);
    });
    return Array.from(types).sort();
  }, [assets]);

  const conditionOptions = [
    { value: "all", label: "All Conditions", dot: CONDITION_DOT.all },
    ...ASSET_CONDITIONS_ARRAY.map((c) => ({
      value: c.value,
      label: c.label,
      dot: CONDITION_DOT[c.value] || "bg-gray-400",
    })),
  ];

  // ── Filter + Search ──
  const filteredAssets = useMemo(() => {
    const searchLower = debouncedSearch.trim().toLowerCase();
    const hasSearch = searchLower.length > 0;

    return assets
      .filter((asset) => {
        // Hide bulk order CHILDREN — show parents collectively instead
        if (asset.bulkOrderParentId && !asset.isBulkOrder) return false;

        // Show all allocation-relevant statuses including Available
        if (
          asset.status !== ASSET_STATUS.AVAILABLE &&
          asset.status !== ASSET_STATUS.ALLOCATED &&
          asset.status !== ASSET_STATUS.PARTIALLY_ALLOCATED &&
          asset.status !== ASSET_STATUS.UNDER_MAINTENANCE &&
          asset.status !== ASSET_STATUS.DISPOSED
        ) {
          return false;
        }

        // Search
        if (hasSearch) {
          const assetId = String(asset.id);
          const assetAllocations =
            activeAllocationsByAssetId.get(assetId) || [];

          const matchesAllocation = assetAllocations.some(
            (la) =>
              (la.userName || "").toLowerCase().includes(searchLower) ||
              (la.employeeId || "").toLowerCase().includes(searchLower) ||
              (la.parentAssetName || "").toLowerCase().includes(searchLower) ||
              (la.installationLocation || "")
                .toLowerCase()
                .includes(searchLower) ||
              (la.department || "").toLowerCase().includes(searchLower),
          );

          // For bulk parents, also match if any child unit's code/name or allocation matches
          const childUnits = childUnitsByParentId.get(String(asset.id)) || [];

          const matchesChildDetails =
            childUnits.length > 0 &&
            childUnits.some(
              (child) =>
                (child.assetCode || "").toLowerCase().includes(searchLower) ||
                (child.assetName || "").toLowerCase().includes(searchLower) ||
                (child.installationLocation || "")
                  .toLowerCase()
                  .includes(searchLower),
            );

          const matchesChildAllocation =
            childUnits.length > 0 &&
            childUnits.some((child: Asset) => {
              const childAllocations =
                activeAllocationsByAssetId.get(String(child.id)) || [];
              return childAllocations.some(
                (la) =>
                  (la.userName || "").toLowerCase().includes(searchLower) ||
                  (la.employeeId || "").toLowerCase().includes(searchLower) ||
                  (la.installationLocation || "")
                    .toLowerCase()
                    .includes(searchLower) ||
                  (la.department || "").toLowerCase().includes(searchLower),
              );
            });

          const matchesAsset =
            asset.assetCode?.toLowerCase().includes(searchLower) ||
            asset.assetName?.toLowerCase().includes(searchLower) ||
            asset.category?.toLowerCase().includes(searchLower) ||
            asset.assetType?.toLowerCase().includes(searchLower) ||
            asset.userName?.toLowerCase().includes(searchLower) ||
            asset.employeeId?.toLowerCase().includes(searchLower) ||
            asset.vendorName?.toLowerCase().includes(searchLower) ||
            asset.vendorId?.toLowerCase().includes(searchLower) ||
            asset.installationLocation?.toLowerCase().includes(searchLower) ||
            asset.invoiceNumber?.toLowerCase().includes(searchLower) ||
            asset.model?.toLowerCase().includes(searchLower) ||
            asset.serialNumber?.toLowerCase().includes(searchLower) ||
            (asset.parentAssetName || "").toLowerCase().includes(searchLower);

          if (
            !matchesAsset &&
            !matchesAllocation &&
            !matchesChildAllocation &&
            !matchesChildDetails
          )
            return false;
        }

        // Status filter
        if (statusFilter !== "all" && asset.status !== statusFilter)
          return false;

        // Category filter
        if (categoryFilter !== "all" && asset.category !== categoryFilter)
          return false;

        // Asset Type filter
        if (assetTypeFilter !== "all" && asset.assetType !== assetTypeFilter)
          return false;

        // Vendor filter
        if (vendorFilter !== "all" && String(asset.vendorId) !== vendorFilter)
          return false;

        // Condition filter
        if (conditionFilter !== "all" && asset.condition !== conditionFilter)
          return false;

        // Date filter (matches against createdAt)
        if (startDate || endDate) {
          const dateToCompare = new Date(asset.createdAt || 0).getTime();
          const start = startDate ? new Date(startDate).getTime() : 0;
          const end = endDate
            ? new Date(new Date(endDate).setHours(23, 59, 59, 999)).getTime()
            : Infinity;

          if (
            (startDate && dateToCompare < start) ||
            (endDate && dateToCompare > end)
          ) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const nameA = (a.assetName || "").toLowerCase();
        const nameB = (b.assetName || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [
    assets,
    activeAllocationsByAssetId,
    childUnitsByParentId,
    debouncedSearch,
    statusFilter,
    categoryFilter,
    assetTypeFilter,
    vendorFilter,
    conditionFilter,
    startDate,
    endDate,
  ]);

  const totalPages = Math.ceil(filteredAssets.length / RECORDS_PER_PAGE);

  const paginatedAssets = useMemo(() => {
    const start = (currentPage - 1) * RECORDS_PER_PAGE;
    return filteredAssets.slice(start, start + RECORDS_PER_PAGE);
  }, [filteredAssets, currentPage]);

  // ── Counts (including child units for bulk parents) ──
  /**
   * For a non-child asset, return the list of "countable units":
   * - Bulk parent → its child units (each child has its own status)
   * - Regular asset → the asset itself
   */
  const getCountableUnits = useCallback(
    (asset: Asset): Asset[] => {
      if (asset.isBulkOrder) {
        const children = childUnitsByParentId.get(String(asset.id)) || [];
        // If children exist, count by children; otherwise fall back to the parent itself
        return children.length > 0 ? children : [asset];
      }
      return [asset];
    },
    [childUnitsByParentId],
  );

  const shownStatusCounts = useMemo(() => {
    const counts = {
      available: 0,
      allocated: 0,
      underMaintenance: 0,
      disposed: 0,
    };

    for (const asset of filteredAssets) {
      if (asset.isBulkOrder) {
        const allocated = asset.allocatedQuantity || 0;
        const total = asset.totalQuantity || 0;

        counts.allocated += allocated;

        if (asset.status === ASSET_STATUS.UNDER_MAINTENANCE) {
          counts.underMaintenance += total;
        } else if (asset.status === ASSET_STATUS.DISPOSED) {
          counts.disposed += total;
        } else {
          counts.available += Math.max(0, total - allocated);
        }
      } else {
        if (asset.status === ASSET_STATUS.AVAILABLE) {
          counts.available += 1;
        } else if (
          asset.status === ASSET_STATUS.ALLOCATED ||
          asset.status === ASSET_STATUS.PARTIALLY_ALLOCATED
        ) {
          counts.allocated += 1;
        } else if (asset.status === ASSET_STATUS.UNDER_MAINTENANCE) {
          counts.underMaintenance += 1;
        } else if (asset.status === ASSET_STATUS.DISPOSED) {
          counts.disposed += 1;
        }
      }
    }

    return counts;
  }, [filteredAssets]);

  const availableCount = shownStatusCounts.available;
  const allocatedCount = shownStatusCounts.allocated;
  const underMaintenanceCount = shownStatusCounts.underMaintenance;
  const disposedCount = shownStatusCounts.disposed;

  // Total unit count across all filtered rows (expanding bulk parents to their quantities)
  const totalUnitCount = useMemo(
    () =>
      filteredAssets.reduce((sum, a) => sum + (a.isBulkOrder ? (a.totalQuantity || 0) : 1), 0),
    [filteredAssets],
  );

  // ── Asset picker options (Available + Partially Allocated, excluding expired licenses) ──
  const allocatableAssetBase = useMemo(
    () =>
      nonChildAssets.filter(
        (a) =>
          a.status === ASSET_STATUS.AVAILABLE ||
          a.status === ASSET_STATUS.PARTIALLY_ALLOCATED,
      ),
    [nonChildAssets],
  );

  // Filtered allocatable assets for the modal
  const filteredModalAssets = useMemo(() => {
    return allocatableAssetBase
      .filter((asset) => {
        // Search
        const searchLower = debouncedModalSearch.toLowerCase();
        if (searchLower) {
          const matchesAsset =
            asset.assetCode?.toLowerCase().includes(searchLower) ||
            asset.assetName?.toLowerCase().includes(searchLower) ||
            asset.category?.toLowerCase().includes(searchLower) ||
            asset.assetType?.toLowerCase().includes(searchLower) ||
            asset.vendorName?.toLowerCase().includes(searchLower) ||
            asset.model?.toLowerCase().includes(searchLower) ||
            asset.serialNumber?.toLowerCase().includes(searchLower);

          if (!matchesAsset) return false;
        }

        // Category filter
        if (
          modalCategoryFilter !== "all" &&
          asset.category !== modalCategoryFilter
        )
          return false;
        // Asset Type filter
        if (
          modalAssetTypeFilter !== "all" &&
          asset.assetType !== modalAssetTypeFilter
        )
          return false;
        // Vendor filter
        if (
          modalVendorFilter !== "all" &&
          String(asset.vendorId) !== modalVendorFilter
        )
          return false;
        // Condition filter
        if (
          modalConditionFilter !== "all" &&
          asset.condition !== modalConditionFilter
        )
          return false;

        return true;
      })
      .sort((a, b) => {
        const nameA = (a.assetName || "").toLowerCase();
        const nameB = (b.assetName || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [
    allocatableAssetBase,
    debouncedModalSearch,
    modalCategoryFilter,
    modalAssetTypeFilter,
    modalVendorFilter,
    modalConditionFilter,
  ]);

  const modalTotalPages = Math.ceil(
    filteredModalAssets.length / RECORDS_PER_PAGE,
  );

  const modalPaginatedAssets = useMemo(() => {
    const start = (modalCurrentPage - 1) * RECORDS_PER_PAGE;
    return filteredModalAssets.slice(start, start + RECORDS_PER_PAGE);
  }, [filteredModalAssets, modalCurrentPage]);

  // Provide a simple list of options if needed elsewhere (like old SearchableSelect)
  const allocatableAssetOptions = useMemo(
    () =>
      allocatableAssetBase
        .map((a) => ({
          value: a.id,
          label: `${a.assetName} (${a.category})${a.isBulkOrder ? " [Bulk]" : ""}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [allocatableAssetBase],
  );

  const totalAssetCount = useMemo(
    () => nonChildAssets.length,
    [nonChildAssets],
  );

  // ── Handlers ──
  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const handleFilterChange = (setter: (v: string) => void) => (val: string) => {
    setter(val);
    setCurrentPage(1);
  };

  const hasActiveFilters =
    statusFilter !== "all" ||
    categoryFilter !== "all" ||
    assetTypeFilter !== "all" ||
    vendorFilter !== "all" ||
    conditionFilter !== "all" ||
    !!startDate ||
    !!endDate;

  const activeFilterCount = [
    statusFilter !== "all",
    categoryFilter !== "all",
    assetTypeFilter !== "all",
    vendorFilter !== "all",
    conditionFilter !== "all",
    !!startDate,
    !!endDate,
  ].filter(Boolean).length;

  const activeModalFilterCount = [
    modalCategoryFilter !== "all",
    modalAssetTypeFilter !== "all",
    modalVendorFilter !== "all",
    modalConditionFilter !== "all",
  ].filter(Boolean).length;

  const hasActiveModalFilters = activeModalFilterCount > 0;

  const clearFilters = () => {
    setStatusFilter("all");
    setCategoryFilter("all");
    setAssetTypeFilter("all");
    setVendorFilter("all");
    setConditionFilter("all");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  };

  const clearModalFilters = () => {
    setModalCategoryFilter("all");
    setModalAssetTypeFilter("all");
    setModalVendorFilter("all");
    setModalConditionFilter("all");
    setModalCurrentPage(1);
  };

  const handleRowClick = (asset: Asset) => {
    if (canAllocatePermission && onAllocate) {
      // Toggle: click same row again to close
      if (selectedAssetId === asset.id) {
        setSelectedAssetId(null);
      } else {
        setSelectedAssetId(asset.id);
        setModalTab("allocation"); // Reset to allocation tab on new selection
      }
    } else if (onViewAsset) {
      onViewAsset(asset);
    }
  };

  // Allocation handler — adapts child units to use parent ID + targetUnitId
  const handleAllocateSelected = useCallback(
    async (
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
      if (!selectedAsset || !onAllocate) return;

      // If this is a child unit of a bulk order, route through the parent
      const effectiveAssetId =
        selectedAsset.bulkOrderParentId || selectedAsset.id;
      const enrichedData = allocationData.map((d) => ({
        ...d,
        // For child units, set targetUnitId to this specific unit
        targetUnitId: selectedAsset.bulkOrderParentId
          ? String(selectedAsset.id)
          : d.targetUnitId,
      }));

      await onAllocate(effectiveAssetId, enrichedData);
    },
    [selectedAsset, onAllocate],
  );

  // ── CSV Export ──
  const exportToCSV = useCallback(() => {
    generateAllocationsExport(filteredAssets, assets, allocations);
  }, [filteredAssets, assets, allocations]);

  return (
    <>
      <div className="space-y-4 sm:space-y-6">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              {userRole === "Viewer" ? "My Asset Allocations" : "Allocations"}
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">
              {userRole === "Viewer"
                ? "View your current and past asset assignments"
                : "Manage and allocate assets to users and departments"}
            </p>
          </div>
          <div className="flex items-center gap-2">

            {canAllocatePermission && onAllocate && (
              <button
                onClick={() => setShowAssetPicker(true)}
                className="bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-sm w-full sm:w-auto">
                <Plus className="w-5 h-5" />
                <span className="font-medium">Allocate Asset</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
            <p className="font-medium text-gray-900 text-sm sm:text-base">
              Gross Asset Pool
            </p>
            <p className="text-[21px] sm:text-[29px] font-bold text-gray-900 mt-1">
              {totalUnitCount}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-green-200 p-3 sm:p-4 shadow-sm">
            <p className="font-medium text-green-600 text-sm sm:text-base">
              Ready for Allotment
            </p>
            <p className="text-[21px] sm:text-[29px] font-bold text-green-700 mt-1">
              {availableCount}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-blue-200 p-3 sm:p-4 shadow-sm">
            <p className="font-medium text-blue-600 text-sm sm:text-base">
              Active Assignments
            </p>
            <p className="text-[21px] sm:text-[29px] font-bold text-blue-700 mt-1">
              {allocatedCount}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-amber-200 p-3 sm:p-4 shadow-sm">
            <p className="font-medium text-amber-600 text-sm sm:text-base leading-tight">
              Maintenance Pipeline
            </p>
            <p className="text-[21px] sm:text-[29px] font-bold text-amber-700 mt-1">
              {underMaintenanceCount}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-red-200 p-3 sm:p-4 shadow-sm">
            <p className="font-medium text-red-600 text-sm sm:text-base">
              Disposed Assets
            </p>
            <p className="text-[21px] sm:text-[29px] font-bold text-red-700 mt-1">
              {disposedCount}
            </p>
          </div>
        </div>

        {/* ── Search & Filter Bar ── */}
        <div
          ref={filterPanelRef}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
          <div className="flex flex-row items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search assets by code, name, category, user, vendor..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-9 pr-10 h-9 sm:h-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm text-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => handleSearchChange("")}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
                  title="Clear search">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center justify-center gap-2 px-2.5 sm:px-4 h-9 sm:h-10 border border-gray-300 rounded-lg bg-white cursor-pointer hover:border-gray-400 hover:shadow-sm transition-all shadow-sm font-semibold text-gray-700 text-sm whitespace-nowrap ${showFilters ? "border-gray-300" : ""
                }`}
              title="Filters">
              <Filter className="w-4 h-4 text-gray-500 sm:hidden" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="min-w-5 h-5 flex items-center justify-center bg-blue-600 text-white text-[10px] font-bold rounded-full">
                  {activeFilterCount}
                </span>
              )}
              <motion.div
                animate={{ rotate: showFilters ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="hidden sm:block">
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </motion.div>
            </button>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-all border border-transparent whitespace-nowrap">
                <X className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}
          </div>

          {/* ── Expanded Filters ── */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="overflow-visible pt-3">
                <div className="flex flex-wrap gap-3">
                  <FilterDropdown
                    id="status"
                    label="Status"
                    value={statusFilter}
                    activeDropdown={activeDropdown}
                    setActiveDropdown={setActiveDropdown}
                    onChange={handleFilterChange(setStatusFilter)}
                    dot
                    options={STATUS_OPTIONS}
                  />
                  <FilterDropdown
                    id="category"
                    label="Category"
                    value={categoryFilter}
                    activeDropdown={activeDropdown}
                    setActiveDropdown={setActiveDropdown}
                    onChange={handleFilterChange(setCategoryFilter)}
                    options={[
                      { value: "all", label: "All Categories" },
                      ...categories.map((c) => ({ value: c, label: c })),
                    ]}
                  />
                  <FilterDropdown
                    id="assetType"
                    label="Asset Type"
                    value={assetTypeFilter}
                    activeDropdown={activeDropdown}
                    setActiveDropdown={setActiveDropdown}
                    onChange={handleFilterChange(setAssetTypeFilter)}
                    options={[
                      { value: "all", label: "All Types" },
                      ...assetTypes.map((t) => ({ value: t, label: t })),
                    ]}
                  />
                  <FilterDropdown
                    id="vendor"
                    label="Vendor"
                    value={vendorFilter}
                    activeDropdown={activeDropdown}
                    setActiveDropdown={setActiveDropdown}
                    onChange={handleFilterChange(setVendorFilter)}
                    options={[
                      { value: "all", label: "All Vendors" },
                      ...vendors.map((v) => ({
                        value: String(v.id),
                        label: v.vendorName,
                      })),
                    ]}
                  />
                  <FilterDropdown
                    id="condition"
                    label="Condition"
                    value={conditionFilter}
                    activeDropdown={activeDropdown}
                    setActiveDropdown={setActiveDropdown}
                    onChange={handleFilterChange(setConditionFilter)}
                    dot
                    options={conditionOptions}
                  />
                  <div className="relative flex-1 min-w-35 max-w-55">
                    <label className="ui-filter-label">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setCurrentPage(1);
                      }}
                      style={{ height: "36px", paddingTop: "0px", paddingBottom: "0px" }}
                      className={`mt-1 w-full block px-3.5 border border-gray-300 rounded-lg shadow-sm bg-white hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer text-sm font-medium transition-all ${
                        startDate ? "text-gray-900" : "text-gray-400"
                      }`}
                    />
                  </div>
                  <div className="relative flex-1 min-w-35 max-w-55">
                    <label className="ui-filter-label">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setCurrentPage(1);
                      }}
                      style={{ height: "36px", paddingTop: "0px", paddingBottom: "0px" }}
                      className={`mt-1 w-full block px-3.5 border border-gray-300 rounded-lg shadow-sm bg-white hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer text-sm font-medium transition-all ${
                        endDate ? "text-gray-900" : "text-gray-400"
                      }`}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Asset Table ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Desktop Table (Visible on large screens) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="ui-table-head-compact">Asset Code</th>
                  <th className="ui-table-head-compact">Asset Name</th>
                  <th className="ui-table-head-compact">Category</th>
                  <th className="ui-table-head-compact">Status</th>
                  <th className="ui-table-head-compact">Assigned</th>
                  <th className="ui-table-head-compact">Vendor</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedAssets.map((asset) => (
                  <DesktopAssetRow
                    key={asset.id}
                    asset={asset}
                    allAssets={assets}
                    isSelected={selectedAssetId === asset.id}
                    onClick={() => handleRowClick(asset)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View (Visible on tablets and laptops) */}
          <div className="lg:hidden divide-y divide-gray-200">
            {paginatedAssets.map((asset) => {
              const isSoftware = isSoftwareLikeCategory(asset.category || "");
              const isBulkParent = !!asset.isBulkOrder;
              const isChildUnit = !!(
                asset.bulkOrderParentId && !asset.isBulkOrder
              );
              const allocation = getAllocationDisplay(asset);
              const isSelected = selectedAssetId === asset.id;

              const parentAsset = isChildUnit
                ? assets.find(
                  (a) => String(a.id) === String(asset.bulkOrderParentId),
                )
                : null;

              // For bulk parents, compute child stats
              const childUnits = isBulkParent
                ? assets.filter(
                  (a) =>
                    String(a.bulkOrderParentId) === String(asset.id) &&
                    !a.isBulkOrder,
                )
                : [];
              const allocatedChildCount = asset.allocatedQuantity || 0;

              return (
                <div
                  key={asset.id}
                  className={`p-4 transition-colors cursor-pointer ${isSelected
                    ? "bg-blue-50 ring-1 ring-inset ring-blue-200"
                    : "hover:bg-blue-50/40"
                    }`}
                  onClick={() => handleRowClick(asset)}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {asset.assetName}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm text-gray-600">
                          {asset.assetCode}
                        </p>
                        {isBulkParent && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            {childUnits.length || asset.totalQuantity || 0} Bulk
                          </span>
                        )}
                        {isChildUnit && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
                            Unit
                          </span>
                        )}
                      </div>
                      {isChildUnit && parentAsset ? (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Part of: {parentAsset.assetName}
                        </p>
                      ) : !isBulkParent && asset.model ? (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {asset.model}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge status={asset.status} size="xs" />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-xs text-gray-500">
                      {asset.category}
                    </span>
                    <span className="text-xs text-gray-400">&bull;</span>
                    <span className="text-xs text-gray-500">
                      {asset.assetType}
                    </span>
                    {asset.vendorName && (
                      <>
                        <span className="text-xs text-gray-400">&bull;</span>
                        <span className="text-xs text-gray-500">
                          {asset.vendorName}
                        </span>
                      </>
                    )}
                  </div>

                  {isBulkParent ? (
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">
                        {allocatedChildCount}/{childUnits.length}
                      </span>{" "}
                      units allocated
                    </div>
                  ) : (
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">
                        {getAllocatedQuantity(asset)}/{getTotalQuantity(asset)}
                      </span>{" "}
                      {getQuantityLabel(asset.category).toLowerCase()} allocated
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Empty State */}
          {filteredAssets.length === 0 && (
            <div className="text-center py-16">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500">
                {hasActiveFilters || searchTerm
                  ? "No assets match your filters"
                  : "No allocatable assets found"}
              </p>
              {(hasActiveFilters || searchTerm) && (
                <button
                  onClick={() => {
                    clearFilters();
                    setSearchTerm("");
                  }}
                  className="mt-2 text-xs text-blue-600 hover:underline font-medium">
                  Clear all filters
                </button>
              )}
            </div>
          )}

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredAssets.length}
            itemsPerPage={RECORDS_PER_PAGE}
            onPageChange={setCurrentPage}
            className="px-6 py-4 border-t border-gray-200 bg-gray-50/50"
          />
        </div>

        {/* ── Footer count ── */}
        <div className="flex justify-end py-4 px-2">
          <button
            onClick={exportToCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all shadow-sm">
            <Download className="w-4 h-4" />
            Export Allocations
          </button>
        </div>
      </div>

      {/* ── Allocation Modal ── */}
      {selectedAsset && canAllocatePermission && (
        <AnimatePresence>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setSelectedAssetId(null)}
            />
            {/* Modal panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95dvh] sm:max-h-[90vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gray-50 shrink-0">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-gray-900 truncate">
                    {selectedAsset.assetName || selectedAsset.assetCode}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedAsset.category} &bull; {selectedAsset.assetType}
                    {selectedAsset.bulkOrderParentId && (
                      <span className="ml-1 text-blue-600 font-medium">
                        &bull; Individual Unit
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {onViewAsset && (
                    <button
                      onClick={() => {
                        setSelectedAssetId(null);
                        onViewAsset(selectedAsset);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-all">
                      <ExternalLink className="w-3.5 h-3.5" />
                      View Asset
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedAssetId(null)}
                    className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Tab Bar */}
              <div className="flex border-b border-gray-200 bg-white px-4 sm:px-6 shrink-0">
                <button
                  onClick={() => setModalTab("allocation")}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${modalTab === "allocation"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}>
                  <Package className="w-4 h-4" />
                  Allocation
                </button>
                <button
                  onClick={() => setModalTab("history")}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${modalTab === "history"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}>
                  <History className="w-4 h-4" />
                  History
                </button>
              </div>

              {/* Body */}
              <div className="overflow-y-auto p-4 sm:p-6 modal-safe-bottom">
                {modalTab === "allocation" ? (
                  <AssetAllotmentForm
                    key={`allot-${selectedAsset.id}`}
                    asset={selectedAsset}
                    assets={assets}
                    allocations={selectedAssetAllocations}
                    users={users}
                    onAllocate={handleAllocateSelected}
                    onRevoke={onRevoke || noopRevoke}
                    onBulkRevoke={onBulkRevoke}
                    onViewUnit={onViewAsset}
                    userRole={userRole}
                    currentUser={currentUser}
                  />
                ) : (
                  <AssetHistory
                    key={`hist-${selectedAsset.id}`}
                    history={assetHistory.filter((h) => {
                      // Show history for this asset, or for child units if bulk parent
                      const ids = new Set([String(selectedAsset.id)]);
                      if (selectedAsset.isBulkOrder) {
                        assets
                          .filter(
                            (a) =>
                              String(a.bulkOrderParentId) ===
                              String(selectedAsset.id) && !a.isBulkOrder,
                          )
                          .forEach((a) => ids.add(String(a.id)));
                      }
                      return ids.has(String(h.assetId));
                    })}
                    licenseAllocations={selectedAssetAllocations}
                    assetCategory={selectedAsset.category}
                    users={users}
                    assetId={String(selectedAsset.id)}
                    isBulkOrder={selectedAsset.isBulkOrder}
                    assets={assets}
                    assetCode={selectedAsset.assetCode}
                    assetName={selectedAsset.assetName}
                    maintenanceRecords={maintenanceRecords.filter((m) => {
                      const ids = new Set([String(selectedAsset.id)]);
                      if (selectedAsset.isBulkOrder) {
                        assets
                          .filter(
                            (a) =>
                              String(a.bulkOrderParentId) ===
                              String(selectedAsset.id) && !a.isBulkOrder,
                          )
                          .forEach((a) => ids.add(String(a.id)));
                      }
                      return ids.has(String(m.assetId));
                    })}
                  />
                )}
              </div>
            </motion.div>
          </div>
        </AnimatePresence>
      )}

      {/* ── Asset Picker Modal ── */}
      {showAssetPicker && (
        <AnimatePresence>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto"
            onClick={() => setShowAssetPicker(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-8 flex flex-col max-h-[90vh]"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50/50 shrink-0 rounded-t-2xl">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    Select Asset to Allocate
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Showing {filteredModalAssets.length} available or partially
                    allocated assets
                  </p>
                </div>
                <button
                  onClick={() => setShowAssetPicker(false)}
                  className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {allocatableAssetBase.length > 0 && (
                <div className="px-6 py-4 border-b border-gray-100 bg-white shrink-0">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-row items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search assets..."
                          value={modalSearchTerm}
                          onChange={(e) => {
                            setModalSearchTerm(e.target.value);
                            setModalCurrentPage(1);
                          }}
                          className="w-full pl-9 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm text-sm"
                        />
                        {modalSearchTerm && (
                          <button
                            onClick={() => {
                              setModalSearchTerm("");
                              setModalCurrentPage(1);
                            }}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
                            title="Clear search">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => setShowModalFilters(!showModalFilters)}
                        className={`flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-white cursor-pointer hover:border-gray-400 hover:shadow-sm transition-all shadow-sm font-semibold text-gray-700 text-sm whitespace-nowrap ${showModalFilters ? "border-gray-300" : ""}`}>
                        <Filter className="w-4 h-4 text-gray-500 sm:hidden" />
                        <span className="hidden sm:inline">Filters</span>
                        {activeModalFilterCount > 0 && (
                          <span className="min-w-5 h-5 flex items-center justify-center bg-blue-600 text-white text-[10px] font-bold rounded-full">
                            {activeModalFilterCount}
                          </span>
                        )}
                        <motion.div
                          animate={{ rotate: showModalFilters ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="hidden sm:block">
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        </motion.div>
                      </button>
                      {hasActiveModalFilters && (
                        <button
                          onClick={clearModalFilters}
                          className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-all border border-transparent whitespace-nowrap">
                          <X className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Clear</span>
                        </button>
                      )}
                    </div>

                    {/* Modal Filters Expanded */}
                    <AnimatePresence>
                      {showModalFilters && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-visible">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
                            <FilterDropdown
                              id="modalCategory"
                              label="Category"
                              value={modalCategoryFilter}
                              activeDropdown={activeModalDropdown}
                              setActiveDropdown={setActiveModalDropdown}
                              onChange={(val) => {
                                setModalCategoryFilter(val);
                                setModalCurrentPage(1);
                              }}
                              options={[
                                { value: "all", label: "All Categories" },
                                ...categories.map((c) => ({
                                  value: c,
                                  label: c,
                                })),
                              ]}
                            />
                            <FilterDropdown
                              id="modalAssetType"
                              label="Asset Type"
                              value={modalAssetTypeFilter}
                              activeDropdown={activeModalDropdown}
                              setActiveDropdown={setActiveModalDropdown}
                              onChange={(val) => {
                                setModalAssetTypeFilter(val);
                                setModalCurrentPage(1);
                              }}
                              options={[
                                { value: "all", label: "All Types" },
                                ...assetTypes.map((t) => ({
                                  value: t,
                                  label: t,
                                })),
                              ]}
                            />
                            <FilterDropdown
                              id="modalVendor"
                              label="Vendor"
                              value={modalVendorFilter}
                              activeDropdown={activeModalDropdown}
                              setActiveDropdown={setActiveModalDropdown}
                              onChange={(val) => {
                                setModalVendorFilter(val);
                                setModalCurrentPage(1);
                              }}
                              options={[
                                { value: "all", label: "All Vendors" },
                                ...vendors.map((v) => ({
                                  value: String(v.id),
                                  label: v.vendorName,
                                })),
                              ]}
                            />
                            <FilterDropdown
                              id="modalCondition"
                              label="Condition"
                              value={modalConditionFilter}
                              activeDropdown={activeModalDropdown}
                              setActiveDropdown={setActiveModalDropdown}
                              onChange={(val) => {
                                setModalConditionFilter(val);
                                setModalCurrentPage(1);
                              }}
                              dot
                              options={conditionOptions}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* Modal Asset List */}
              <div className="flex-1 overflow-y-auto p-0 m-0 custom-scrollbar relative min-h-75">
                {filteredModalAssets.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center text-gray-500 bg-gray-50/50">
                    <Package className="w-12 h-12 text-gray-300 mb-3" />
                    <p className="text-lg font-medium text-gray-900">
                      {allocatableAssetBase.length === 0
                        ? "No available assets"
                        : "No assets match search"}
                    </p>
                    <p className="text-sm mt-1">
                      {allocatableAssetBase.length === 0
                        ? "There are absolutely no available or partially allocated assets left in your inventory."
                        : "Try adjusting your filters or search term."}
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-white sticky top-0 z-10 border-b border-gray-200 shadow-sm">
                      <tr>
                        <th className="ui-table-head-compact-sticky">
                          Asset Code
                        </th>
                        <th className="ui-table-head-compact-sticky">
                          Asset Name
                        </th>
                        <th className="ui-table-head-compact-sticky">
                          Category
                        </th>
                        <th className="ui-table-head-compact-sticky">Status</th>
                        <th className="ui-table-head-compact-sticky">
                          Assigned
                        </th>
                        <th className="ui-table-head-compact-sticky">Vendor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {modalPaginatedAssets.map((asset) => (
                        <DesktopAssetRow
                          key={asset.id}
                          asset={asset}
                          allAssets={assets}
                          isSelected={selectedAssetId === asset.id}
                          onClick={() => {
                            setSelectedAssetId(asset.id);
                            setShowAssetPicker(false);
                            setModalTab("allocation");
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Modal Pagination */}
              {modalTotalPages > 1 && (
                <div className="p-4 border-t border-gray-100 bg-white shrink-0">
                  <Pagination
                    currentPage={modalCurrentPage}
                    totalPages={modalTotalPages}
                    totalItems={filteredModalAssets.length}
                    itemsPerPage={RECORDS_PER_PAGE}
                    onPageChange={setModalCurrentPage}
                  />
                </div>
              )}
            </motion.div>
          </div>
        </AnimatePresence>
      )}
    </>
  );
}
