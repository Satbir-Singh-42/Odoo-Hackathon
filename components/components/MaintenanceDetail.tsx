'use client';

import { useEffect, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  X,
  User,
  Info,
  DollarSign,
  ArrowRightLeft,
  RotateCcw,
  Link2,
} from "lucide-react";
import dataService from '@/lib/dataService';
import { MaintenanceRecord, Asset, LicenseAllocation } from '@/types';
import {
  hasPermission,
  PERMISSIONS,
  MAINTENANCE_STATUS,
  ALLOCATION_STATUS_DISPLAY,
  ASSET_STATUS,
  type UserRole,
} from '@/config/constants';
import { getMaintenanceStatusIcon } from '@/lib/utils/statusHelpers';
import { formatCurrencyValue } from '@/lib/utils/formatCurrency';
import { formatDisplayDate } from '@/lib/utils/dateHelpers';

const ACTIVITY_STYLE = {
  return: {
    card: "bg-amber-50/50 border-amber-100",
    icon: "bg-amber-100 text-amber-600",
    label: "text-amber-600",
  },
  assetAlloc: {
    card: "bg-indigo-50/50 border-indigo-100",
    icon: "bg-indigo-100 text-indigo-600",
    label: "text-indigo-600",
  },
  userAlloc: {
    card: "bg-blue-50/50 border-blue-100",
    icon: "bg-blue-100 text-blue-600",
    label: "text-blue-600",
  },
} as const;

const getActivityStyle = (type: string, isAssetAllocation: boolean) =>
  type === "return"
    ? ACTIVITY_STYLE.return
    : isAssetAllocation
      ? ACTIVITY_STYLE.assetAlloc
      : ACTIVITY_STYLE.userAlloc;

interface MaintenanceDetailProps {
  record: MaintenanceRecord;
  assets: Asset[];
  maintenanceRecords?: MaintenanceRecord[];
  onClose: () => void;
  onEdit: (record: MaintenanceRecord) => void;
  onViewAsset?: (asset: Asset) => void;
  userRole?: UserRole;
  /** All allocations — used to show allocation activity during the maintenance window */
  licenseAllocations?: LicenseAllocation[];
}

export function MaintenanceDetail({
  record,
  assets,
  maintenanceRecords = [],
  onClose,
  onEdit,
  onViewAsset,
  userRole = "Viewer" as UserRole,
  licenseAllocations = [],
}: MaintenanceDetailProps) {
  const getStatusIcon = (status: string) => getMaintenanceStatusIcon(status);

  const [historicalSnapshot, setHistoricalSnapshot] = useState<{
    coveredUnits: Array<{ id: string; code: string; name?: string }>;
    skippedUnits: Array<{ id: string; code: string; name?: string }>;
    totalUnits: number | null;
  } | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [showAllUnits, setShowAllUnits] = useState(false);

  useEffect(() => {
    if (!(record as any).isBulkGroupRecord) return;

    const hasSnapshot =
      (Array.isArray(record.snapshotCoveredUnits) &&
        record.snapshotCoveredUnits.length > 0) ||
      (Array.isArray(record.snapshotSkippedUnits) &&
        record.snapshotSkippedUnits.length > 0) ||
      Number.isFinite(Number(record.snapshotTotalUnits));

    if (hasSnapshot) return;

    let stale = false;
    const fetchSnapshot = async () => {
      setSnapshotLoading(true);
      try {
        const fetched = await dataService.getMaintenanceById(String(record.id));
        if (stale) return;

        const snapshotCoveredUnits = Array.isArray(fetched.snapshotCoveredUnits)
          ? fetched.snapshotCoveredUnits
          : [];
        const snapshotSkippedUnits = Array.isArray(fetched.snapshotSkippedUnits)
          ? fetched.snapshotSkippedUnits
          : [];
        const snapshotTotalUnits = Number.isFinite(
          Number(fetched.snapshotTotalUnits),
        )
          ? Number(fetched.snapshotTotalUnits)
          : null;

        if (
          snapshotCoveredUnits.length > 0 ||
          snapshotSkippedUnits.length > 0 ||
          Number.isFinite(snapshotTotalUnits)
        ) {
          setHistoricalSnapshot({
            coveredUnits: snapshotCoveredUnits,
            skippedUnits: snapshotSkippedUnits,
            totalUnits: snapshotTotalUnits,
          });
        }
      } catch {
        // Best-effort recovery only.
      } finally {
        if (!stale) setSnapshotLoading(false);
      }
    };

    fetchSnapshot();
    return () => {
      stale = true;
    };
  }, [record]);

  // Look up the LIVE asset data — fall back to the stale snapshot on the record
  // asset may be undefined if the asset was soft-deleted OR if it's a bulk parent
  // outside the user's category scope (managedCategories filtering on AssetsList).
  const asset = assets.find((a) => String(a.id) === String(record.assetId));
  const assetName = asset?.assetName || record.assetName;
  const assetCode = asset?.assetCode || record.assetCode;
  const isBulkGroupRecord = Boolean((record as any).isBulkGroupRecord);
  // For bulk group records, the parent asset may not be in the user's filtered asset
  // scope (e.g., a Networking manager can't see Hardware parent assets). Don't show
  // "Deleted" badge in that case — the record is still valid.
  let isAssetDeleted = !asset;
  if (isBulkGroupRecord && !asset) {
    const hasChildInAssets = assets.some(
      (a) => String(a.bulkOrderParentId || "") === String(record.assetId) && !a.isBulkOrder,
    );
    if (hasChildInAssets) isAssetDeleted = false;
  }
  const isDisposedAsset = useCallback((assetToCheck?: Asset | null) => {
    if (!assetToCheck) return true;
    return (
      assetToCheck.status === ASSET_STATUS.DISPOSED ||
      Boolean(assetToCheck.disposalDate)
    );
  }, []);

  const hasDisposedCoveredAsset = useMemo(() => {
    const isBulkGroupRecord = Boolean((record as any).isBulkGroupRecord);
    if (!isBulkGroupRecord) {
      return isDisposedAsset(asset);
    }

    const coveredSnapshotUnits = Array.isArray(
      historicalSnapshot?.coveredUnits ?? record.snapshotCoveredUnits,
    )
      ? (historicalSnapshot?.coveredUnits ?? record.snapshotCoveredUnits ?? [])
      : [];

    if (coveredSnapshotUnits.length > 0) {
      return coveredSnapshotUnits.some((unit) =>
        isDisposedAsset(assets.find((a) => String(a.id) === String(unit.id))),
      );
    }

    const parentId = String(record.assetId);
    const children = assets.filter(
      (a) => String(a.bulkOrderParentId) === parentId && !a.isBulkOrder,
    );

    if (children.length === 0) return isDisposedAsset(asset);

    return children.some((child) => isDisposedAsset(child));
  }, [asset, assets, historicalSnapshot, record, isDisposedAsset]);
  const isTerminalRecord =
    record.status === MAINTENANCE_STATUS.COMPLETED ||
    record.status === MAINTENANCE_STATUS.CANCELLED;

  // === Asset Activity During Maintenance ===
  // Show allocations/returns that happened during the maintenance window
  const maintenanceStart = record.scheduledDate;
  const maintenanceEnd = record.completionDate || new Date().toISOString();

  const activityDuringMaintenance = useMemo(() => {
    if (record.status === MAINTENANCE_STATUS.SCHEDULED) return [];
    if (!maintenanceStart) return [];

    const startTs = new Date(maintenanceStart).getTime();
    const endTs = new Date(maintenanceEnd).getTime();
    const assetId = String(record.assetId);

    // Find allocations where the asset was involved during the maintenance period
    return licenseAllocations
      .filter((alloc) => {
        const allocAssetId = String(alloc.assetId);
        const parentId = alloc.parentAssetId
          ? String(alloc.parentAssetId)
          : null;

        // Only include allocations from/to this asset
        const isRelated = allocAssetId === assetId || parentId === assetId;
        if (!isRelated) return false;

        // Check if the allocation date falls within the maintenance window
        const allocDate = new Date(alloc.allocationDate).getTime();
        const returnDate = alloc.returnDate
          ? new Date(alloc.returnDate).getTime()
          : null;

        return (
          (allocDate >= startTs && allocDate <= endTs) ||
          (returnDate && returnDate >= startTs && returnDate <= endTs)
        );
      })
      .map((alloc) => {
        const allocAssetId = String(alloc.assetId);
        const isAllocatedFromThisAsset =
          allocAssetId === String(record.assetId);
        const isReturn = alloc.status !== ALLOCATION_STATUS_DISPLAY.ACTIVE;

        // Look up the related asset for display
        const relatedAsset = assets.find(
          (a) =>
            String(a.id) ===
            (isAllocatedFromThisAsset
              ? String(alloc.parentAssetId)
              : String(alloc.assetId)),
        );

        return {
          id: alloc.id,
          type: isReturn ? ("return" as const) : ("allocation" as const),
          direction: isAllocatedFromThisAsset
            ? ("from" as const)
            : ("to" as const),
          targetName: alloc.parentAssetId
            ? isAllocatedFromThisAsset
              ? alloc.parentAssetName ||
                relatedAsset?.assetName ||
                `Asset ${alloc.parentAssetId}`
              : relatedAsset?.assetName || `Asset ${alloc.assetId}`
            : alloc.userName || "Unknown User",
          targetCode: alloc.parentAssetId
            ? isAllocatedFromThisAsset
              ? relatedAsset?.assetCode || null
              : alloc.assetCode || relatedAsset?.assetCode || null
            : null,
          date: isReturn
            ? alloc.returnDate || alloc.allocationDate
            : alloc.allocationDate,
          condition: isReturn
            ? alloc.conditionAtReturn
            : alloc.conditionAtAllocation,
          isAssetAllocation: !!alloc.parentAssetId,
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [
    licenseAllocations,
    record.assetId,
    record.status,
    maintenanceStart,
    maintenanceEnd,
    assets,
  ]);
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
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[60] animate-in fade-in duration-200"
      onClick={handleBackdropClick}
      role="presentation">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[95dvh] sm:max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div
              className={`p-1.5 sm:p-2 rounded-lg ${
                record.status === MAINTENANCE_STATUS.COMPLETED
                  ? "bg-green-100 text-green-600"
                  : record.status === MAINTENANCE_STATUS.IN_PROGRESS
                    ? "bg-yellow-100 text-yellow-600"
                    : record.status === MAINTENANCE_STATUS.CANCELLED
                      ? "bg-red-100 text-red-600"
                      : "bg-blue-100 text-blue-600"
              }`}>
              {getStatusIcon(record.status)}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-gray-900 text-base sm:text-lg truncate">
                Maintenance Details
              </h3>
              <p className="text-[10px] sm:text-xs text-gray-500 font-medium uppercase tracking-wide">
                {record.status}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white hover:shadow-sm rounded-full transition-all text-gray-400 hover:text-gray-600 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="px-3 sm:px-6 py-4 sm:py-6 overflow-y-auto flex-1 modal-safe-bottom">
          {/* Asset Quick Info — simplified: just name/code/status + View button */}
          <div className="mb-6 sm:mb-8 p-3 sm:p-4 rounded-xl border bg-blue-50/50 border-blue-100">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-sm sm:text-base truncate text-blue-900">
                  {assetName}
                </h4>
                <p className="text-xs sm:text-sm font-mono mt-0.5 truncate text-blue-700/70">
                  {assetCode}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {isAssetDeleted ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                      Deleted
                    </span>
                  ) : (
                    asset && (
                      <>
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                            asset.status === "Available"
                              ? "bg-green-100 text-green-700"
                              : asset.status === "Under Maintenance"
                                ? "bg-yellow-100 text-yellow-700"
                                : asset.status === "Disposed"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-blue-100 text-blue-700"
                          }`}>
                          {asset.status === "Available" && userRole === "Viewer"
                            ? "Return"
                            : asset.status}
                        </span>
                        {asset.condition && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {asset.condition}
                          </span>
                        )}
                      </>
                    )
                  )}
                </div>
              </div>
              {onViewAsset && asset && (
                <button
                  onClick={() => {
                    onClose();
                    onViewAsset(asset);
                  }}
                  className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg shadow-sm transition-all shrink-0">
                  <Info className="w-3.5 h-3.5" />
                  View Full Asset Details
                </button>
              )}
            </div>
          </div>

          {/* Covered Units — only for bulk group records */}
          {(record as any).isBulkGroupRecord
            ? (() => {
                const snapshotCoveredUnits = Array.isArray(
                  historicalSnapshot?.coveredUnits ??
                    record.snapshotCoveredUnits,
                )
                  ? (historicalSnapshot?.coveredUnits ??
                    record.snapshotCoveredUnits ??
                    [])
                  : [];
                const snapshotSkippedUnits = Array.isArray(
                  historicalSnapshot?.skippedUnits ??
                    record.snapshotSkippedUnits,
                )
                  ? (historicalSnapshot?.skippedUnits ??
                    record.snapshotSkippedUnits ??
                    [])
                  : [];
                const snapshotTotalUnitsRaw =
                  historicalSnapshot?.totalUnits ??
                  Number(record.snapshotTotalUnits);
                const snapshotTotalUnits = Number.isFinite(
                  snapshotTotalUnitsRaw,
                )
                  ? snapshotTotalUnitsRaw
                  : snapshotCoveredUnits.length + snapshotSkippedUnits.length;
                const hasSnapshot =
                  snapshotCoveredUnits.length > 0 ||
                  snapshotSkippedUnits.length > 0 ||
                  Number.isFinite(snapshotTotalUnitsRaw);

                if (hasSnapshot) {
                  return (
                    <div className="mb-6 sm:mb-8">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                        Covered Units ({snapshotCoveredUnits.length} of{" "}
                        {snapshotTotalUnits})
                        <span className="ml-2 text-[9px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded normal-case tracking-normal">
                          Historical snapshot
                        </span>
                      </label>
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="flex flex-wrap gap-1.5">
                          {snapshotCoveredUnits
                            .slice(0, showAllUnits ? undefined : 10)
                            .map((unit) => {
                              const label = unit.code || unit.name || unit.id;
                              return (
                                <span
                                  key={unit.id || label}
                                  className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold border px-2 py-1 rounded bg-green-50 text-green-700 border-green-200 whitespace-nowrap">
                                  {label}
                                </span>
                              );
                            })}
                          {snapshotSkippedUnits
                            .slice(
                              0,
                              showAllUnits
                                ? undefined
                                : Math.max(0, 10 - snapshotCoveredUnits.length),
                            )
                            .map((unit) => {
                              const label = unit.code || unit.name || unit.id;
                              return (
                                <span
                                  key={unit.id || label}
                                  className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold bg-gray-100 text-gray-400 border border-gray-200 px-2 py-1 rounded line-through whitespace-nowrap"
                                  title="Skipped from maintenance">
                                  {label}
                                  <span className="text-[9px] font-sans font-medium ml-0.5 opacity-70">
                                    SKIPPED
                                  </span>
                                </span>
                              );
                            })}

                          {snapshotCoveredUnits.length +
                            snapshotSkippedUnits.length >
                            10 && (
                            <button
                              onClick={() => setShowAllUnits(!showAllUnits)}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold border border-transparent hover:border-gray-200 bg-white text-gray-600 px-2 py-1 rounded shadow-sm hover:shadow transition-all whitespace-nowrap">
                              {showAllUnits
                                ? "Show Less"
                                : `+ ${snapshotCoveredUnits.length + snapshotSkippedUnits.length - 10} more`}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                if (isTerminalRecord) {
                  const totalUnitsRaw =
                    historicalSnapshot?.totalUnits ??
                    Number(
                      (record as any).unitCount ??
                        (record as any).childUnitCount,
                    );
                  const totalUnits = Number.isFinite(totalUnitsRaw)
                    ? totalUnitsRaw
                    : null;

                  return (
                    <div className="mb-6 sm:mb-8">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                        Covered Units ({totalUnits ?? "?"})
                        <span className="ml-2 text-[9px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded normal-case tracking-normal">
                          Historical snapshot
                        </span>
                      </label>
                      {snapshotLoading ? (
                        <p className="text-xs text-gray-400 italic">
                          Loading historical snapshot…
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 italic">
                          Historical unit snapshot unavailable for this record.
                        </p>
                      )}
                    </div>
                  );
                }

                const parentId = String(record.assetId);
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
                    .map((mr: MaintenanceRecord) => String(mr.assetId)),
                );
                const coveredChildren = allChildren.filter(
                  (c) => !childrenWithOwnMaint.has(String(c.id)),
                );
                const skippedChildren = allChildren.filter((c) =>
                  childrenWithOwnMaint.has(String(c.id)),
                );

                return (
                  <div className="mb-6 sm:mb-8">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                      Covered Units ({coveredChildren.length} of{" "}
                      {allChildren.length})
                    </label>
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {coveredChildren
                          .slice(0, showAllUnits ? undefined : 10)
                          .map((c) =>
                            (() => {
                              const isDisposedChild =
                                !isTerminalRecord && c.status === "Disposed";
                              return (
                                <span
                                  key={c.id}
                                  title={
                                    isDisposedChild
                                      ? "Skipped from maintenance"
                                      : c.assetCode
                                  }
                                  className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold border px-2 py-1 rounded whitespace-nowrap ${
                                    isDisposedChild
                                      ? "bg-gray-50 text-gray-400 border-gray-200"
                                      : "bg-green-50 text-green-700 border-green-200"
                                  }`}>
                                  {c.assetCode}
                                  {isDisposedChild && (
                                    <span className="text-[9px] font-sans font-medium ml-0.5 opacity-70">
                                      SKIPPED
                                    </span>
                                  )}
                                </span>
                              );
                            })(),
                          )}
                        {skippedChildren
                          .slice(
                            0,
                            showAllUnits
                              ? undefined
                              : Math.max(0, 10 - coveredChildren.length),
                          )
                          .map((c) => (
                            <span
                              key={c.id}
                              className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold bg-gray-100 text-gray-400 border border-gray-200 px-2 py-1 rounded line-through whitespace-nowrap"
                              title="Has individual maintenance — skipped">
                              {c.assetCode}
                            </span>
                          ))}

                        {coveredChildren.length + skippedChildren.length >
                          10 && (
                          <button
                            onClick={() => setShowAllUnits(!showAllUnits)}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold border border-transparent hover:border-gray-200 bg-white text-gray-600 px-2 py-1 rounded shadow-sm hover:shadow transition-all whitespace-nowrap">
                            {showAllUnits
                              ? "Show Less"
                              : `+ ${coveredChildren.length + skippedChildren.length - 10} more`}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()
            : null}

          {/* Maintenance Specifics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
            <div className="space-y-4 sm:space-y-6">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                  Maintenance Scope
                </label>
                <p className="text-gray-700 text-xs sm:text-sm leading-relaxed bg-gray-50 p-3 rounded-lg">
                  {record.description}
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                  Notes & Observations
                </label>
                <p className="text-gray-700 text-xs sm:text-sm italic leading-relaxed">
                  {record.notes ||
                    "No additional notes provided for this session."}
                </p>
              </div>
            </div>

            <div className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="p-3 bg-gray-50 rounded-xl">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                    Scheduled
                  </label>
                  <p className="text-xs sm:text-sm font-medium text-gray-700">
                    {formatDisplayDate(record.scheduledDate)}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                    Completed
                  </label>
                  <p className="text-xs sm:text-sm font-medium text-gray-700">
                    {record.completionDate
                      ? formatDisplayDate(record.completionDate)
                      : record.status === MAINTENANCE_STATUS.CANCELLED
                        ? "Cancelled"
                        : "Pending"}
                  </p>
                </div>
              </div>

              <div className="p-3 sm:p-4 bg-gray-50 rounded-xl space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Technician
                    </span>
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-gray-700 truncate">
                    {!record.technician ||
                    record.technician.toLowerCase() === "system administrator"
                      ? "Not Assigned"
                      : record.technician}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-200">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Total Cost
                    </span>
                  </div>
                  <span className="text-base sm:text-lg font-semibold text-blue-600">
                    ₹{formatCurrencyValue(record.cost ?? 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Asset Activity During Maintenance */}
          {activityDuringMaintenance.length > 0 && (
            <div className="mt-6 sm:mt-8">
              <div className="flex items-center gap-2 mb-3">
                <ArrowRightLeft className="w-4 h-4 text-amber-500" />
                <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                  Asset Activity During Maintenance
                </h4>
                <span className="ml-auto text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {activityDuringMaintenance.length} event
                  {activityDuringMaintenance.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="space-y-2">
                {activityDuringMaintenance.map((activity) => {
                  const style = getActivityStyle(
                    activity.type,
                    activity.isAssetAllocation,
                  );
                  return (
                    <div
                      key={activity.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border text-xs sm:text-sm ${style.card}`}>
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${style.icon}`}>
                        {activity.type === "return" ? (
                          <RotateCcw className="w-3.5 h-3.5" />
                        ) : activity.isAssetAllocation ? (
                          <Link2 className="w-3.5 h-3.5" />
                        ) : (
                          <User className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wide ${style.label}`}>
                            {activity.type === "return"
                              ? activity.isAssetAllocation
                                ? activity.direction === "to"
                                  ? "Part Removed"
                                  : "Returned From Asset"
                                : "Returned From User"
                              : activity.isAssetAllocation
                                ? activity.direction === "to"
                                  ? "Part Installed"
                                  : "Allocated To Asset"
                                : "Allocated To User"}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {activity.targetName}
                        </p>
                        {activity.targetCode && (
                          <p className="text-[10px] text-gray-500 font-mono">
                            {activity.targetCode}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-gray-400 font-medium">
                          {formatDisplayDate(activity.date)}
                        </p>
                        {activity.condition && (
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            {activity.condition}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-2 sm:gap-3 shrink-0">
          {hasPermission(userRole, PERMISSIONS.MAINTENANCE_UPDATE) &&
            asset &&
            !isAssetDeleted &&
            !hasDisposedCoveredAsset && (
              <button
                onClick={() => {
                  onEdit(record);
                  onClose();
                }}
                className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-gray-700 hover:bg-white hover:shadow-sm rounded-xl transition-all border border-transparent hover:border-gray-200">
                <span className="hidden sm:inline">Edit Record</span>
                <span className="sm:hidden">Edit</span>
              </button>
            )}
          <button
            onClick={onClose}
            className="px-4 sm:px-6 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-200 transition-all">
            Close
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
