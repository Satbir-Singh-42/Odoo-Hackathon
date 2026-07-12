'use client';

import { useState, useEffect, useRef, useMemo } from "react";
import { X, Save, AlertTriangle, Plus, Minus } from "lucide-react";
import { z } from "zod";
import { assetSchema } from "@/lib/validations";
import { Asset, Vendor, Category, LicenseAllocation } from '@/types';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import dataService from '@/lib/dataService';
import { useDebounce } from '@/hooks/useDebounce';
import { toDateInputValue } from '@/lib/utils/dateHelpers';
import {
  ASSET_CONDITIONS,
  DEFAULT_CONDITION,
  ASSET_CATEGORIES,
  ASSET_STATUS,
  isSoftwareLikeCategory,
  hasHardwareSpecs,
  hasNetworkingSpecs,
  hasDeploymentFields,
  RAM_OPTIONS,
  STORAGE_OPTIONS,
} from '@/config/constants';

const BLOCK_CHARS_INT = ["-", "e", "E", "+", "."];
const BLOCK_CHARS_DEC = ["-", "e", "E", "+"];
const blockKeys =
  (chars: string[]) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (chars.includes(e.key)) e.preventDefault();
  };
const blurOnWheel = (e: React.WheelEvent<HTMLInputElement>) =>
  e.currentTarget.blur();
const NUM_INPUT_CLS =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

interface AssetFormProps {
  asset: Asset | null;
  vendors: Vendor[];
  assets?: Asset[]; // Added for Asset-to-Asset allocation
  categories?: Category[];
  allocations?: LicenseAllocation[]; // For validation
  hasAllocatedChildren?: boolean; // True when bulk parent has at least one allocated child
  onSave: (asset: Partial<Asset>) => void;
  onCancel: () => void;
  currentUser?: { role?: string; managedCategories?: string[] };
}

const getDefaultFormData = (): Partial<Asset> => ({
  assetCode: "",
  assetName: "",
  category: "",
  assetType: "",
  invoiceNumber: "",
  invoiceDate: "",
  vendorId: "",
  vendorName: "",
  purchasePrice: null,
  purchaseNumber: "",
  prNumber: "",
  importBillUrl: "",
  serialNumber: "",
  model: "",
  ram: "",
  storage: "",
  processor: "",
  macAddress: "",
  licenseExpiryDate: "",
  totalQuantity: 1,
  licenseType: null,
  portCount: null,
  portSpeed: "",
  status: ASSET_STATUS.AVAILABLE,
  condition: DEFAULT_CONDITION,
  disposalDate: null,
});

const getDocumentIdFromUrl = (url?: string | null) => {
  if (!url) return null;
  const match = url.match(/\/(?:api\/)?documents\/(?:doc)?([a-zA-Z0-9-]+)/i);
  return match ? match[1] : null;
};

export function AssetForm({
  asset,
  vendors,
  assets = [] as Asset[],
  categories = [
    { id: ASSET_CATEGORIES.HARDWARE },
    { id: ASSET_CATEGORIES.SOFTWARE },
    { id: ASSET_CATEGORIES.NETWORKING },
  ] as Category[],
  allocations = [] as LicenseAllocation[],
  hasAllocatedChildren = false,
  onSave,
  onCancel,
  currentUser,
}: AssetFormProps) {
  const canCreateCategory = currentUser?.role === "Admin" || (currentUser?.managedCategories && currentUser.managedCategories.includes("ALL"));

  // Filter categories for managers with limited category access
  const visibleCategories = useMemo(() => {
    const mc = currentUser?.managedCategories;
    if (!mc || mc.length === 0 || mc.includes("ALL") || currentUser?.role === "Admin") {
      return categories;
    }
    const normalizedMC = mc.map((c) => c.trim().toLowerCase());
    return categories.filter((cat) =>
      normalizedMC.includes(cat.id.trim().toLowerCase()),
    );
  }, [categories, currentUser?.managedCategories, currentUser?.role]);

  // Bulk parent lock logic:
  // - identityLocked: identity & purchase fields locked (when bulk children are allocated)
  const isBulkParent = !!asset?.isBulkOrder;
  const currentAssetId = asset?.id ? String(asset.id) : "";
  const childUnitIds = isBulkParent
    ? assets
        .filter((a) => String(a.bulkOrderParentId || "") === currentAssetId)
        .map((a) => String(a.id))
    : [];
  const lockScopeAssetIds = new Set(
    currentAssetId ? [currentAssetId, ...childUnitIds] : [],
  );

  const hasActiveAllocations =
    !!asset &&
    allocations.some((alloc) => {
      const status = String(alloc.status || "").toUpperCase();
      if (status !== "ACTIVE") return false;

      const allocatedAssetId = String(alloc.assetId || "");
      const parentAllocatedToId =
        alloc.parentAssetId != null ? String(alloc.parentAssetId) : "";

      return (
        lockScopeAssetIds.has(allocatedAssetId) ||
        (!!parentAllocatedToId && lockScopeAssetIds.has(parentAllocatedToId))
      );
    });

  const allocationLock = Boolean(asset && hasActiveAllocations);
  const identityLocked = isBulkParent && hasAllocatedChildren;
  const coreIdentityLocked = allocationLock || identityLocked;
  const isBulkChild = !!asset?.parentAssetId && !asset.isBulkOrder;
  const lockedFieldCls = "bg-gray-100 cursor-not-allowed opacity-75";
  const [formData, setFormData] = useState<
    Partial<Asset> & { _importBillFile?: string }
  >(getDefaultFormData);

  const [assetTypeOptions, setAssetTypeOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showBulkWarning, setShowBulkWarning] = useState(false);
  const [renewalCost, setRenewalCost] = useState<number | null>(null);
  const [importBillUploading, setImportBillUploading] = useState(false);
  const pendingFinalData = useRef<Partial<Asset> | null>(null);
  const formScrollRef = useRef<HTMLDivElement>(null);

  const debouncedAssetCode = useDebounce(formData.assetCode, 500);
  const debouncedSerial = useDebounce(formData.serialNumber, 500);

  // Real-time Debounced Validation for Asset Code
  useEffect(() => {
    if (asset) return; // Skip validation when editing

    const code = debouncedAssetCode?.trim();
    if (!code || code.length < 3) {
      setErrors((prev) => {
        if (
          !prev.assetCode?.includes("already in use") &&
          !prev.assetCode?.includes("already exists")
        )
          return prev;
        const next = { ...prev };
        delete next.assetCode;
        return next;
      });
      return;
    }

    // Client-side duplicate check against loaded assets
    const isDuplicateLocal = (assets as Asset[]).some(
      (a) => a.assetCode?.toLowerCase() === code.toLowerCase(),
    );

    setErrors((prev) => {
      const next = { ...prev };
      if (isDuplicateLocal) {
        next.assetCode =
          "This Asset Code is already in use. Please use a unique code.";
      } else if (
        next.assetCode?.includes("already in use") ||
        next.assetCode?.includes("already exists")
      ) {
        delete next.assetCode;
      }
      return next;
    });
  }, [debouncedAssetCode, assets, asset]);

  // Real-time Debounced Validation for Serial Number
  useEffect(() => {
    const serial = debouncedSerial?.trim();
    if (
      !serial ||
      serial.length < 3 ||
      isSoftwareLikeCategory(formData.category || "")
    ) {
      setErrors((prev) => {
        if (
          !prev.serialNumber?.includes("already in use") &&
          !prev.serialNumber?.includes("already exists")
        )
          return prev;
        const next = { ...prev };
        delete next.serialNumber;
        return next;
      });
      return;
    }

    // Client-side duplicate check against loaded assets
    const isDuplicateLocal = (assets as Asset[]).some(
      (a) =>
        a.serialNumber?.toLowerCase() === serial.toLowerCase() &&
        a.id !== asset?.id,
    );

    setErrors((prev) => {
      const next = { ...prev };
      if (isDuplicateLocal) {
        next.serialNumber = "This Serial Number is already in use.";
      } else if (
        next.serialNumber?.includes("already in use") ||
        next.serialNumber?.includes("already exists")
      ) {
        delete next.serialNumber;
      }
      return next;
    });
  }, [debouncedSerial, assets, asset, formData.category]);

  const initializedAssetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (asset) {
      // Prevent background data polling from wiping out the user's unsaved form progress
      if (initializedAssetIdRef.current !== String(asset.id)) {
        setFormData({
          ...getDefaultFormData(),
          ...asset,
          // Ensure fields that may arrive as non-string from API are coerced
          macAddress: asset.macAddress != null ? String(asset.macAddress) : "",
          serialNumber:
            asset.serialNumber != null ? String(asset.serialNumber) : "",
        });
        initializedAssetIdRef.current = String(asset.id);
        // Reset renewal state
        setRenewalCost(null);
      }
    } else {
      if (initializedAssetIdRef.current !== null) {
        setFormData(getDefaultFormData());
        initializedAssetIdRef.current = null;
        setRenewalCost(null);
      }
    }
  }, [asset]);

  const previousExpiryValue = asset
    ? toDateInputValue(asset.licenseExpiryDate)
    : "";
  const currentExpiryValue = toDateInputValue(formData.licenseExpiryDate);
  const showRenewalCostField = Boolean(
    asset &&
    isSoftwareLikeCategory(formData.category || "") &&
    previousExpiryValue &&
    currentExpiryValue &&
    currentExpiryValue > previousExpiryValue,
  );

  // Fetch asset types when category changes
  useEffect(() => {
    const fetchTypes = async () => {
      if (formData.category) {
        const isKnownCategory = categories.some(
          (c) => c.id === formData.category,
        );
        if (!isKnownCategory) {
          setAssetTypeOptions([]);
          return;
        }
        try {
          const types = await dataService.getAssetTypes(formData.category);
          setAssetTypeOptions(types);
        } catch (err) {
          // Silently fail - asset type dropdown will be empty
        }
      }
    };
    fetchTypes();
  }, [formData.category, categories]);

  const handleVendorChange = (vendorId: string) => {
    const vendor = vendors.find((v) => v.id === vendorId);
    setFormData((prev) => ({
      ...prev,
      vendorId,
      vendorName: vendor?.vendorName || "",
    }));
    if (errors.vendorId) setErrors((prev) => ({ ...prev, vendorId: "" }));
  };

  const validateForm = (): boolean => {
    let newErrors: Record<string, string> = {};

    try {
      assetSchema.parse(formData);
    } catch (err) {
      if (err instanceof z.ZodError) {
        err.errors.forEach(e => {
          if (e.path[0]) newErrors[e.path[0].toString()] = e.message;
        });
      }
    }

    // Check for duplicate Asset Code (client-side check against loaded assets)
    const isDuplicate = assets.some(
      (a) =>
        a.assetCode?.toLowerCase() === formData.assetCode?.toLowerCase() &&
        a.id !== asset?.id, // Exclude current asset when editing
    );
    if (isDuplicate) {
      newErrors.assetCode =
        "This Asset Code is already in use. Please use a unique code.";
    }

    // Check for duplicate Serial Number (for non-software categories)
    if (
      !isSoftwareLikeCategory(formData.category || "") &&
      formData.serialNumber?.trim()
    ) {
      const isDuplicateSerial = assets.some(
        (a) =>
          a.serialNumber?.toLowerCase() ===
            formData.serialNumber?.toLowerCase() && a.id !== asset?.id,
      );
      if (isDuplicateSerial) {
        newErrors.serialNumber =
          "This Serial Number is already in use by another asset.";
      }
    }

    // Check for duplicate MAC Address (for non-software categories with quantity=1)
    const macStr =
      formData.macAddress != null ? String(formData.macAddress).trim() : "";
    if (
      hasDeploymentFields(formData.category || "") &&
      macStr &&
      (!formData.totalQuantity || formData.totalQuantity === 1)
    ) {
      const isDuplicateMac = assets.some(
        (a) =>
          String(a.macAddress || "").toLowerCase() === macStr.toLowerCase() &&
          a.id !== asset?.id,
      );
      if (isDuplicateMac) {
        newErrors.macAddress =
          "This MAC Address is already in use by another asset.";
      }
    }

    // Business rule validations
    if (isSoftwareLikeCategory(formData.category || "")) {
      if (!formData.licenseType) {
        newErrors.licenseType = "License Type is required for Software";
      }
      if (
        ["SUBSCRIPTION", "SAAS", "TRIAL"].includes(
          formData.licenseType || "",
        ) &&
        !formData.licenseExpiryDate
      ) {
        newErrors.licenseExpiryDate =
          "License Expiry Date is required for this license type";
      }
    }

    // Validate invoice date is not in the future
    if (formData.invoiceDate) {
      const invoiceDate = new Date(formData.invoiceDate);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (isNaN(invoiceDate.getTime())) {
        newErrors.invoiceDate = "Invalid date format";
      } else if (invoiceDate > today) {
        newErrors.invoiceDate = "Invoice date cannot be in the future";
      }
    }

    // Validate quantity reduction doesn't go below allocated count
    if (asset && formData.totalQuantity !== undefined) {
      const activeAllocations = allocations.filter(
        (alloc) =>
          String(alloc.assetId) === String(asset.id) &&
          alloc.status === "Active",
      );
      const allocatedCount = activeAllocations.reduce(
        (sum, alloc) => sum + (alloc.licensesAllocated || 1),
        0,
      );
      if (formData.totalQuantity < allocatedCount) {
        newErrors.totalQuantity = `Cannot reduce quantity below ${allocatedCount} (currently allocated). Revoke allocations first.`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const form = e.currentTarget as HTMLFormElement;
    if (!form.reportValidity()) {
      return;
    }

    // Validate before saving
    if (!validateForm()) {
      // Scroll to the first error field so the user can see what went wrong
      setTimeout(() => {
        const container = formScrollRef.current;
        if (!container) return;
        // Find the first visibly-errored field using existing red-border/text styling
        const firstError = container.querySelector<HTMLElement>(
          ".border-red-500, .text-red-500, .text-red-600",
        );
        if (firstError) {
          firstError
            .closest("div")
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 50);
      return;
    }

    let finalImportBillUrl = formData.importBillUrl;
    const existingDocumentId = getDocumentIdFromUrl(asset?.importBillUrl);
    if (formData._importBillFile) {
      try {
        const uploadResult = await dataService.uploadImportBill(
          formData._importBillFile as unknown as File,
          existingDocumentId || undefined,
        );
        finalImportBillUrl = uploadResult.url;
      } catch (err) {
        console.error("Failed to upload import bill", err);
        setErrors((prev) => ({
          ...prev,
          importBillUrl: "Failed to upload document",
        }));
        return;
      }
    }

    const finalData = {
      ...formData,
      importBillUrl: finalImportBillUrl,
      // Sanitize date fields to ensure empty strings are sent as null
      invoiceDate: formData.invoiceDate ? formData.invoiceDate : null,
      licenseExpiryDate: formData.licenseExpiryDate
        ? formData.licenseExpiryDate
        : null,
      // Ensure numeric fields are numbers or null (though state usually handles this)
      purchasePrice: formData.purchasePrice ?? null,
      // Storage is now stored directly — no more hddCapacity/hddType composite
      storage: formData.storage,
      // Pass renewal expense data if enabled
      ...(showRenewalCostField && renewalCost !== null && renewalCost > 0
        ? {
            renewalCost: renewalCost,
            isRenewalRecord: true,
          }
        : {}),
    };

    // Remove temporary file field
    delete (finalData as any)._importBillFile;

    // Frontend safety guard: keep restricted fields unchanged while asset has active allocations.
    if (asset && allocationLock) {
      finalData.assetName = asset.assetName;
      finalData.category = asset.category;
      finalData.assetType = asset.assetType;
      finalData.vendorId = asset.vendorId;
      finalData.vendorName = asset.vendorName;
    }

    // Strip totalQuantity from bulk assets to avoid backend rejection
    if (asset?.isBulkOrder) {
      delete finalData.totalQuantity;
    }

    // If editing a bulk parent, show warning before proceeding
    if (asset?.isBulkOrder) {
      pendingFinalData.current = finalData;
      setShowBulkWarning(true);
      return;
    }

    onSave(finalData);
  };

  const handleBulkWarningConfirm = () => {
    if (pendingFinalData.current) {
      onSave(pendingFinalData.current);
      pendingFinalData.current = null;
    }
    setShowBulkWarning(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto animate-in fade-in duration-200"
      onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[95dvh] sm:max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between rounded-t-xl z-10 shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">
            {asset ? "Edit Asset" : "Add New Asset"}
          </h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div
            ref={formScrollRef}
            className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-4 sm:space-y-6 modal-safe-bottom">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div className="md:col-span-2">
                <h3 className="text-sm font-bold text-gray-900 border-b pb-2 uppercase tracking-wide">
                  Core Identification
                </h3>
              </div>
              <div>
                <label className="ui-form-label">Asset Code *</label>
                <input
                  type="text"
                  required
                  maxLength={20}
                  readOnly={!!asset}
                  disabled={!!asset}
                  value={formData.assetCode || ""}
                  onChange={(e) => {
                    if (asset) return; // Prevent changes when editing
                    setFormData((prev) => ({
                      ...prev,
                      assetCode: e.target.value.toUpperCase(), // Auto uppercase
                    }));
                    // Don't clear validation errors immediately; the debounce effect handles it
                    if (
                      errors.assetCode &&
                      !errors.assetCode.includes("already in use") &&
                      !errors.assetCode.includes("already exists")
                    ) {
                      setErrors((prev) => ({
                        ...prev,
                        assetCode: "",
                      }));
                    }
                  }}
                  title={
                    asset ? "Asset Code cannot be changed after creation" : ""
                  }
                  className={`w-full h-9 sm:h-10 px-3 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal transition-all ${
                    asset
                      ? "bg-gray-100 cursor-not-allowed opacity-75 text-gray-600"
                      : errors.assetCode
                        ? "border-red-500 bg-white"
                        : "border-gray-300 bg-white"
                  }`}
                  placeholder="e.g. HW001, SW002"
                />
                {asset && (
                  <p className="text-xs text-gray-400 mt-1">
                    Asset Code is locked after creation
                  </p>
                )}
                {!asset && errors.assetCode && (
                  <p className="text-xs text-red-500 mt-1 font-medium">
                    {errors.assetCode}
                  </p>
                )}
              </div>
              <div>
                <label className="ui-form-label">Asset Name *</label>
                <input
                  type="text"
                  required
                  maxLength={150}
                  disabled={coreIdentityLocked}
                  value={formData.assetName || ""}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      assetName: e.target.value,
                    }));
                    if (errors.assetName)
                      setErrors((prev) => ({
                        ...prev,
                        assetName: "",
                      }));
                  }}
                  className={`w-full h-9 sm:h-10 px-3 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white ${coreIdentityLocked ? lockedFieldCls : ""} ${errors.assetName ? "border-red-500" : "border-gray-300"}`}
                />
                {errors.assetName && (
                  <p className="text-xs text-red-500 mt-1 font-medium">
                    {errors.assetName}
                  </p>
                )}
                {allocationLock && !errors.assetName && (
                  <p className="text-xs text-gray-400 mt-1">
                    Locked while asset has active allocations.
                  </p>
                )}
              </div>
              <div>
                <label className="ui-form-label">Category *</label>
                <SearchableSelect
                  required
                  disabled={coreIdentityLocked}
                  value={formData.category || ""}
                  onChange={(val) => {
                    setFormData((prev) => ({
                      ...prev,
                      category: val,
                      categoryId: val,
                    }));
                    if (errors.category)
                      setErrors((prev) => ({
                        ...prev,
                        category: "",
                      }));
                  }}
                  options={visibleCategories.map((c) => ({
                    value: c.name || c.id,
                    label: c.name || c.id,
                  }))}
                  placeholder={canCreateCategory ? "Select or type new category..." : "Select a category..."}
                  creatable={canCreateCategory}
                />
                {allocationLock ? (
                  <p className="text-xs text-gray-400 mt-1">
                    Locked while asset has active allocations.
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">
                    {canCreateCategory ? "Type to search or create a custom category" : "Select a category from your managed list"}
                  </p>
                )}
              </div>
              <div>
                <label className="ui-form-label">Asset Type *</label>
                <SearchableSelect
                  required
                  disabled={coreIdentityLocked || !formData.category}
                  value={formData.assetType || ""}
                  onChange={(val) => {
                    setFormData((prev) => ({
                      ...prev,
                      assetType: val,
                    }));
                    if (errors.assetType)
                      setErrors((prev) => ({
                        ...prev,
                        assetType: "",
                      }));
                  }}
                  options={assetTypeOptions}
                  placeholder="Select or type new asset type..."
                  creatable={true}
                />
                {allocationLock ? (
                  <p className="text-xs text-gray-400 mt-1">
                    Locked while asset has active allocations.
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">
                    Type to search or create a custom asset type
                  </p>
                )}
              </div>

              {!isSoftwareLikeCategory(formData.category || "") && (
                <div className="relative group">
                  <label className="ui-form-label">Total Quantity *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    disabled={asset?.isBulkOrder}
                    title={
                      asset?.isBulkOrder
                        ? "Bulk Parent quantity cannot be changed manually. Manage child units instead."
                        : ""
                    }
                    value={
                      formData.totalQuantity !== null &&
                      formData.totalQuantity !== undefined
                        ? formData.totalQuantity
                        : ""
                    }
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setFormData((prev) => ({
                        ...prev,
                        totalQuantity: isNaN(val)
                          ? undefined
                          : Math.max(1, val),
                      }));
                      // Clear quantity error when user changes value
                      if (errors.totalQuantity) {
                        setErrors((prev) => ({ ...prev, totalQuantity: "" }));
                      }
                    }}
                    onKeyDown={blockKeys(BLOCK_CHARS_INT)}
                    onWheel={blurOnWheel}
                    placeholder="1"
                    className={`w-full h-9 sm:h-10 px-3 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white ${NUM_INPUT_CLS} transition-all ${
                      asset?.isBulkOrder
                        ? "bg-gray-100 cursor-not-allowed opacity-75"
                        : errors.totalQuantity
                          ? "border-red-500"
                          : "border-gray-300"
                    }`}
                  />
                  {errors.totalQuantity && (
                    <p className="text-xs text-red-500 mt-1 font-medium">
                      {errors.totalQuantity}
                    </p>
                  )}
                  {asset?.isBulkOrder && (
                    <p className="text-xs text-gray-400 mt-1">
                      Quantity locked for bulk parent. Manage via individual
                      units.
                    </p>
                  )}
                </div>
              )}

              {!isSoftwareLikeCategory(formData.category || "") &&
                (!formData.totalQuantity || formData.totalQuantity === 1) && (
                  <div>
                    <label className="ui-form-label">Serial Number</label>
                    <input
                      type="text"
                      maxLength={50}
                      value={formData.serialNumber || ""}
                      onChange={(e) => {
                        setFormData((prev) => ({
                          ...prev,
                          serialNumber: e.target.value,
                        }));
                        if (
                          errors.serialNumber &&
                          !errors.serialNumber.includes("already in use") &&
                          !errors.serialNumber.includes("already exists")
                        ) {
                          setErrors((prev) => ({
                            ...prev,
                            serialNumber: "",
                          }));
                        }
                      }}
                      className={`w-full h-9 sm:h-10 px-3 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white transition-all ${errors.serialNumber ? "border-red-500" : "border-gray-300"}`}
                      placeholder="Unique Serial Number"
                    />
                    {errors.serialNumber && (
                      <p className="text-xs text-red-500 mt-1 font-medium">
                        {errors.serialNumber}
                      </p>
                    )}
                  </div>
                )}

              {/* Only show Allocation for single quantity assets */}

              {isSoftwareLikeCategory(formData.category || "") && (
                <>
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-bold text-gray-900 border-b pb-2 uppercase tracking-wide">
                      Software & Licensing
                    </h3>
                  </div>
                  <div>
                    <label className="ui-form-label">License Type *</label>
                    <SearchableSelect
                      required
                      value={formData.licenseType || ""}
                      onChange={(val) =>
                        setFormData((prev) => ({
                          ...prev,
                          licenseType: val as Asset["licenseType"],
                          ...(val === "PERPETUAL"
                            ? { licenseExpiryDate: "" }
                            : {}),
                        }))
                      }
                      options={[
                        {
                          value: "PERPETUAL",
                          label: "Perpetual",
                        },
                        {
                          value: "SUBSCRIPTION",
                          label: "Subscription",
                        },
                        { value: "SAAS", label: "SaaS" },
                        { value: "VOLUME", label: "Volume" },
                        {
                          value: "ENTERPRISE",
                          label: "Enterprise",
                        },
                      ]}
                      placeholder="Select type"
                    />{" "}
                  </div>

                  <div className="min-w-0">
                    <label className="ui-form-label">License Expiry Date</label>
                    <input
                      type="date"
                      value={toDateInputValue(formData.licenseExpiryDate)}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          licenseExpiryDate: e.target.value,
                        }))
                      }
                      disabled={
                        (formData.licenseType as string) === "PERPETUAL"
                      }
                      required={["SUBSCRIPTION", "SAAS", "TRIAL"].includes(
                        formData.licenseType || "",
                      )}
                      className={`ui-control block w-full min-w-0 max-w-full box-border h-9 sm:h-10 px-3 text-sm font-normal transition-all ${
                        (formData.licenseType as string) === "PERPETUAL"
                          ? "bg-gray-100 cursor-not-allowed opacity-75"
                          : "bg-white cursor-pointer"
                      } ${formData.licenseExpiryDate && new Date(formData.licenseExpiryDate) < new Date(new Date().setHours(0, 0, 0, 0)) ? "border-red-500 text-red-600 focus:ring-red-500" : ""}`}
                    />
                    {formData.licenseExpiryDate &&
                      new Date(formData.licenseExpiryDate) <
                        new Date(new Date().setHours(0, 0, 0, 0)) && (
                        <p className="text-xs text-red-500 mt-1 font-medium flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> License Expired
                        </p>
                      )}
                    {(formData.licenseType as string) === "PERPETUAL" && (
                      <p className="text-xs text-gray-400 mt-1">
                        Not required for perpetual licenses. Existing expiry is
                        cleared.
                      </p>
                    )}
                  </div>

                  {/* Renewal Cost (shown only when expiry date increases) */}
                  {showRenewalCostField && (
                    <div>
                      <label className="ui-form-label">Renewal Cost (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={renewalCost ?? ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setRenewalCost(isNaN(val) ? null : val);
                        }}
                        onKeyDown={blockKeys(BLOCK_CHARS_DEC)}
                        onWheel={blurOnWheel}
                        placeholder="0"
                        className={`w-full h-9 sm:h-10 px-3 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white ${NUM_INPUT_CLS}`}
                      />
                    </div>
                  )}

                  <div>
                    <div className="relative group">
                      <label className="ui-form-label">Total Licenses</label>
                      <input
                        type="number"
                        min="1"
                        disabled={asset?.isBulkOrder}
                        title={
                          asset?.isBulkOrder
                            ? "Bulk Parent quantity cannot be changed manually. Manage child units instead."
                            : ""
                        }
                        value={formData.totalQuantity || 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setFormData((prev) => ({
                            ...prev,
                            totalQuantity: isNaN(val) ? 0 : Math.max(1, val),
                          }));
                          // Clear quantity error when user changes value
                          if (errors.totalQuantity) {
                            setErrors((prev) => ({
                              ...prev,
                              totalQuantity: "",
                            }));
                          }
                        }}
                        onKeyDown={blockKeys(BLOCK_CHARS_INT)}
                        onWheel={blurOnWheel}
                        className={`w-full h-9 sm:h-10 px-3 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white transition-all ${NUM_INPUT_CLS} ${
                          asset?.isBulkOrder
                            ? "bg-gray-100 cursor-not-allowed opacity-75"
                            : errors.totalQuantity
                              ? "border-red-500"
                              : "border-gray-300"
                        }`}
                      />
                      {errors.totalQuantity && (
                        <p className="text-xs text-red-500 mt-1 font-medium">
                          {errors.totalQuantity}
                        </p>
                      )}
                      {asset?.isBulkOrder && (
                        <p className="text-xs text-gray-400 mt-1">
                          Quantity locked for bulk parent. Manage via individual
                          units.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Status & Condition */}
              <div className="md:col-span-2">
                <h3 className="text-sm font-bold text-gray-900 border-b pb-2 uppercase tracking-wide">
                  Status & Condition
                </h3>
              </div>

              {/* Status Display */}
              <div className="md:col-span-1">
                <label className="ui-form-label">Current Status</label>
                <div className="h-9 sm:h-10 px-3 flex items-center bg-gray-50 border rounded-lg text-sm font-medium text-gray-600">
                  {formData.status}
                </div>
              </div>

              {/* Condition Dropdown */}
              <div className="md:col-span-1">
                <label className="ui-form-label">Condition</label>
                <SearchableSelect
                  value={formData.condition ?? ""}
                  onChange={(val) =>
                    setFormData((prev) => ({
                      ...prev,
                      condition: val as Asset["condition"],
                    }))
                  }
                  options={Object.values(ASSET_CONDITIONS).map((cond) => ({
                    value: cond,
                    label: cond,
                  }))}
                  placeholder="Select condition"
                />
                {isBulkParent && (
                  <p className="text-xs text-gray-400 mt-1">
                    Changing condition here will override available child units.
                  </p>
                )}
              </div>

              <div className="md:col-span-2">
                <h3 className="text-sm font-bold text-gray-900 border-b pb-2 uppercase tracking-wide">
                  Purchase Information
                </h3>
              </div>
              <div>
                <label className="ui-form-label">Invoice Number</label>
                <input
                  type="text"
                  maxLength={50}
                  value={formData.invoiceNumber || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      invoiceNumber: e.target.value,
                    }))
                  }
                  className="w-full h-9 sm:h-10 px-3 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white"
                  placeholder="INV-001"
                />
              </div>
              <div className="min-w-0">
                <label className="ui-form-label">Invoice Date</label>
                <input
                  type="date"
                  value={toDateInputValue(formData.invoiceDate)}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      invoiceDate: e.target.value,
                    }));
                    if (errors.invoiceDate)
                      setErrors((prev) => ({ ...prev, invoiceDate: "" }));
                  }}
                  className={`ui-control block w-full min-w-0 max-w-full box-border h-9 sm:h-10 px-3 text-sm font-normal transition-all bg-white cursor-pointer ${errors.invoiceDate ? "border-red-500" : ""}`}
                />
                {errors.invoiceDate && (
                  <p className="text-xs text-red-500 mt-1 font-medium">
                    {errors.invoiceDate}
                  </p>
                )}
              </div>
              <div>
                <label className="ui-form-label">Vendor *</label>
                <SearchableSelect
                  required
                  disabled={coreIdentityLocked}
                  value={formData.vendorId || ""}
                  onChange={(val) => handleVendorChange(val)}
                  options={vendors
                    .filter((v) => !v.isBlocked || v.id === formData.vendorId)
                    .map((v) => ({
                      value: v.id,
                      label: `${v.vendorName} (${v.id})${v.isBlocked ? ' (Blocked)' : ''}`,
                    }))}
                  placeholder="Select vendor"
                />
                {allocationLock && (
                  <p className="text-xs text-gray-400 mt-1">
                    Locked while asset has active allocations.
                  </p>
                )}
              </div>
              <div>
                <label className="ui-form-label">Purchase Price (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={coreIdentityLocked && Boolean(asset?.purchasePrice)}
                  value={
                    formData.purchasePrice !== null &&
                    formData.purchasePrice !== undefined
                      ? formData.purchasePrice
                      : ""
                  }
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setFormData((prev) => ({
                      ...prev,
                      purchasePrice: isNaN(val) ? null : Math.max(0, val),
                    }));
                  }}
                  onKeyDown={blockKeys(BLOCK_CHARS_DEC)}
                  onWheel={blurOnWheel}
                  placeholder="0"
                  className={`w-full h-9 sm:h-10 px-3 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white ${NUM_INPUT_CLS} ${coreIdentityLocked && Boolean(asset?.purchasePrice) ? lockedFieldCls : ""}`}
                />
                {coreIdentityLocked && Boolean(asset?.purchasePrice) && (
                  <p className="text-xs text-gray-400 mt-1">
                    Locked because asset is already established with a price.
                  </p>
                )}
              </div>
              <div>
                <label className="ui-form-label">Purchase Number (PO)</label>
                <input
                  type="text"
                  maxLength={50}
                  value={formData.purchaseNumber || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      purchaseNumber: e.target.value,
                    }))
                  }
                  className="w-full h-9 sm:h-10 px-3 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white"
                  placeholder="PO number"
                />
              </div>
              <div>
                <label className="ui-form-label">PR Number</label>
                <input
                  type="text"
                  maxLength={50}
                  value={formData.prNumber || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      prNumber: e.target.value,
                    }))
                  }
                  className="w-full h-9 sm:h-10 px-3 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white"
                  placeholder="Purchase Request number"
                />
              </div>
              <div>
                <label className="ui-form-label">Import Bill (Upload)</label>
                {formData.importBillUrl ? (
                  <div className="flex items-center gap-2">
                    <a
                      href={formData.importBillUrl.startsWith("blob:") ? formData.importBillUrl : `${formData.importBillUrl}?token=${sessionStorage.getItem("inventoryToken") || localStorage.getItem("inventoryToken") || ""}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline truncate flex-1">
                      {formData.importBillUrl.split("/").pop() || "View File"}
                    </a>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, importBillUrl: "" }))
                      }
                      className="text-xs text-red-500 hover:text-red-700 font-medium shrink-0 disabled:opacity-50">
                      Remove
                    </button>
                  </div>
                ) : (
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        // Revoke previous object URL to prevent memory leak
                        if (formData.importBillUrl?.startsWith("blob:")) {
                          URL.revokeObjectURL(formData.importBillUrl);
                        }
                        // Store as a local object URL for preview; real upload handled by backend
                        const url = URL.createObjectURL(file);
                        setFormData((prev) => ({
                          ...prev,
                          importBillUrl: url,
                          _importBillFile: file as unknown as string,
                        }));
                      }
                    }}
                    className="w-full h-9 sm:h-10 px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                )}
                {errors.importBillUrl && (
                  <p className="text-xs text-red-500 mt-1 font-medium">
                    {errors.importBillUrl}
                  </p>
                )}
              </div>

              {(hasHardwareSpecs(formData.category || "") ||
                formData.processor ||
                formData.ram ||
                formData.storage) && (
                <>
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-bold text-gray-900 border-b pb-2 uppercase tracking-wide">
                      Technical Specifications
                    </h3>
                  </div>

                  <div>
                    <label className="ui-form-label">Model</label>
                    <input
                      type="text"
                      maxLength={50}
                      value={formData.model || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          model: e.target.value,
                        }))
                      }
                      className="w-full h-9 sm:h-10 px-3 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white transition-all"
                    />
                  </div>

                  <div>
                    <label className="ui-form-label">RAM</label>
                    <SearchableSelect
                      value={formData.ram || ""}
                      onChange={(val) =>
                        setFormData((prev) => ({
                          ...prev,
                          ram: val,
                        }))
                      }
                      options={RAM_OPTIONS}
                      creatable={true}
                      placeholder="e.g. 16GB"
                    />
                  </div>
                  <div>
                    <label className="ui-form-label">Storage</label>
                    <SearchableSelect
                      value={formData.storage || ""}
                      onChange={(val) =>
                        setFormData((prev) => ({
                          ...prev,
                          storage: val,
                        }))
                      }
                      options={STORAGE_OPTIONS}
                      creatable={true}
                      placeholder="e.g. 512GB SSD"
                    />
                  </div>

                  <div>
                    <label className="ui-form-label">Processor</label>
                    <input
                      type="text"
                      maxLength={50}
                      value={formData.processor || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          processor: e.target.value,
                        }))
                      }
                      className="w-full h-9 sm:h-10 px-3 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white transition-all"
                      placeholder="e.g. i7-12700K"
                    />
                  </div>
                  {(!formData.totalQuantity ||
                    formData.totalQuantity === 1) && (
                    <div>
                      <label className="ui-form-label">MAC Address</label>
                      <input
                        type="text"
                        maxLength={20}
                        value={formData.macAddress || ""}
                        onChange={(e) => {
                          setFormData((prev) => ({
                            ...prev,
                            macAddress: e.target.value.toUpperCase(),
                          }));
                          if (errors.macAddress) {
                            setErrors((prev) => ({
                              ...prev,
                              macAddress: "",
                            }));
                          }
                        }}
                        onBlur={(e) => {
                          const mac = e.target.value.trim();
                          if (mac) {
                            const isDuplicateLocal = (assets as Asset[]).some(
                              (a) =>
                                String(a.macAddress || "").toLowerCase() ===
                                  mac.toLowerCase() && a.id !== asset?.id,
                            );
                            if (isDuplicateLocal) {
                              setErrors((prev) => ({
                                ...prev,
                                macAddress:
                                  "This MAC Address is already in use.",
                              }));
                            }
                          }
                        }}
                        className={`w-full h-9 sm:h-10 px-3 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white transition-all ${errors.macAddress ? "border-red-500" : "border-gray-300"}`}
                        placeholder="e.g. 00:1A:2B:3C:4D:5E"
                      />
                      {errors.macAddress && (
                        <p className="text-xs text-red-500 mt-1 font-medium">
                          {errors.macAddress}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {hasNetworkingSpecs(formData.category || "") && (
                <>
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-bold text-gray-900 border-b pb-2 uppercase tracking-wide">
                      Networking Details
                    </h3>
                  </div>
                  {/* Port Count and Port Speed are device-level specs — always shown for Networking assets
                      regardless of quantity. A switch has X ports whether you have 1 or 10 of them. */}
                  <div>
                    <label className="ui-form-label">Port Count</label>
                    <input
                      type="number"
                      min="0"
                      value={
                        formData.portCount != null && formData.portCount !== 0
                          ? formData.portCount
                          : ""
                      }
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setFormData((prev) => ({
                          ...prev,
                          portCount: isNaN(val) ? null : Math.max(0, val),
                        }));
                      }}
                      onKeyDown={blockKeys(BLOCK_CHARS_INT)}
                      onWheel={blurOnWheel}
                      placeholder="e.g. 24"
                      className={`w-full h-9 sm:h-10 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white transition-all ${NUM_INPUT_CLS}`}
                    />
                  </div>
                  <div>
                    <label className="ui-form-label">Port Speed</label>
                    <input
                      type="text"
                      maxLength={20}
                      value={formData.portSpeed || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          portSpeed: e.target.value,
                        }))
                      }
                      className="w-full h-9 sm:h-10 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white transition-all"
                      placeholder="e.g. 1Gbps"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="pb-4"></div>
          </div>
          <div className="sticky bottom-0 p-4 sm:p-6 border-t border-gray-200 bg-white flex justify-end gap-3 sm:gap-4 modal-safe-bottom">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 text-sm font-medium transition-all">
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 shadow-sm text-sm font-medium transition-all">
              <Save className="w-4 h-4" />
              {asset ? "Update Asset" : "Create Asset"}
            </button>
          </div>
        </form>
      </div>
      {/* Bulk Parent Edit Warning Modal */}
      {showBulkWarning && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-60"
          onClick={() => setShowBulkWarning(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 sm:p-6 animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-3 sm:mb-4">
              <div className="p-2 bg-amber-100 rounded-full shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">
                  {identityLocked
                    ? "Update Child Asset Specs/Licenses?"
                    : "Override All Child Assets?"}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Bulk parent edit confirmation
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5 sm:mb-6">
              {identityLocked ? (
                <>
                  This will <strong>update all child assets</strong> with the
                  modified spec and license values. Because some units are
                  allocated, identifying info (name, vendor, price) is protected
                  and will not be changed.
                </>
              ) : (
                <>
                  This will <strong>update all child assets</strong> with the
                  modified values (e.g., specs, invoice, vendor). Unique child identifiers
                  like Serial Numbers and MAC Addresses are protected and will
                  <strong> not </strong> be overwritten.
                </>
              )}
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setShowBulkWarning(false)}
                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 transition-all">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkWarningConfirm}
                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-all">
                {identityLocked ? "Yes, Update Specs" : "Yes, Override All"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
