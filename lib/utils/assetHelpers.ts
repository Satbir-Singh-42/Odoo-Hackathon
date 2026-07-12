import {
  Asset,
  LicenseAllocation,
  MaintenanceRecord,
  getTotalQuantity,
  getAvailableQuantity,
} from '@/types';
import { ASSET_STATUS, ALLOCATION_STATUS_DISPLAY } from '@/config/constants';
import { formatCurrencyValue } from "./formatCurrency";

/**
 * Computes a complete view of an asset with all its related data
 * This emulates the vw_Assets_Detailed database view
 */
export function computeAssetViewData(
  asset: Asset,
  licenseAllocations: LicenseAllocation[],
  maintenanceRecords: MaintenanceRecord[],
  allAssets?: Asset[],
): Asset {
  // Get active allocations for this asset
  // For bulk order parents, also include allocations for all children
  let activeAllocations: LicenseAllocation[];

  if (asset.isBulkOrder && allAssets) {
    // Include allocations for parent OR any children
    activeAllocations = licenseAllocations.filter((alloc) => {
      if (alloc.status !== ALLOCATION_STATUS_DISPLAY.ACTIVE) return false;

      // Check if allocation is for parent
      if (String(alloc.assetId) === String(asset.id)) return true;

      // Check if allocation is for a child of this parent
      const allocatedAsset = allAssets.find(
        (a) => String(a.id) === String(alloc.assetId),
      );
      return String(allocatedAsset?.bulkOrderParentId) === String(asset.id);
    });
  } else {
    // Regular asset - only check direct allocations
    activeAllocations = licenseAllocations.filter(
      (alloc) =>
        String(alloc.assetId) === String(asset.id) &&
        alloc.status === ALLOCATION_STATUS_DISPLAY.ACTIVE,
    );
  }

  // Calculate allocated quantity purely from active allocation records
  // (The backend SQL may return stale employeeId from HistoryAlloc fallback,
  //  so we use allocation records as the single source of truth)
  const allocationRecordCount = activeAllocations.reduce(
    (sum, alloc) => sum + alloc.licensesAllocated,
    0,
  );

  const allocatedQty = allocationRecordCount;

  // Get total and available quantities
  const totalQty = getTotalQuantity(asset);
  const availableQty = totalQty - allocatedQty;

  // Determine status based on allocation and maintenance
  let status: Asset["status"] = asset.status;

  // Override status based on allocation state only for allocation-driven states.
  // Keep DB-backed special statuses (e.g., License Expired) unchanged.
  if (
    status !== ASSET_STATUS.UNDER_MAINTENANCE &&
    status !== ASSET_STATUS.DISPOSED &&
    status !== ASSET_STATUS.LICENSE_EXPIRED
  ) {
    if (allocatedQty === 0) {
      status = ASSET_STATUS.AVAILABLE;
    } else if (allocatedQty >= totalQty) {
      status = ASSET_STATUS.ALLOCATED;
    } else {
      status = ASSET_STATUS.PARTIALLY_ALLOCATED;
    }
  }

  // Build the enhanced asset
  const result: Asset = {
    ...asset,
    allocatedQuantity: allocatedQty,
    availableQuantity: availableQty,
    totalQuantity: totalQty,
    status,
  };

  // Clear stale assignment fields when no active allocations
  // (The backend HistoryAlloc fallback may still return old employeeId/userName)
  if (allocationRecordCount === 0 && !asset.isBulkOrder) {
    result.employeeId = null;
    result.userName = null;
    result.parentAssetId = undefined;
    result.parentAssetName = undefined;
  }

  return result;
}

/**
 * Checks if a maintenance record is a license renewal
 */
export const isLicenseRenewalMaintenance = (record: MaintenanceRecord): boolean => {
  const description = record.description ? record.description.toLowerCase() : "";
  const notes = record.notes ? record.notes.toLowerCase() : "";

  return (
    description.includes("license renewal") ||
    notes.includes("license renewal")
  );
};

/**
 * Gets a timestamp for a maintenance record for sorting
 */
export const getMaintenanceRecordTimestamp = (record: MaintenanceRecord): number => {
  const dateSource =
    record.completionDate || record.scheduledDate || record.createdAt || "";
  const timestamp = dateSource ? new Date(dateSource).getTime() : 0;

  return Number.isFinite(timestamp) ? timestamp : 0;
};

/**
 * Gets a human-readable breakdown of maintenance costs
 */
export const getMaintenanceBreakdownLabel = (renewal: number, repair: number, isSoftware: boolean = false): string | null => {
  const parts: string[] = [];

  if (renewal > 0) {
    parts.push(`₹${formatCurrencyValue(renewal)} latest renewal`);
  }

  if (repair > 0) {
    parts.push(`₹${formatCurrencyValue(repair)} repair`);
  }

  if (parts.length === 0) return null;

  if (isSoftware && renewal > 0) {
    return `${parts.join(" + ")} costs`;
  }

  return `Initial + ${parts.join(" + ")} costs`;
};

/**
 * Calculates sum of costs for maintenance records, isolating the latest renewal
 */
export function sumCosts(
  records: MaintenanceRecord[],
  getUnitCount?: (record: MaintenanceRecord) => number
): { renewal: number; repair: number; total: number } {
  // Sort by date (descending) to find the latest renewal
  const sorted = [...records].sort(
    (a, b) => getMaintenanceRecordTimestamp(b) - getMaintenanceRecordTimestamp(a)
  );

  // Isolate only the latest completed renewal record
  const latestRenewalRecord = sorted.find(
    (r) => isLicenseRenewalMaintenance(r) && (r.cost || 0) > 0
  );

  // Sum all other repair/maintenance costs cumulatively
  const repairCosts = records
    .filter((r) => !isLicenseRenewalMaintenance(r) && (r.cost || 0) > 0)
    .reduce((sum, r) => {
      const cost = r.cost || 0;
      const unitCount = getUnitCount ? getUnitCount(r) : 1;
      return sum + cost / unitCount;
    }, 0);

  const latestRenewalCost = latestRenewalRecord
    ? (latestRenewalRecord.cost || 0) / (getUnitCount ? getUnitCount(latestRenewalRecord) : 1)
    : 0;

  return {
    renewal: latestRenewalCost,
    repair: repairCosts,
    total: latestRenewalCost + repairCosts,
  };
}

/**
 * Calculates duration in days between two dates
 */
export const calculateDuration = (start: string, end: string | null): number => {
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();

  // Normalize to UTC midnight to count calendar days between dates.
  // This makes same-day allocation+return -> 0 days, and 1-day apart -> 1.
  const sMid = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
  const eMid = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate());

  const diffMs = eMid - sMid;
  const days = Math.floor(diffMs / 86400000);
  return days >= 0 ? days : 0;
};
