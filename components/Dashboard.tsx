'use client';

import React, { useMemo, useState, useCallback } from "react";
import {
  Package,
  AlertCircle,
  Wrench,
  CheckCircle,
  DollarSign,
  TrendingUp,
  ChevronDown,
  Trash2,
  RotateCcw,
  X,
  Search,
} from "lucide-react";
import {
  Asset,
  MaintenanceRecord,
  getTotalQuantity,
  getAllocatedQuantity,
  getAvailableQuantity,
} from '@/types';
import { isLicenseRenewalMaintenance } from '@/lib/utils/assetHelpers';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ASSET_STATUS, MAINTENANCE_STATUS } from '@/config/constants';
import { formatCurrencyValue } from '@/lib/utils/formatCurrency';
import { formatDisplayDate } from '@/lib/utils/dateHelpers';

interface DashboardProps {
  assets: Asset[];
  maintenanceRecords: MaintenanceRecord[];
  isViewer?: boolean;
  onViewAsset?: (asset: Asset) => void;
  onViewMaintenance?: (maintenance: MaintenanceRecord) => void;
  onGoToAssets?: () => void;
  onGoToMaintenance?: () => void;
  onNavigateToAsset?: (assetId: string) => void;
}

// ── Asset Drill-Down Modal ──────────────────────────────────────────────────
export function AssetDrillModal({
  title,
  filterLabel,
  filterValue,
  filterType,
  assets,
  onClose,
  onNavigateToAsset,
  isViewer,
}: {
  title: string;
  filterLabel: string;
  filterValue: string;
  filterType: "category" | "assetType";
  assets: Asset[];
  onClose: () => void;
  onNavigateToAsset?: (assetId: string) => void;
  isViewer?: boolean;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const base = assets.filter(
      (a) =>
        a.status !== ASSET_STATUS.DISPOSED &&
        !a.isBulkOrder &&
        a[filterType] === filterValue,
    );
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(
      (a) =>
        a.assetName.toLowerCase().includes(q) ||
        a.assetCode.toLowerCase().includes(q) ||
        (a.assetType || "").toLowerCase().includes(q),
    );
  }, [assets, filterType, filterValue, search]);

  // Prevent body scroll while modal is open
  React.useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-4 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-gray-50/50 rounded-t-2xl shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {filtered.length} asset{filtered.length !== 1 ? "s" : ""} in{" "}
              <span className="font-medium text-blue-600">{filterLabel}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 transition-colors shrink-0">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 sm:px-6 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              autoFocus
              placeholder="Search by name, code or type…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded-full">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Asset list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <Package className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-base font-medium text-gray-700">No assets found</p>
              <p className="text-sm mt-1">Try adjusting your search</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-white sticky top-0 z-10 border-b border-gray-200 shadow-sm">
                    <tr>
                      <th className="ui-table-head-compact-sticky">Asset Code</th>
                      <th className="ui-table-head-compact-sticky">Asset Name</th>
                      <th className="ui-table-head-compact-sticky">Type</th>
                      <th className="ui-table-head-compact-sticky">Status</th>
                      <th className="ui-table-head-compact-sticky">Units</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((asset) => (
                      <tr
                        key={asset.id}
                        onClick={() => onNavigateToAsset?.(String(asset.id))}
                        className={`hover:bg-blue-50/40 transition-colors ${onNavigateToAsset ? "cursor-pointer" : ""}`}>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 font-medium whitespace-nowrap">
                          {asset.assetCode}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium max-w-48 truncate">
                          {asset.assetName}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {asset.assetType}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            status={asset.status}
                            size="xs"
                            userRole={isViewer ? "Viewer" : "Admin"}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {getAllocatedQuantity(asset)}/{getTotalQuantity(asset)} alloc.
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-gray-100">
                {filtered.map((asset) => (
                  <div
                    key={asset.id}
                    onClick={() => onNavigateToAsset?.(String(asset.id))}
                    className={`p-4 hover:bg-blue-50/40 transition-colors ${onNavigateToAsset ? "cursor-pointer" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 text-sm truncate">
                          {asset.assetName}
                        </p>
                        <p className="text-xs font-mono text-gray-500 mt-0.5">
                          {asset.assetCode}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-gray-600">{asset.assetType}</span>
                          <span className="text-xs text-gray-500">
                            {getAllocatedQuantity(asset)}/{getTotalQuantity(asset)} alloc.
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge
                          status={asset.status}
                          size="xs"
                          userRole={isViewer ? "Viewer" : "Admin"}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>


      </div>
    </div>
  );
}

// Static sub-component — defined outside to avoid recreation on every render
const StatCard = ({
  icon: Icon,
  title,
  value,
  subtitle,
  color,
}: {
  icon: React.ElementType;
  title: string;
  value: string | number;
  subtitle?: string;
  color: string;
}) => (
  <div className="bg-white rounded-lg shadow-sm p-2 sm:p-2.5 hover:shadow-md transition-all">
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <p className="font-medium text-gray-900 text-sm sm:text-base leading-tight line-clamp-2 sm:line-clamp-1">
          {title}
        </p>
        <div
          className={`shrink-0 p-1.5 rounded-lg ${color.replace("text-", "bg-").replace("600", "50")}`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
      <p
        className={`text-[22px] sm:text-[35px] font-bold ${color} truncate leading-none`}>
        {value}
      </p>
      {subtitle && (
        <p className="text-[10px] sm:text-xs text-gray-500 truncate hidden sm:block">
          {subtitle}
        </p>
      )}
    </div>
  </div>
);

export function Dashboard({
  assets,
  maintenanceRecords,
  isViewer = false,
  onViewAsset,
  onViewMaintenance,
  onGoToAssets,
  onGoToMaintenance,
  onNavigateToAsset,
}: DashboardProps) {
  // Modal state
  const [drillModal, setDrillModal] = useState<{
    title: string;
    filterLabel: string;
    filterValue: string;
    filterType: "category" | "assetType";
  } | null>(null);

  const openCategoryModal = useCallback((category: string) => {
    setDrillModal({
      title: "Assets by Category",
      filterLabel: category,
      filterValue: category,
      filterType: "category",
    });
  }, []);

  const openTypeModal = useCallback((type: string) => {
    setDrillModal({
      title: "Assets by Type",
      filterLabel: type,
      filterValue: type,
      filterType: "assetType",
    });
  }, []);

  const stats = useMemo(() => {
    const activeAssetsForQuantity = assets.filter(
      (a) => a.status !== ASSET_STATUS.DISPOSED && !a.isBulkOrder,
    );

    const allActiveAssets = assets.filter(
      (a) => a.status !== ASSET_STATUS.DISPOSED && !a.isBulkOrder,
    );

    const parentChildCounts = new Map<string, number>();
    assets.forEach((a) => {
      if (a.bulkOrderParentId) {
        const pid = String(a.bulkOrderParentId);
        parentChildCounts.set(pid, (parentChildCounts.get(pid) || 0) + 1);
      }
    });

    const activeAssetIdsForRenewals = new Set(
      assets
        .filter((a) => a.status !== ASSET_STATUS.DISPOSED)
        .map((a) => String(a.id))
    );

    const latestRenewalPerAsset = new Map<string, { cost: number; date: number }>();
    let latestRenewalDate = 0;

    maintenanceRecords.forEach((m) => {
      if (!m.cost || m.cost <= 0 || !m.assetId || m.status !== MAINTENANCE_STATUS.COMPLETED) return;
      if (!isLicenseRenewalMaintenance(m)) return;

      const id = String(m.assetId);
      if (!activeAssetIdsForRenewals.has(id)) return;

      const dateSource = m.completionDate || m.scheduledDate || m.createdAt || "";
      const dateValue = dateSource ? new Date(dateSource).getTime() : 0;

      if (dateValue >= latestRenewalDate) {
        latestRenewalDate = dateValue;
      }

      const existing = latestRenewalPerAsset.get(id);
      if (!existing || dateValue >= existing.date) {
        latestRenewalPerAsset.set(id, { cost: m.cost, date: dateValue });
      }
    });

    let totalRenewalSum = 0;
    latestRenewalPerAsset.forEach((item) => {
      totalRenewalSum += item.cost;
    });

    const totalPriceSum = assets.reduce((sum, a) => {
      if (a.status === ASSET_STATUS.DISPOSED) return sum;
      if (!a.isBulkOrder) return sum + (Number(a.purchasePrice) || 0);
      if ((parentChildCounts.get(String(a.id)) || 0) === 0) {
        return sum + (Number(a.purchasePrice) || 0) * getTotalQuantity(a);
      }
      return sum;
    }, 0);

    return {
      totalAssets: allActiveAssets.length,
      availableAssets: activeAssetsForQuantity
        .filter(
          (a) =>
            a.status !== ASSET_STATUS.UNDER_MAINTENANCE &&
            a.status !== ASSET_STATUS.LICENSE_EXPIRED,
        )
        .reduce((sum, a) => sum + getAvailableQuantity(a), 0),
      allocatedAssets: activeAssetsForQuantity.reduce((sum, a) => sum + getAllocatedQuantity(a), 0),
      underMaintenance: allActiveAssets.filter(
        (a) => a.status === ASSET_STATUS.UNDER_MAINTENANCE,
      ).length,
      disposedAssets: assets.filter((a) => {
        if (a.isBulkOrder) return false;
        if (isViewer) {
          return a.status === ASSET_STATUS.DISPOSED || a.status === ASSET_STATUS.AVAILABLE;
        }
        return a.status === ASSET_STATUS.DISPOSED;
      }).length,
      totalValue: totalPriceSum + totalRenewalSum,
      totalRenewalSum,
      latestRenewalDateLabel: latestRenewalDate
        ? formatDisplayDate(new Date(latestRenewalDate))
        : null,
      upcomingMaintenance: maintenanceRecords.filter(
        (m) =>
          m.status === MAINTENANCE_STATUS.SCHEDULED ||
          m.status === MAINTENANCE_STATUS.IN_PROGRESS,
      ).length,
      expiringLicenses: activeAssetsForQuantity.filter((a) => {
        if (a.category !== "Software" || !a.licenseExpiryDate) return false;
        const expiry = new Date(a.licenseExpiryDate);
        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(now.getDate() + 30);
        return expiry > now && expiry <= thirtyDaysFromNow;
      }).length,
    };
  }, [assets, maintenanceRecords]);

  const recentAssets = useMemo(
    () =>
      [...assets]
        .filter((a) => !a.isBulkOrder)
        .sort((a, b) => {
          const dateA = isViewer ? new Date(a.updatedAt || a.createdAt) : new Date(a.createdAt);
          const dateB = isViewer ? new Date(b.updatedAt || b.createdAt) : new Date(b.createdAt);
          return dateB.getTime() - dateA.getTime();
        })
        .slice(0, 3),
    [assets, isViewer],
  );

  const upcomingMaintenance = useMemo(
    () =>
      maintenanceRecords
        .filter(
          (m) =>
            m.status === MAINTENANCE_STATUS.SCHEDULED ||
            m.status === MAINTENANCE_STATUS.IN_PROGRESS,
        )
        .sort(
          (a, b) =>
            new Date(a.scheduledDate).getTime() -
            new Date(b.scheduledDate).getTime(),
        )
        .slice(0, 5),
    [maintenanceRecords],
  );

  // Category and type data (memoized)
  const { categoryData, typeData } = useMemo(() => {
    const filteredAssets = assets.filter(
      (a) => a.status !== ASSET_STATUS.DISPOSED && !a.isBulkOrder,
    );
    const cats = Object.entries(
      filteredAssets.reduce((acc, asset) => {
        const quantity = getTotalQuantity(asset);
        acc[asset.category] = (acc[asset.category] || 0) + quantity;
        return acc;
      }, {} as Record<string, number>),
    ).sort(([, a], [, b]) => b - a);

    const types = Object.entries(
      filteredAssets.reduce((acc, asset) => {
        const quantity = getTotalQuantity(asset);
        acc[asset.assetType] = (acc[asset.assetType] || 0) + quantity;
        return acc;
      }, {} as Record<string, number>),
    ).sort(([, a], [, b]) => b - a);

    return { categoryData: cats, typeData: types };
  }, [assets]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Dashboard
        </h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">
          Overview of your {(process.env.NEXT_PUBLIC_WEBSITE_NAME || "Inventory Management System").toLowerCase()}
        </p>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3">
        {isViewer ? (
          <>
            <StatCard
              icon={TrendingUp}
              title="Allocated"
              value={stats.allocatedAssets}
              subtitle="Currently in use"
              color="text-purple-600"
            />
            <StatCard
              icon={AlertCircle}
              title="Active Maintenance"
              value={stats.upcomingMaintenance}
              subtitle="Scheduled + In Progress"
              color="text-red-600"
            />
            <StatCard
              icon={RotateCcw}
              title="Previously Held"
              value={stats.disposedAssets}
              subtitle="Returned or Disposed"
              color="text-blue-600"
            />

          </>
        ) : (
          <>
            <StatCard
              icon={Package}
              title="Total Active Inventory"
              value={stats.totalAssets}
              subtitle="Inventory in service"
              color="text-blue-600"
            />
            <StatCard
              icon={CheckCircle}
              title="Ready for Allotment"
              value={stats.availableAssets}
              subtitle="Available for allocation"
              color="text-green-600"
            />
            <StatCard
              icon={TrendingUp}
              title="Active Assignments"
              value={stats.allocatedAssets}
              subtitle="Currently in use"
              color="text-purple-600"
            />
            <StatCard
              icon={AlertCircle}
              title="Maintenance Queue"
              value={stats.upcomingMaintenance}
              subtitle="Scheduled + In Progress"
              color="text-red-600"
            />
            <StatCard
              icon={DollarSign}
              title="Portfolio Valuation"
              value={`₹${formatCurrencyValue(stats.totalValue)}`}
              subtitle={
                stats.totalRenewalSum > 0
                  ? `Latest renewals total: ₹${formatCurrencyValue(stats.totalRenewalSum)}${stats.latestRenewalDateLabel ? ` latest on ${stats.latestRenewalDateLabel}` : ""}`
                  : "Current asset value"
              }
              color="text-emerald-600"
            />
            <StatCard
              icon={Trash2}
              title="Decommissioned Assets"
              value={stats.disposedAssets}
              subtitle="Permanently removed"
              color="text-red-600"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white rounded-lg shadow border border-gray-200">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
              {isViewer ? "My Asset Activity" : "Recent Assets"}
            </h2>
          </div>
          <div className="divide-y divide-gray-200">
            {recentAssets.length > 0 ? (
              recentAssets.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => onViewAsset?.(asset)}
                  className="p-2 sm:p-3 hover:bg-gray-50 transition-colors cursor-pointer">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate text-sm sm:text-base">
                        {asset.assetName}
                      </p>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1 truncate">
                        Code: {asset.assetCode}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Added:{" "}
                        {formatDisplayDate(asset.createdAt)}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <StatusBadge status={asset.status} size="xs" userRole={isViewer ? "Viewer" : "Admin"} />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 sm:p-8 text-center text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p className="text-sm sm:text-base">No assets registered yet</p>
              </div>
            )}
          </div>
          {onGoToAssets &&
            recentAssets.length > 0 &&
            assets.length > recentAssets.length && (
              <div className="p-3 sm:p-4 border-t border-gray-200">
                <button
                  onClick={onGoToAssets}
                  className="w-full flex items-center justify-center gap-2 text-sm sm:text-base text-blue-600 hover:text-blue-700 font-medium transition-colors no-push py-1">
                  <ChevronDown className="w-4 h-4" />
                  View All Assets
                </button>
              </div>
            )}
        </div>

        <div className="bg-white rounded-lg shadow flex flex-col">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
              Upcoming Maintenance
            </h2>
          </div>
          <div className="divide-y divide-gray-200 flex-1 flex flex-col">
            {upcomingMaintenance.length > 0 ? (
              upcomingMaintenance.map((maintenance) => (
                <div
                  key={maintenance.id}
                  onClick={() => onViewMaintenance?.(maintenance)}
                  className="p-2 sm:p-3 hover:bg-gray-50 transition-colors cursor-pointer">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate text-sm sm:text-base">
                        {maintenance.assetName}
                      </p>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1 line-clamp-2">
                        {maintenance.description}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Scheduled:{" "}
                        {formatDisplayDate(maintenance.scheduledDate)}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <StatusBadge status={maintenance.status} size="xs" userRole={isViewer ? "Viewer" : "Admin"} />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-500 min-h-45">
                <Wrench className="w-12 h-12 mb-2 text-gray-400" />
                <p className="text-sm sm:text-base text-center">
                  No upcoming maintenance scheduled
                </p>
              </div>
            )}
          </div>
          {onGoToMaintenance &&
            upcomingMaintenance.length > 0 &&
            stats.upcomingMaintenance > upcomingMaintenance.length && (
              <div className="p-3 sm:p-4 border-t border-gray-200">
                <button
                  onClick={onGoToMaintenance}
                  className="w-full flex items-center justify-center gap-2 text-sm sm:text-base text-blue-600 hover:text-blue-700 font-medium transition-colors no-push py-1">
                  <ChevronDown className="w-4 h-4" />
                  View All Maintenance
                </button>
              </div>
            )}
        </div>
      </div>

      {/* ── Assets by Category & Type ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

        {/* Assets by Category */}
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">
            Assets by Category
          </h2>
          {categoryData.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              {categoryData.map(([category, count]) => (
                <button
                  key={category}
                  onClick={() => openCategoryModal(category)}
                  className="bg-gray-50 rounded-lg p-3 sm:p-4 text-center hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-all group cursor-pointer">
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                    {count}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1 truncate group-hover:text-blue-600 transition-colors">
                    {category}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <Package className="w-10 h-10 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No category data available</p>
            </div>
          )}
        </div>

        {/* Assets by Type */}
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">
            Assets by Type
          </h2>
          {typeData.length > 0 ? (
            <div className="max-h-64 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-0.5">
                {typeData.map(([type, count]) => (
                  <button
                    key={type}
                    onClick={() => openTypeModal(type)}
                    className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-all group cursor-pointer w-full text-left">
                    <span className="text-xs sm:text-sm font-medium text-gray-700 truncate flex-1 group-hover:text-blue-700 transition-colors">
                      {type}
                    </span>
                    <span className="shrink-0 ml-2 px-2 sm:px-3 py-1 text-xs sm:text-sm font-semibold text-blue-600 bg-blue-50 rounded-full group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      {count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <Package className="w-10 h-10 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No asset types available</p>
            </div>
          )}
        </div>
      </div>

      {/* Drill-down modal */}
      {drillModal && (
        <AssetDrillModal
          {...drillModal}
          assets={assets}
          onClose={() => setDrillModal(null)}
          onNavigateToAsset={onNavigateToAsset}
          isViewer={isViewer}
        />
      )}
    </div>
  );
}
