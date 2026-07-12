/**
 * Comprehensive Validation Rules
 * Frontend validation to prevent invalid operations before they reach the backend
 */

import { Asset, LicenseAllocation, MaintenanceRecord } from '@/types';
import {
  ASSET_CONDITIONS,
  ASSET_STATUS,
  ALLOCATION_STATUS_DISPLAY,
  MAINTENANCE_STATUS,
  isSoftwareLikeCategory,
} from '@/config/constants';
import { formatCurrencyValue } from '@/lib/utils/formatCurrency';
import { formatDisplayDate } from '@/lib/utils/dateHelpers';

// =============================================
// VALIDATION RESULT TYPE
// =============================================
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

// =============================================
// SHARED HELPERS
// =============================================
const buildResult = (
  errors: string[],
  warnings: string[],
): ValidationResult => ({
  isValid: errors.length === 0,
  errors,
  warnings,
});

const getActiveAllocations = (
  allocations: LicenseAllocation[],
  assetId: number | string,
): LicenseAllocation[] =>
  allocations.filter(
    (a) =>
      String(a.assetId) === String(assetId) &&
      a.status === ALLOCATION_STATUS_DISPLAY.ACTIVE,
  );

const isDisposed = (asset: Asset): boolean =>
  asset.status === ASSET_STATUS.DISPOSED || !!asset.disposalDate;

// =============================================
// ASSET CREATION VALIDATION
// =============================================
export const validateAssetCreation = (
  asset: Partial<Asset>,
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!asset.assetCode || !asset.assetCode.trim()) {
    errors.push("Asset Code is required");
  }
  if (!asset.assetName || !asset.assetName.trim()) {
    errors.push("Asset Name is required");
  }
  if (!asset.category) {
    errors.push("Category is required");
  }
  if (!asset.assetType) {
    errors.push("Asset Type is required");
  }

  // Asset Code format validation
  if (asset.assetCode && !/^[A-Z0-9-]+$/i.test(asset.assetCode)) {
    errors.push("Asset Code must contain only letters, numbers, and hyphens");
  }

  // Price validation
  if (asset.purchasePrice !== undefined && asset.purchasePrice !== null) {
    if (asset.purchasePrice < 0) {
      errors.push("Purchase Price cannot be negative");
    }
    if (asset.purchasePrice > 10000000) {
      warnings.push("Purchase Price seems unusually high (> ₹1 Crore)");
    }
  }

  // Quantity validation
  if (asset.totalQuantity !== undefined && asset.totalQuantity !== null) {
    if (asset.totalQuantity < 1) {
      errors.push("Total Quantity must be at least 1");
    }
    if (asset.totalQuantity > 10000) {
      warnings.push("Total Quantity seems unusually high (> 10,000)");
    }
  }

  // Software-specific validation
  if (isSoftwareLikeCategory(asset.category || "")) {
    if (!asset.licenseType) {
      errors.push("License Type is required for Software assets");
    }
    if (
      asset.licenseExpiryDate &&
      new Date(asset.licenseExpiryDate) < new Date()
    ) {
      warnings.push("License has already expired");
    }
    if (!asset.totalQuantity || asset.totalQuantity < 1) {
      errors.push(
        "License count (Total Quantity) must be specified for Software",
      );
    }
  }

  // Hardware-specific validation
  if (!isSoftwareLikeCategory(asset.category || "")) {
    if (asset.serialNumber && !/^[A-Z0-9-]+$/i.test(asset.serialNumber)) {
      warnings.push("Serial Number format may be invalid");
    }
  }

  // Date validation
  if (asset.invoiceDate) {
    const invoiceDate = new Date(asset.invoiceDate);
    const futureLimit = new Date();
    futureLimit.setMonth(futureLimit.getMonth() + 1);

    if (invoiceDate > futureLimit) {
      errors.push("Invoice Date cannot be more than 1 month in the future");
    }

    const pastLimit = new Date();
    pastLimit.setFullYear(pastLimit.getFullYear() - 20);
    if (invoiceDate < pastLimit) {
      warnings.push("Invoice Date is more than 20 years old");
    }
  }

  // Condition validation
  if (
    asset.condition &&
    !(Object.values(ASSET_CONDITIONS) as string[]).includes(asset.condition!)
  ) {
    errors.push("Invalid condition value");
  }

  return buildResult(errors, warnings);
};

// =============================================
// ASSET UPDATE VALIDATION
// =============================================
export const validateAssetUpdate = (
  originalAsset: Asset,
  updates: Partial<Asset>,
  allocations: LicenseAllocation[],
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Get current allocations for this asset
  const activeAllocations = getActiveAllocations(allocations, originalAsset.id);
  const totalAllocated = activeAllocations.reduce(
    (sum, a) => sum + (a.licensesAllocated || 1),
    0,
  );

  // CRITICAL: Cannot reduce totalQuantity below allocatedQuantity
  if (updates.totalQuantity !== undefined) {
    const newTotalQuantity = updates.totalQuantity;

    // BULK ASSET SAFEGUARD: Cannot change quantity directly
    const isBulkParent = originalAsset.isBulkOrder;
    const isBulkChild = originalAsset.bulkOrderParentId != null;
    if (isBulkParent || isBulkChild) {
      if (newTotalQuantity !== originalAsset.totalQuantity) {
        errors.push(
          "Bulk asset quantity is locked. Manage individual units from the Individual Units tab.",
        );
      }
    }

    if (newTotalQuantity < totalAllocated) {
      errors.push(
        `Cannot reduce Total Quantity to ${newTotalQuantity}. ` +
          `Currently ${totalAllocated} units are allocated. ` +
          `Please revoke allocations first or set quantity to at least ${totalAllocated}.`,
      );
    }

    if (newTotalQuantity < 1) {
      errors.push("Total Quantity must be at least 1");
    }

    // Warning if reducing available quantity significantly
    const currentAvailable =
      (originalAsset.totalQuantity || 1) - totalAllocated;
    const newAvailable = newTotalQuantity - totalAllocated;

    if (newAvailable < currentAvailable && newAvailable < 5) {
      warnings.push(
        `Reducing available quantity from ${currentAvailable} to ${newAvailable}. ` +
          `This may limit future allocations.`,
      );
    }
  }

  // Cannot change category if there are active allocations
  if (updates.category && updates.category !== originalAsset.category) {
    if (activeAllocations.length > 0) {
      errors.push(
        `Cannot change Category from "${originalAsset.category}" to "${updates.category}". ` +
          `This asset has ${activeAllocations.length} active allocation(s). ` +
          `Revoke all allocations first.`,
      );
    }
  }

  // Cannot change to disposed status if there are active allocations
  if (updates.status === ASSET_STATUS.DISPOSED && activeAllocations.length > 0) {
    errors.push(
      `Cannot dispose this asset. It has ${activeAllocations.length} active allocation(s). ` +
        `Please revoke all allocations first or use the Dispose feature.`,
    );
  }

  // Cannot set disposal date without reason
  if (
    updates.disposalDate &&
    !updates.disposalReason &&
    !originalAsset.disposalReason
  ) {
    errors.push("Disposal Reason is required when setting Disposal Date");
  }

  // Price validation
  if (
    updates.purchasePrice !== undefined &&
    updates.purchasePrice !== null &&
    updates.purchasePrice < 0
  ) {
    errors.push("Purchase Price cannot be negative");
  }

  // Software-specific validation
  if (
    isSoftwareLikeCategory(originalAsset.category || "") ||
    isSoftwareLikeCategory(updates.category || "")
  ) {
    if (updates.licenseExpiryDate) {
      const expiryDate = new Date(updates.licenseExpiryDate);
      const today = new Date();

      if (expiryDate < today) {
        warnings.push("License expiry date is in the past");
      }
    }
  }

  // Cannot change asset code if allocations exist (for audit trail integrity)
  if (updates.assetCode && updates.assetCode !== originalAsset.assetCode) {
    if (activeAllocations.length > 0) {
      warnings.push(
        "Changing Asset Code for an allocated asset may affect audit trails and reports",
      );
    }
  }

  // Status transition validation
  if (updates.status && updates.status !== originalAsset.status) {
    const validTransitions = getValidStatusTransitions(
      originalAsset.status,
      totalAllocated,
    );
    if (!validTransitions.includes(updates.status)) {
      errors.push(
        `Cannot change status from "${originalAsset.status}" to "${updates.status}". ` +
          `Valid transitions: ${validTransitions.join(", ")}`,
      );
    }
  }

  return buildResult(errors, warnings);
};

// =============================================
// ALLOCATION VALIDATION
// =============================================
export const validateAllocation = (
  asset: Asset,
  quantity: number,
  employeeId?: string | null,
  parentAssetId?: number | string | null,
  allocations?: LicenseAllocation[],
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must specify either employee or parent asset
  if (!employeeId && !parentAssetId) {
    errors.push(
      "Must specify either Employee (User) or Parent Asset to allocate to",
    );
  }

  // Cannot specify both
  if (employeeId && parentAssetId) {
    errors.push(
      "Cannot allocate to both Employee and Parent Asset simultaneously. Choose one.",
    );
  }

  // Asset must not be disposed
  if (isDisposed(asset)) {
    errors.push(
      `Cannot allocate disposed asset "${asset.assetName}". ` +
        `Status: ${asset.status}`,
    );
  }

  // Quantity validation
  if (quantity < 1) {
    errors.push("Allocation quantity must be at least 1");
  }

  // Check available quantity
  const totalQuantity = asset.totalQuantity || 1;
  const allocatedQuantity = asset.allocatedQuantity || 0;
  const availableQuantity = totalQuantity - allocatedQuantity;

  if (quantity > availableQuantity) {
    errors.push(
      `Insufficient quantity available. ` +
        `Requested: ${quantity}, Available: ${availableQuantity} of ${totalQuantity} total`,
    );
  }

  // Check for duplicate allocation
  if (allocations && (employeeId || parentAssetId)) {
    const duplicateAllocation = allocations.find((a) => {
      if (
        String(a.assetId) !== String(asset.id) ||
        a.status !== ALLOCATION_STATUS_DISPLAY.ACTIVE
      )
        return false;

      if (employeeId && a.employeeId === employeeId) return true;
      if (
        parentAssetId &&
        a.parentAssetId?.toString() === parentAssetId.toString()
      )
        return true;

      return false;
    });

    if (duplicateAllocation) {
      const target = employeeId
        ? `Employee ${duplicateAllocation.userName || employeeId}`
        : `Asset ${duplicateAllocation.parentAssetName || parentAssetId}`;

      errors.push(
        `This asset is already allocated to ${target}. ` +
          `Current allocation: ${duplicateAllocation.licensesAllocated || 1} unit(s). ` +
          `Please revoke the existing allocation first or update its quantity.`,
      );
    }
  }

  // Software license warnings
  if (isSoftwareLikeCategory(asset.category || "")) {
    if (
      asset.licenseExpiryDate &&
      new Date(asset.licenseExpiryDate) < new Date()
    ) {
      warnings.push(
        `This software license has expired (${formatDisplayDate(asset.licenseExpiryDate)}). ` +
          `Consider renewing before allocation.`,
      );
    }

    const remainingAfterAllocation = availableQuantity - quantity;
    if (remainingAfterAllocation < 2 && remainingAfterAllocation > 0) {
      warnings.push(
        `Only ${remainingAfterAllocation} license(s) will remain after this allocation. ` +
          `Consider purchasing more licenses.`,
      );
    }
  }

  // Parent asset validation
  if (parentAssetId) {
    // Note: Parent asset existence should be validated separately with actual parent data
    warnings.push("Ensure the parent asset exists and is not disposed");
  }

  return buildResult(errors, warnings);
};

// =============================================
// MAINTENANCE VALIDATION
// =============================================
export const validateMaintenance = (
  asset: Asset | null,
  scheduledDate: string,
  description: string,
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Asset must exist
  if (!asset) {
    errors.push(
      "Asset not found. Cannot schedule maintenance for non-existent asset.",
    );
    return buildResult(errors, warnings);
  }

  // Cannot schedule on disposed assets
  if (isDisposed(asset)) {
    errors.push(
      `Cannot schedule maintenance on disposed asset "${asset.assetName}". ` +
        `Status: ${asset.status}`,
    );
  }

  // Description required
  if (!description || !description.trim()) {
    errors.push("Maintenance Description is required");
  }

  if (description && description.length < 5) {
    errors.push("Maintenance Description must be at least 5 characters");
  }

  // Date validation
  if (!scheduledDate) {
    errors.push("Scheduled Date is required");
  } else {
    const schedDate = new Date(scheduledDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (schedDate < today) {
      warnings.push(
        "Scheduled date is in the past. This will be marked for immediate attention.",
      );
    }

    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    if (schedDate > oneYearFromNow) {
      warnings.push("Scheduled date is more than 1 year in the future");
    }
  }

  // Software assets don't typically need maintenance
  if (isSoftwareLikeCategory(asset.category || "")) {
    warnings.push(
      "Scheduling maintenance for software asset. " +
        "Consider if license renewal or update would be more appropriate.",
    );
  }

  return buildResult(errors, warnings);
};

// =============================================
// HELPER FUNCTIONS
// =============================================

/**
 * Get valid status transitions based on current status and allocation count
 */
function getValidStatusTransitions(
  currentStatus: string,
  allocatedCount: number,
): string[] {
  const transitions: Record<string, string[]> = {
    [ASSET_STATUS.AVAILABLE]: [
      ASSET_STATUS.ALLOCATED,
      ASSET_STATUS.PARTIALLY_ALLOCATED,
      ASSET_STATUS.UNDER_MAINTENANCE,
      ASSET_STATUS.DISPOSED,
    ],
    [ASSET_STATUS.ALLOCATED]: [
      ASSET_STATUS.AVAILABLE,
      ASSET_STATUS.UNDER_MAINTENANCE,
      ASSET_STATUS.DISPOSED,
    ],
    [ASSET_STATUS.PARTIALLY_ALLOCATED]: [
      ASSET_STATUS.AVAILABLE,
      ASSET_STATUS.ALLOCATED,
      ASSET_STATUS.UNDER_MAINTENANCE,
      ASSET_STATUS.DISPOSED,
    ],
    [ASSET_STATUS.UNDER_MAINTENANCE]: [
      ASSET_STATUS.AVAILABLE,
      ASSET_STATUS.ALLOCATED,
      ASSET_STATUS.PARTIALLY_ALLOCATED,
      ASSET_STATUS.DISPOSED,
    ],
    [ASSET_STATUS.DISPOSED]: [], // Cannot transition from disposed state
  };

  let valid = transitions[currentStatus] || [];

  // Cannot transition to Allocated/Partially Allocated if no allocations
  if (allocatedCount === 0) {
    valid = valid.filter(
      (s) =>
        s !== ASSET_STATUS.ALLOCATED && s !== ASSET_STATUS.PARTIALLY_ALLOCATED,
    );
  }

  return valid;
}
