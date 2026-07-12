'use client';

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Calendar,
  Plus,
  ChevronDown,
  Search,
  MoreVertical,
  Eye,
  Download,
  AlertCircle,
  Filter,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { Pagination } from '@/components/ui/pagination';
import { MaintenanceRecord, Asset, LicenseAllocation } from '@/types';
import {
  hasPermission,
  PERMISSIONS,
  MAINTENANCE_STATUS,
  RECORDS_PER_PAGE,
  type UserRole,
  HIDE_DELETE_UI,
} from '@/config/constants';
import { motion, AnimatePresence } from "framer-motion";
import { MaintenanceDetail } from "./MaintenanceDetail";
import { ConfirmationModal } from "./ConfirmationModal";
import { getMaintenanceStatusIcon } from '@/lib/utils/statusHelpers';
import { formatCSVDate, formatCSVDateTime } from '@/lib/utils/csvHelpers';
import { openDataView } from '@/lib/utils/dataViewHelpers';
import { generateMaintenanceExport } from '@/lib/utils/exportHelpers';
import { useDebounce } from '@/hooks/useDebounce';
import { useSmartDropdownPosition } from '@/hooks/useSmartDropdownPosition';
import { formatCurrencyValue } from '@/lib/utils/formatCurrency';
import { formatDisplayDate } from '@/lib/utils/dateHelpers';

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
    <div className="relative flex-1 min-w-35 max-w-55" ref={ref}>
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
              className={`absolute z-50 w-full bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden py-1 overflow-y-auto custom-scrollbar ${
                openUpward ? "bottom-full mb-1" : "top-full mt-1"
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
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium transition-all duration-150 ${
                      isSelected
                        ? "bg-blue-50 text-blue-700"
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

interface MaintenanceScheduleProps {
  maintenanceRecords: MaintenanceRecord[];
  assets: Asset[];
  onAddMaintenance: () => void;
  onEditMaintenance: (record: MaintenanceRecord) => void;
  onCancelMaintenance: (id: string, reason: string) => void;
  onDeleteMaintenance: (id: string, reason: string) => void;
  onViewAsset?: (asset: Asset) => void;
  userRole?: UserRole;
  licenseAllocations?: LicenseAllocation[];
}

export function MaintenanceSchedule({
  maintenanceRecords,
  assets,
  onAddMaintenance,
  onEditMaintenance,
  onCancelMaintenance,
  onDeleteMaintenance,
  onViewAsset,
  userRole = "Viewer" as UserRole,
  licenseAllocations = [],
}: MaintenanceScheduleProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [assetTypeFilter, setAssetTypeFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);

  // Close context menu on scroll or window resize
  useEffect(() => {
    if (!openMenuId) return;

    const handleScrollOrResize = () => {
      setOpenMenuId(null);
    };

    window.addEventListener("scroll", handleScrollOrResize, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", handleScrollOrResize, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, {
        capture: true,
      });
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [openMenuId]);

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
  const menuTriggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
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
  const [selectedRecordForView, setSelectedRecordForView] =
    useState<MaintenanceRecord | null>(null);

  // Reset to first page when search or filter changes
  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const handleFilterChange = (setter: (v: string) => void) => (val: string) => {
    setter(val);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setCategoryFilter("all");
    setAssetTypeFilter("all");
    setVendorFilter("all");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  };

  const hasActiveFilters =
    statusFilter !== "all" ||
    categoryFilter !== "all" ||
    assetTypeFilter !== "all" ||
    vendorFilter !== "all" ||
    !!startDate ||
    !!endDate;

  const activeFilterCount = [
    statusFilter !== "all",
    categoryFilter !== "all",
    assetTypeFilter !== "all",
    vendorFilter !== "all",
    !!startDate,
    !!endDate,
  ].filter(Boolean).length;

  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: "cancel" | "delete";
    recordId: string | null;
    assetName: string;
  }>({
    isOpen: false,
    type: "cancel",
    recordId: null,
    assetName: "",
  });

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

  const vendors = useMemo(() => {
    const vMap = new Map<string, string>();
    assets.forEach((a) => {
      if (a.vendorId && a.vendorName) {
        vMap.set(String(a.vendorId), a.vendorName);
      }
    });
    return Array.from(vMap.entries()).map(([id, name]) => ({ id, name }));
  }, [assets]);

  // Use maintenance records directly
  const filteredRecords = useMemo(
    () =>
      maintenanceRecords.filter((record) => {
        const asset = assets.find(
          (a) => String(a.id) === String(record.assetId),
        );

        const matchesStatus =
          statusFilter === "all" || record.status === statusFilter;

        const matchesCategory =
          categoryFilter === "all" || asset?.category === categoryFilter;

        const matchesAssetType =
          assetTypeFilter === "all" || asset?.assetType === assetTypeFilter;

        const matchesVendor =
          vendorFilter === "all" || String(asset?.vendorId) === vendorFilter;

        if (
          !matchesStatus ||
          !matchesCategory ||
          !matchesAssetType ||
          !matchesVendor
        ) {
          return false;
        }

        // Date filter (matches against scheduledDate)
        if (startDate || endDate) {
          const dateToCompare = new Date(record.scheduledDate).getTime();
          const start = startDate ? new Date(startDate).getTime() : 0;
          const end = endDate ? new Date(endDate).getTime() : Infinity;

          // Adjust end date to include the whole day
          const adjustedEnd = endDate
            ? new Date(new Date(endDate).setHours(23, 59, 59, 999)).getTime()
            : Infinity;

          if (
            (startDate && dateToCompare < start) ||
            (endDate && dateToCompare > adjustedEnd)
          ) {
            return false;
          }
        }

        // Search term
        if (!debouncedSearch.trim()) {
          return true;
        }

        const searchLower = debouncedSearch.toLowerCase();
        const matchesSearch =
          record.assetCode?.toLowerCase().includes(searchLower) ||
          record.assetName?.toLowerCase().includes(searchLower) ||
          asset?.assetCode?.toLowerCase().includes(searchLower) ||
          asset?.assetName?.toLowerCase().includes(searchLower) ||
          asset?.vendorName?.toLowerCase().includes(searchLower) ||
          asset?.vendorId?.toLowerCase().includes(searchLower) ||
          asset?.userName?.toLowerCase().includes(searchLower) ||
          asset?.employeeId?.toLowerCase().includes(searchLower) ||
          asset?.installationLocation?.toLowerCase().includes(searchLower) ||
          record.description?.toLowerCase().includes(searchLower) ||
          record.technician?.toLowerCase().includes(searchLower);

        return matchesSearch;
      }),
    [
      maintenanceRecords,
      statusFilter,
      categoryFilter,
      assetTypeFilter,
      vendorFilter,
      debouncedSearch,
      assets,
    ],
  );

  const totalPages = Math.ceil(filteredRecords.length / RECORDS_PER_PAGE);

  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * RECORDS_PER_PAGE;
    return filteredRecords.slice(start, start + RECORDS_PER_PAGE);
  }, [filteredRecords, currentPage]);

  const maintenanceStats = useMemo(() => {
    const counts = { scheduled: 0, inProgress: 0, completed: 0, cancelled: 0 };
    for (const r of maintenanceRecords) {
      if (r.status === MAINTENANCE_STATUS.SCHEDULED) counts.scheduled++;
      else if (r.status === MAINTENANCE_STATUS.IN_PROGRESS) counts.inProgress++;
      else if (r.status === MAINTENANCE_STATUS.COMPLETED) counts.completed++;
      else if (r.status === MAINTENANCE_STATUS.CANCELLED) counts.cancelled++;
    }
    return { ...counts, total: maintenanceRecords.length };
  }, [maintenanceRecords]);

  const statusOptions = [
    { value: "all", label: "All Statuses", color: "gray" },
    { value: "Scheduled", label: "Scheduled", color: "blue" },
    {
      value: "In Progress",
      label: "In Progress",
      color: "yellow",
    },
    { value: "Completed", label: "Completed", color: "green" },
    { value: "Cancelled", label: "Cancelled", color: "red" },
    { value: "Reported", label: "Reported Issues", color: "orange" },
  ];

  const getSelectedLabel = () => {
    const selected = statusOptions.find((opt) => opt.value === statusFilter);
    return selected?.label || "All Statuses";
  };

  const exportToCSV = () => {
    generateMaintenanceExport(filteredRecords, assets);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Maintenance Schedule
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Track and manage asset maintenance activities
          </p>
        </div>
        {hasPermission(userRole, PERMISSIONS.MAINTENANCE_CREATE) && (
          <button
            onClick={onAddMaintenance}
            className="bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-sm w-full sm:w-auto">
            <Plus className="w-5 h-5" />
            <span className="font-medium hidden sm:inline">
              Schedule Maintenance
            </span>
            <span className="font-medium sm:hidden">Schedule</span>
          </button>
        )}
      </div>

      <div
        ref={filterPanelRef}
        className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
        <div className="flex flex-row items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search maintenance..."
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
            className={`flex items-center justify-center gap-2 px-2.5 sm:px-4 h-9 sm:h-10 border border-gray-300 rounded-lg bg-white cursor-pointer hover:border-gray-400 hover:shadow-sm transition-all shadow-sm font-semibold text-gray-700 text-sm whitespace-nowrap ${
              showFilters ? "border-gray-300" : ""
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
                  options={statusOptions.map((opt) => ({
                    value: opt.value,
                    label: opt.label,
                    dot:
                      opt.color === "gray"
                        ? "bg-gray-400"
                        : opt.color === "blue"
                          ? "bg-blue-500"
                          : opt.color === "yellow"
                            ? "bg-yellow-500"
                            : opt.color === "green"
                              ? "bg-green-500"
                              : "bg-red-500",
                  }))}
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
                      value: v.id,
                      label: v.name,
                    })),
                  ]}
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

      <div className="flex flex-col gap-3">
        {paginatedRecords.length > 0 ? (
          paginatedRecords.map((record, index) => {
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const isDelayed =
              record.status === MAINTENANCE_STATUS.SCHEDULED &&
              new Date(record.scheduledDate).getTime() < now.getTime();

            return (
              <div
                key={`${record.id}-${index}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (openMenuId === record.id) return;
                  setSelectedRecordForView(record);
                }}
                className={`bg-white rounded-xl shadow-sm hover:shadow-md transition-all group relative cursor-pointer ${
                  openMenuId === record.id ? "z-30" : "z-0"
                }`}>
                <div className="p-3 sm:p-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    {/* Status & Icon */}
                    <div className="flex items-center gap-3 md:w-80 shrink-0">
                      <div
                        className={`shrink-0 ${isDelayed ? "text-red-500" : ""}`}>
                        {isDelayed ? (
                          <AlertCircle className="w-5 h-5" />
                        ) : (
                          getMaintenanceStatusIcon(record.status)
                        )}
                      </div>
                      <div className="min-w-0">
                        <div
                          className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${
                            record.status === MAINTENANCE_STATUS.COMPLETED
                              ? "text-green-600"
                              : record.status === MAINTENANCE_STATUS.IN_PROGRESS
                                ? "text-yellow-600"
                                : record.status === MAINTENANCE_STATUS.SCHEDULED
                                  ? isDelayed
                                    ? "text-red-600"
                                    : "text-blue-600"
                                  : "text-red-600"
                          }`}>
                          {isDelayed ? "DELAYED" : record.status}
                        </div>
                        <h3 className="font-bold text-gray-900 text-sm truncate">
                          {record.assetName}
                        </h3>
                      </div>
                    </div>

                    {/* Description & Asset Code */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                          {record.assetCode}
                        </span>
                        {(record as any).isBulkGroupRecord
                          ? (() => {
                              const parentId = String(record.assetId);
                              const snapshotCoveredUnits = Array.isArray(
                                record.snapshotCoveredUnits,
                              )
                                ? record.snapshotCoveredUnits
                                : [];
                              const snapshotSkippedUnits = Array.isArray(
                                record.snapshotSkippedUnits,
                              )
                                ? record.snapshotSkippedUnits
                                : [];
                              const snapshotTotalUnitsRaw = Number(
                                record.snapshotTotalUnits,
                              );
                              const snapshotTotalUnits = Number.isFinite(
                                snapshotTotalUnitsRaw,
                              )
                                ? snapshotTotalUnitsRaw
                                : snapshotCoveredUnits.length +
                                  snapshotSkippedUnits.length;
                              const hasSnapshot =
                                snapshotCoveredUnits.length > 0 ||
                                snapshotSkippedUnits.length > 0 ||
                                Number.isFinite(snapshotTotalUnitsRaw);
                              // Terminal records: show historical static count
                              // Active records: show dynamic count excluding units with own maintenance
                              const isTerminal =
                                record.status === "Completed" ||
                                record.status === "Cancelled";

                              if (hasSnapshot) {
                                const displayTotal =
                                  (snapshotCoveredUnits.length > 0 || snapshotSkippedUnits.length > 0)
                                    ? snapshotCoveredUnits.length
                                    : (snapshotTotalUnits || 0);
                                return (
                                  <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 uppercase tracking-tight">
                                    Covers {displayTotal} unit{displayTotal === 1 ? "" : "s"}
                                  </span>
                                );
                              }

                              if (isTerminal) {
                                // Historical snapshot: include ALL children (even now-disposed ones)
                                // because they were active when the maintenance was performed.
                                // Disposal happens AFTER maintenance completion.
                                const totalChildrenRaw =
                                  (record as any).unitCount ??
                                  (record as any).childUnitCount;
                                const totalChildren = Number.isFinite(
                                  Number(totalChildrenRaw),
                                )
                                  ? Number(totalChildrenRaw)
                                  : assets.filter(
                                      (a) =>
                                        String(a.bulkOrderParentId) ===
                                          parentId && !a.isBulkOrder,
                                    ).length;
                                return (
                                  <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 uppercase tracking-tight">
                                    Covers {totalChildren} unit{totalChildren === 1 ? "" : "s"}
                                  </span>
                                );
                              }

                              const allChildren = assets.filter(
                                (a) =>
                                  String(a.bulkOrderParentId) === parentId &&
                                  !a.isBulkOrder &&
                                  a.status !== "Disposed",
                              );
                              const childrenWithOwnMaint = new Set(
                                maintenanceRecords
                                  .filter(
                                    (mr: MaintenanceRecord) =>
                                      !(mr as any).isBulkGroupRecord &&
                                      mr.id !== record.id &&
                                      (mr.status === "Scheduled" ||
                                        mr.status === "In Progress"),
                                  )
                                  .map((mr: MaintenanceRecord) =>
                                    String(mr.assetId),
                                  ),
                              );
                              const coveredChildren = allChildren.filter(
                                (c) => !childrenWithOwnMaint.has(String(c.id)),
                              );
                              return (
                                <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 uppercase tracking-tight">
                                  Covers {coveredChildren.length} unit{coveredChildren.length === 1 ? "" : "s"}
                                </span>
                              );
                            })()
                          : null}
                        {record.technician && (
                          <span className="text-[11px] text-gray-500 font-medium">
                            • {record.technician}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-1">
                        {record.description}
                      </p>
                    </div>

                    {/* Dates & Cost */}
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 md:w-72 shrink-0 text-sm">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                          Scheduled
                        </span>
                        <span className="font-semibold text-gray-700">
                          {formatDisplayDate(record.scheduledDate)}
                        </span>
                      </div>

                      {record.completionDate && (
                        <div className="flex flex-col">
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                            Completed
                          </span>
                          <span className="font-semibold text-gray-700">
                            {formatDisplayDate(record.completionDate)}
                          </span>
                        </div>
                      )}

                      {record.cost != null && (
                        <div className="flex flex-col">
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                            Cost
                          </span>
                          <span className="font-bold text-blue-600">
                            ₹{formatCurrencyValue(record.cost)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions Menu */}
                    {!HIDE_DELETE_UI &&
                      hasPermission(
                        userRole,
                        PERMISSIONS.MAINTENANCE_DELETE,
                      ) && (
                        <div className="absolute top-2 right-2 shrink-0">
                          <button
                            ref={(el) => {
                              if (el)
                                menuTriggerRefs.current.set(record.id, el);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (openMenuId === record.id) {
                                setOpenMenuId(null);
                                return;
                              }
                              const el = menuTriggerRefs.current.get(record.id);
                              if (el) {
                                const rect = el.getBoundingClientRect();
                                const menuW = 176;
                                const menuH = 160; // approx max height
                                const safeLeft = Math.min(
                                  rect.right - menuW,
                                  window.innerWidth - menuW - 8,
                                );
                                const spaceBelow =
                                  window.innerHeight - rect.bottom - 4;
                                const spaceAbove = rect.top - 4;
                                if (
                                  spaceBelow >= menuH ||
                                  spaceBelow >= spaceAbove
                                ) {
                                  setMenuPos({
                                    top: rect.bottom + 4,
                                    left: safeLeft,
                                  });
                                } else {
                                  setMenuPos({
                                    bottom: window.innerHeight - rect.top + 4,
                                    left: safeLeft,
                                  });
                                }
                              }
                              setOpenMenuId(record.id);
                            }}
                            className="flex md:opacity-0 md:group-hover:opacity-100 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all shadow-sm bg-white/80 backdrop-blur-sm">
                            <MoreVertical className="w-5 h-5" />
                          </button>

                          <AnimatePresence>
                            {openMenuId === record.id && (
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
                                  className="fixed w-44 bg-white rounded-xl shadow-2xl overflow-hidden z-50"
                                  style={{
                                    top: menuPos?.top,
                                    bottom: menuPos?.bottom,
                                    left: menuPos?.left,
                                    boxShadow:
                                      "0 10px 30px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)",
                                  }}
                                  onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedRecordForView(record);
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors no-push">
                                    <Eye className="w-4 h-4" />
                                    View Details
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActionModal({
                                        isOpen: true,
                                        type: "delete",
                                        recordId: record.id,
                                        assetName: record.assetName,
                                      });
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-700 transition-colors no-push border-t border-gray-100">
                                    <Trash2 className="w-4 h-4" />
                                    Delete
                                  </button>
                                </motion.div>
                              </>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-white rounded-lg shadow p-8 sm:p-12 text-center">
            <Calendar className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 text-sm sm:text-base">
              No maintenance records found
            </p>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              Schedule maintenance to keep your assets in optimal condition
            </p>
          </div>
        )}

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredRecords.length}
          itemsPerPage={RECORDS_PER_PAGE}
          onPageChange={setCurrentPage}
          itemLabel="records"
          className="mt-4 py-3 px-4 bg-white rounded-xl shadow-sm"
        />
      </div>

      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">
          Maintenance Statistics
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
          <div className="text-center p-3 sm:p-4 bg-blue-50 rounded-lg">
            <p className="text-xl sm:text-2xl font-bold text-blue-600">
              {maintenanceStats.scheduled}
            </p>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">Scheduled</p>
          </div>
          <div className="text-center p-3 sm:p-4 bg-yellow-50 rounded-lg">
            <p className="text-xl sm:text-2xl font-bold text-yellow-600">
              {maintenanceStats.inProgress}
            </p>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">In Progress</p>
          </div>
          <div className="text-center p-3 sm:p-4 bg-green-50 rounded-lg">
            <p className="text-xl sm:text-2xl font-bold text-green-600">
              {maintenanceStats.completed}
            </p>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">Completed</p>
          </div>
          <div className="text-center p-3 sm:p-4 bg-red-50 rounded-lg">
            <p className="text-xl sm:text-2xl font-bold text-red-600">
              {maintenanceStats.cancelled}
            </p>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">Cancelled</p>
          </div>
          <div className="text-center p-3 sm:p-4 bg-gray-50 rounded-lg">
            <p className="text-xl sm:text-2xl font-bold text-gray-600">
              {maintenanceStats.total}
            </p>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Total Records
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end py-4 px-2">
        <button
          onClick={exportToCSV}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all shadow-sm">
          <Download className="w-4 h-4" />
          Export Maintenance
        </button>
      </div>

      {/* Maintenance Details Modal */}
      <AnimatePresence>
        {selectedRecordForView && (
          <MaintenanceDetail
            record={selectedRecordForView}
            assets={assets}
            maintenanceRecords={maintenanceRecords}
            licenseAllocations={licenseAllocations}
            onClose={() => setSelectedRecordForView(null)}
            onEdit={onEditMaintenance}
            onViewAsset={onViewAsset}
            userRole={userRole}
          />
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={actionModal.isOpen}
        onClose={() => setActionModal({ ...actionModal, isOpen: false })}
        onConfirm={(reason) => {
          if (actionModal.recordId) {
            if (actionModal.type === "delete") {
              onDeleteMaintenance(actionModal.recordId, reason);
            } else {
              onCancelMaintenance(actionModal.recordId, reason);
            }
            setActionModal({
              isOpen: false,
              type: "cancel",
              recordId: null,
              assetName: "",
            });
          }
        }}
        title={
          actionModal.type === "delete"
            ? "Delete Maintenance Record"
            : "Cancel Maintenance Record"
        }
        message={
          actionModal.type === "delete"
            ? `Are you sure you want to permanently delete the maintenance record for ${actionModal.assetName}? This will remove it from the system.`
            : `Are you sure you want to cancel the maintenance record for ${actionModal.assetName}?`
        }
        confirmText={
          actionModal.type === "delete"
            ? "Confirm Deletion"
            : "Confirm Cancellation"
        }
        requireReason={true}
      />
    </div>
  );
}
