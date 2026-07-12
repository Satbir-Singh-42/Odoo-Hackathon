'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { X, Save, AlertTriangle, XCircle } from "lucide-react";
import { z } from "zod";
import { maintenanceSchema } from "@/lib/validations";
import {
  MaintenanceRecord,
  Asset,
  User as UserType,
  getAvailableQuantity,
} from '@/types';
import { toast } from "sonner";
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { toDateInputValue, formatDisplayDate } from '@/lib/utils/dateHelpers';
import {
  ASSET_STATUS,
  MAINTENANCE_STATUS,
  MAINTENANCE_FREQUENCY,
  isSoftwareLikeCategory,
} from '@/config/constants';
import { isLicenseRenewalMaintenance } from '@/lib/utils/assetHelpers';
import { formatCurrencyValue } from '@/lib/utils/formatCurrency';

export type MaintenanceSavePayload = Partial<MaintenanceRecord> & {
  _applyToAllUnits?: boolean;
  _bulkParentId?: string;
  _skipAssetIds?: string[]; // sibling unit IDs to skip (already have active maintenance)
  replacementAssetId?: string;
  brokenAssetAction?: "AVAILABLE" | "DISPOSED";
  allocateToParentId?: string;
  consumedPartIds?: string[];
};

interface MaintenanceFormProps {
  maintenance: MaintenanceRecord | null;
  assets: Asset[];
  users: UserType[];
  maintenanceRecords?: MaintenanceRecord[];
  onSave: (maintenance: MaintenanceSavePayload) => void;
  onCancel: () => void;
}

const MAX_MAINTENANCE_COST = 2147483647;

function getCostValidationError(cost: number | null | undefined): string {
  if (cost === null || cost === undefined) return "";
  if (!Number.isFinite(cost)) return "Cost must be a valid number";
  if (cost < 0) return "Cost must be 0 or more";
  if (cost > MAX_MAINTENANCE_COST)
    return `Cost cannot exceed ₹${formatCurrencyValue(MAX_MAINTENANCE_COST)}`;
  return "";
}

function getDefaultMaintenanceData(): Partial<MaintenanceRecord> {
  return {
    assetId: "",
    assetCode: "",
    assetName: "",
    scheduledDate: "",
    completionDate: null,
    description: "",
    status: MAINTENANCE_STATUS.SCHEDULED,
    technician: null,
    cost: null,
    notes: null,
    frequency: MAINTENANCE_FREQUENCY.ONE_TIME,
  };
}

export function MaintenanceForm({
  maintenance,
  assets,
  users,
  maintenanceRecords = [],
  onSave,
  onCancel,
}: MaintenanceFormProps) {
  const [formData, setFormData] = useState<Partial<MaintenanceRecord>>(
    getDefaultMaintenanceData(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applyToAllUnits, setApplyToAllUnits] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const isExistingMaintenance = Boolean(maintenance?.id);
  const formRef = useRef<HTMLFormElement>(null);

  const initializedMaintenanceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (maintenance) {
      if (initializedMaintenanceIdRef.current !== String(maintenance.id)) {
        setFormData({ ...getDefaultMaintenanceData(), ...maintenance });
        initializedMaintenanceIdRef.current = String(maintenance.id);
        // Reset auxiliary state when switching to a different record
        setEnableSwap(false);
        setReplacementAssetId("");
        setBrokenAssetAction("AVAILABLE");
        setEnableAllocation(false);
        setAllocateToParentId("");
        setEnableParts(false);
        setConsumedPartIds([]);
        setErrors({});
        setApplyToAllUnits(false);
        setShowCancelConfirm(false);
        setCancelReason("");
        setIsSubmitting(false);
      }
    } else {
      if (initializedMaintenanceIdRef.current !== null) {
        setFormData(getDefaultMaintenanceData());
        initializedMaintenanceIdRef.current = null;
        // Reset auxiliary state when switching to create mode
        setEnableSwap(false);
        setReplacementAssetId("");
        setBrokenAssetAction("AVAILABLE");
        setEnableAllocation(false);
        setAllocateToParentId("");
        setEnableParts(false);
        setConsumedPartIds([]);
        setErrors({});
        setApplyToAllUnits(false);
        setShowCancelConfirm(false);
        setCancelReason("");
        setIsSubmitting(false);
      }
    }
  }, [maintenance]);

  const isReadOnly = maintenance?.status === MAINTENANCE_STATUS.CANCELLED;
  const isCompleted = maintenance?.status === MAINTENANCE_STATUS.COMPLETED;
  const isPartsLocked = isExistingMaintenance && isCompleted;
  const isSwapLocked = isExistingMaintenance && isCompleted;

  // Swap/Allocate State
  const [enableSwap, setEnableSwap] = useState(false);
  const [replacementAssetId, setReplacementAssetId] = useState("");
  const [brokenAssetAction, setBrokenAssetAction] = useState<
    "AVAILABLE" | "DISPOSED"
  >("AVAILABLE");

  const [enableAllocation, setEnableAllocation] = useState(false);
  const [allocateToParentId, setAllocateToParentId] = useState("");

  const [enableParts, setEnableParts] = useState(false);
  const [consumedPartIds, setConsumedPartIds] = useState<string[]>([]);
  const initializedAssetIdRef = useRef<string | null>(null);

  // Automatically pre-select any parts that are ALREADY installed on this asset
  useEffect(() => {
    if (
      formData.assetId &&
      formData.assetId !== initializedAssetIdRef.current
    ) {
      // Mark this asset as initialized so we don't overwrite user changes on subsequent re-renders
      initializedAssetIdRef.current = formData.assetId;
      const installedPartIds = assets
        .filter((a) => String(a.parentAssetId) === String(formData.assetId))
        .map((a) => String(a.id));

      if (installedPartIds.length > 0) {
        setConsumedPartIds(installedPartIds);
        setEnableParts(true);
      } else if (!isExistingMaintenance) {
        setConsumedPartIds([]);
        setEnableParts(false);
      }
    }
  }, [formData.assetId, assets, isExistingMaintenance]);

  // === MEMOIZED HANDLERS ===
  const handleAssetChange = useCallback(
    (assetId: string) => {
      const asset = assets.find((a) => String(a.id) === String(assetId));
      setFormData((prev) => ({
        ...prev,
        assetId,
        assetCode: asset?.assetCode || "",
        assetName: asset?.assetName || "",
      }));
      if (!asset?.bulkOrderParentId) setApplyToAllUnits(false);
      if (errors.assetId) setErrors((prev) => ({ ...prev, assetId: "" }));
    },
    [assets, errors.assetId],
  );

  const selectedAsset = useMemo(
    () => assets.find((a) => String(a.id) === String(formData.assetId)),
    [assets, formData.assetId],
  );

  const isCurrentlyAllocated = Boolean(
    selectedAsset?.parentAssetId || selectedAsset?.employeeId,
  );

  const availableReplacements = useMemo(() => {
    if (!selectedAsset || !isCurrentlyAllocated) return [];
    return assets.filter(
      (a) =>
        a.category === selectedAsset.category &&
        a.assetType === selectedAsset.assetType &&
        a.status === ASSET_STATUS.AVAILABLE &&
        String(a.id) !== String(selectedAsset.id),
    );
  }, [assets, selectedAsset, isCurrentlyAllocated]);

  const availableParentAssets = useMemo(() => {
    if (!selectedAsset) return [];
    // Can allocate to any asset except itself and its current parent
    return assets.filter(
      (a) =>
        String(a.id) !== String(selectedAsset.id) &&
        String(a.id) !== String(selectedAsset.parentAssetId) &&
        a.status !== ASSET_STATUS.DISPOSED,
    );
  }, [assets, selectedAsset]);

  const availableParts = useMemo(() => {
    // Return all AVAILABLE assets except the main asset itself and the replacement asset (if any)
    // Filter out software assets and bulk parent records
    // AND ALSO include any parts ALREADY INSTALLED on this asset so they can be removed
    return assets
      .filter((a) => {
        const isCurrentlyInstalledHere =
          String(a.parentAssetId) === String(formData.assetId);
        const isAvailableForInstall =
          a.status === ASSET_STATUS.AVAILABLE &&
          getAvailableQuantity(a) > 0 &&
          !a.parentAssetId &&
          !a.employeeId &&
          !a.isBulkOrder &&
          a.category?.toLowerCase() !== "software" &&
          String(a.id) !== String(formData.assetId) &&
          String(a.id) !== replacementAssetId;

        return isCurrentlyInstalledHere || isAvailableForInstall;
      })
      .sort((a, b) => {
        const nameA = a.assetName || "";
        const nameB = b.assetName || "";
        const nameCompare = nameA.localeCompare(nameB);
        if (nameCompare !== 0) return nameCompare;
        const codeA = a.assetCode || "";
        const codeB = b.assetCode || "";
        return codeA.localeCompare(codeB);
      });
  }, [assets, formData.assetId, replacementAssetId]);

  const costValidationError = useMemo(
    () => getCostValidationError(formData.cost),
    [formData.cost],
  );

  const isBulkParentItself = Boolean(selectedAsset?.isBulkOrder);
  const isPartOfBulk = !!selectedAsset?.bulkOrderParentId || isBulkParentItself;
  const isGroupMaintenance =
    Boolean(maintenance?.isBulkGroupRecord) ||
    applyToAllUnits ||
    isBulkParentItself;

  const getSnapshotCoverage = useCallback(
    (record: MaintenanceRecord, targetAsset?: Asset | null) => {
      if (!targetAsset) return null;

      const coveredUnits = Array.isArray(record.snapshotCoveredUnits)
        ? record.snapshotCoveredUnits
        : [];
      const skippedUnits = Array.isArray(record.snapshotSkippedUnits)
        ? record.snapshotSkippedUnits
        : [];

      if (coveredUnits.length === 0 && skippedUnits.length === 0) return null;

      const targetId = String(targetAsset.id);
      const targetCode = targetAsset.assetCode
        ? String(targetAsset.assetCode)
        : "";
      const targetName = targetAsset.assetName
        ? String(targetAsset.assetName)
        : "";

      const matchesTarget = (entry?: {
        id?: string;
        code?: string;
        name?: string;
      }) => {
        if (!entry) return false;
        const entryId = entry.id ? String(entry.id) : "";
        const entryCode = entry.code ? String(entry.code) : "";
        const entryName = entry.name ? String(entry.name) : "";

        return (
          (entryId && entryId === targetId) ||
          (entryCode && targetCode && entryCode === targetCode) ||
          (entryName && targetName && entryName === targetName)
        );
      };

      if (coveredUnits.some(matchesTarget)) return true;
      if (skippedUnits.some(matchesTarget)) return false;

      return false;
    },
    [],
  );

  // Latest completion date of any COMPLETED maintenance for the selected asset.
  // Used to block new maintenance from being scheduled before a prior job finishes.
  const latestCompletionDate = useMemo(() => {
    if (!formData.assetId) return null;
    // If the record we are editing/creating is a renewal, it shouldn't be blocked by past maintenance dates
    if (isLicenseRenewalMaintenance(formData as MaintenanceRecord)) return null;
    // If the record we are editing is ALREADY completed, we shouldn't block its edits based on newer records
    if (maintenance?.status === MAINTENANCE_STATUS.COMPLETED) return null;

    const bulkParentId = selectedAsset?.bulkOrderParentId
      ? String(selectedAsset.bulkOrderParentId)
      : null;

    const records = maintenanceRecords.filter((r) =>
      (() => {
        if (r.status !== "Completed" || !r.completionDate) return false;

        // Exclude the record being edited so it doesn't block its own edit
        if (maintenance?.id && String(r.id) === String(maintenance.id))
          return false;

        // When editing an existing record, only consider records completed
        // BEFORE this record was created.
        if (
          maintenance?.createdAt &&
          new Date(r.completionDate) >= new Date(maintenance.createdAt)
        ) {
          return false;
        }

        if (isLicenseRenewalMaintenance(r)) return false;

        const recordAssetId = String(r.assetId);
        const targetAssetId = String(formData.assetId);

        if (recordAssetId === targetAssetId) return true;

        const isBulkGroupRecord =
          r.isBulkGroupRecord === true || Number(r.isBulkGroupRecord) === 1;

        if (!bulkParentId || !isBulkGroupRecord) return false;

        const snapshotCoverage = getSnapshotCoverage(r, selectedAsset);
        if (snapshotCoverage === false) return false;
        if (snapshotCoverage === true) return true;

        return recordAssetId === bulkParentId;
      })(),
    );
    if (records.length === 0) return null;
    const dates = records
      .map((r) => new Date(r.completionDate as string))
      .filter((d) => !isNaN(d.getTime()));
    if (dates.length === 0) return null;
    return dates.reduce((latest, d) => (d > latest ? d : latest));
  }, [
    formData.assetId,
    maintenanceRecords,
    maintenance?.id,
    maintenance?.createdAt,
    selectedAsset,
    getSnapshotCoverage,
  ]);

  // IDs of assets with current active maintenance (for dropdown filtering)
  // Includes: individual records (assetId directly) AND children of bulk parents
  // that have an active group record (isBulkGroupRecord = true)
  const activeMaintenanceAssetIds = useMemo(() => {
    const ids = new Set<string>();
    const activeRecords = maintenanceRecords.filter(
      (r) =>
        (r.status === "Scheduled" || r.status === "In Progress") &&
        !isLicenseRenewalMaintenance(r),
    );

    for (const r of activeRecords) {
      if ((r as any).isBulkGroupRecord) {
        // Group record — mark ALL children of this parent as in-maintenance
        const parentId = String(r.assetId);
        ids.add(parentId); // the parent itself
        for (const a of assets) {
          if (
            String(a.bulkOrderParentId) === parentId &&
            !a.isBulkOrder &&
            a.status !== "Disposed" &&
            a.status !== "Under Maintenance"
          ) {
            ids.add(String(a.id));
          }
        }
      } else {
        // Individual record
        ids.add(String(r.assetId));
      }
    }
    return ids;
  }, [maintenanceRecords, assets]);

  // Auto-close form if background sync reveals the asset is no longer available
  useEffect(() => {
    if (formData.assetId && !isExistingMaintenance) {
      const currentAsset = assets.find(
        (a) => String(a.id) === String(formData.assetId),
      );
      if (
        currentAsset &&
        (currentAsset.status === ASSET_STATUS.DISPOSED ||
          activeMaintenanceAssetIds.has(String(currentAsset.id)))
      ) {
        onCancel();
      }
    }
  }, [
    formData.assetId,
    isExistingMaintenance,
    assets,
    activeMaintenanceAssetIds,
    onCancel,
  ]);

  const effectiveApplyToAll = applyToAllUnits || isBulkParentItself;

  // Bulk conflict summary — computed when "Apply to ALL units" is checked or it's a bulk parent
  const bulkConflict = useMemo(() => {
    if (isExistingMaintenance || !effectiveApplyToAll || !isPartOfBulk) return null;
    const parentId = isBulkParentItself ? selectedAsset?.id : selectedAsset?.bulkOrderParentId;
    if (!parentId) return null;

    const siblings = assets.filter(
      (a) =>
        String(a.bulkOrderParentId) === String(parentId) &&
        !a.isBulkOrder &&
        a.status !== "Disposed" &&
        a.status !== "Under Maintenance",
    );

    const conflicted = siblings.filter((sibling) =>
      activeMaintenanceAssetIds.has(String(sibling.id)),
    );

    const eligible = siblings.filter(
      (s) => !conflicted.find((c) => String(c.id) === String(s.id)),
    );

    return {
      total: siblings.length,
      eligible: eligible.length,
      conflicted,
      allBlocked: eligible.length === 0,
      skipAssetIds: conflicted.map((c) => String(c.id)),
    };
  }, [
    effectiveApplyToAll,
    isPartOfBulk,
    selectedAsset,
    assets,
    activeMaintenanceAssetIds,
  ]);

  const validateForm = useCallback(() => {
    let newErrors: Record<string, string> = {};

    try {
      maintenanceSchema.parse(formData);
    } catch (err) {
      if (err instanceof z.ZodError) {
        err.errors.forEach(e => {
          if (e.path[0]) newErrors[e.path[0].toString()] = e.message;
        });
      }
    }
    // Block scheduling before the previous maintenance's completion date
    if (formData.scheduledDate && latestCompletionDate) {
      const scheduled = new Date(formData.scheduledDate);
      if (!isNaN(scheduled.getTime()) && scheduled < latestCompletionDate) {
        newErrors.scheduledDate = `Cannot schedule before the previous maintenance completion date (${formatDisplayDate(latestCompletionDate)})`;
      }
    }
    if (!formData.status) newErrors.status = "Status is required";
    if (
      formData.status === MAINTENANCE_STATUS.COMPLETED &&
      !formData.completionDate
    ) {
      newErrors.completionDate =
        "Completion date is required when status is Completed";
    }

    if (formData.scheduledDate && formData.completionDate) {
      const scheduled = new Date(formData.scheduledDate);
      const completed = new Date(formData.completionDate);
      if (!isNaN(scheduled.getTime()) && !isNaN(completed.getTime())) {
        scheduled.setHours(0, 0, 0, 0);
        completed.setHours(0, 0, 0, 0);
        if (scheduled > completed) {
          newErrors.completionDate =
            "Completion date cannot be before scheduled date";
          newErrors.scheduledDate =
            "Scheduled date cannot be after completion date";
        }
      }
    }

    if (costValidationError) newErrors.cost = costValidationError;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, costValidationError, latestCompletionDate]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmitting || isReadOnly) return;
      if (!validateForm()) {
        // Scroll to first error field inside the modal's scrollable form
        requestAnimationFrame(() => {
          const firstError = formRef.current?.querySelector<HTMLElement>(
            '[data-error="true"]',
          );
          firstError?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        return;
      }
      setIsSubmitting(true);

      // Warn if the user is breaking a recurring renewal chain by switching to One-Time
      if (
        isExistingMaintenance &&
        maintenance?.frequency &&
        maintenance.frequency !== MAINTENANCE_FREQUENCY.ONE_TIME &&
        formData.frequency === MAINTENANCE_FREQUENCY.ONE_TIME
      ) {
        toast.warning(
          `Frequency changed to One-Time — the auto-renewal chain for "${maintenance.frequency}" maintenance will be stopped.`,
        );
      }

      const normalizedPartIds = Array.from(
        new Set(consumedPartIds.map((id) => String(id).trim()).filter(Boolean)),
      );
      const includeParts = formData.status === MAINTENANCE_STATUS.COMPLETED;
      const partPayload = includeParts
        ? enableParts
          ? normalizedPartIds
          : []
        : undefined;

      if ((applyToAllUnits && isPartOfBulk) || isBulkParentItself) {
        const parentId = isBulkParentItself ? selectedAsset?.id : selectedAsset?.bulkOrderParentId;
        onSave({
          ...formData,
          completionDate: formData.completionDate || null,
          _applyToAllUnits: true,
          _bulkParentId: parentId ?? undefined,
          _skipAssetIds: bulkConflict?.skipAssetIds ?? [],
          replacementAssetId: enableSwap ? replacementAssetId : undefined,
          brokenAssetAction: enableSwap ? brokenAssetAction : undefined,
          allocateToParentId: enableAllocation ? allocateToParentId : undefined,
          consumedPartIds: partPayload,
        });
      } else {
        onSave({
          ...formData,
          completionDate: formData.completionDate || null,
          replacementAssetId: enableSwap ? replacementAssetId : undefined,
          brokenAssetAction: enableSwap ? brokenAssetAction : undefined,
          allocateToParentId: enableAllocation ? allocateToParentId : undefined,
          consumedPartIds: partPayload,
        });
      }
    },
    [
      formData,
      validateForm,
      onSave,
      applyToAllUnits,
      isPartOfBulk,
      selectedAsset,
      isSubmitting,
      bulkConflict,
      isExistingMaintenance,
      maintenance,
      isReadOnly,
      enableSwap,
      replacementAssetId,
      brokenAssetAction,
      enableAllocation,
      allocateToParentId,
      enableParts,
      consumedPartIds,
    ],
  );

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-60 overflow-y-auto animate-in fade-in duration-200"
      onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[95dvh] sm:max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between rounded-t-xl z-10 shrink-0">
          <div className="min-w-0 pr-2">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
              {isReadOnly
                ? "View Cancelled Maintenance"
                : isExistingMaintenance
                  ? "Edit Maintenance Record"
                  : "Schedule Maintenance"}
            </h2>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="p-4 sm:p-6 space-y-4 sm:space-y-5 flex-1 overflow-y-auto overflow-x-hidden modal-safe-bottom">
          {/* Asset selector */}
          <div>
            <label className="ui-form-label">
              {maintenance ? "Asset" : "Select Asset *"}
            </label>
            {maintenance ? (
              <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {selectedAsset?.assetName ||
                      formData.assetName ||
                      "Unknown Asset"}
                  </p>
                  <p className="text-xs text-gray-500 font-mono truncate">
                    {selectedAsset?.assetCode || formData.assetCode || "—"}
                  </p>
                </div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0 bg-gray-100 px-2 py-0.5 rounded">
                  Locked
                </span>
              </div>
            ) : (
              // Filter out: disposed, under-maintenance, bulk-order parents, assets with active maintenance
              <SearchableSelect
                required
                value={formData.assetId || ""}
                onChange={(value) => handleAssetChange(value)}
                options={assets
                  .filter(
                    (asset) =>
                      asset.status !== ASSET_STATUS.DISPOSED &&
                      asset.status !== ASSET_STATUS.UNDER_MAINTENANCE &&
                      !isSoftwareLikeCategory(asset.category) &&
                      !asset.isBulkOrder &&
                      !activeMaintenanceAssetIds.has(String(asset.id)),
                  )
                  .map((asset) => {
                    const isChild =
                      asset.bulkOrderParentId != null && !asset.isBulkOrder;
                    return {
                      value: asset.id,
                      label: asset.assetName || asset.assetCode || "Unknown Asset",
                      sublabel: isChild
                        ? [
                            asset.assetCode,
                            asset.installationLocation || "",
                          ].filter(Boolean).join(" • ")
                        : [
                            asset.assetCode,
                            asset.category,
                            asset.assetType,
                          ].filter(Boolean).join(" • "),
                    };
                  })
                  .sort((a, b) =>
                    a.label.localeCompare(b.label, undefined, {
                      numeric: true,
                    }),
                  )}
                placeholder="Select an asset"
              />
            )}
          </div>

          {/* Bulk group — checkbox + compact summary pill */}
          {isPartOfBulk && !maintenance && (
            <div className="space-y-2">
              {isBulkParentItself ? (
                <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg border border-blue-100">
                  <AlertTriangle className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-semibold text-blue-900 tracking-tight uppercase">
                    This maintenance will apply to ALL units in this group
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg border border-blue-100">
                  <input
                    type="checkbox"
                    id="applyToAllUnits"
                    checked={applyToAllUnits}
                    onChange={(e) => setApplyToAllUnits(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label
                    htmlFor="applyToAllUnits"
                    className="text-xs font-semibold text-blue-900 flex items-center gap-1.5 cursor-pointer uppercase tracking-tight">
                    <AlertTriangle className="w-3.5 h-3.5 text-blue-600" />
                    Apply to ALL units in this bulk group
                  </label>
                </div>
              )}

              {/* Compact conflict pill — one line */}
              {bulkConflict && (
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${
                    bulkConflict.allBlocked
                      ? "bg-red-50 border-red-300 text-red-700"
                      : bulkConflict.conflicted.length > 0
                        ? "bg-amber-50 border-amber-300 text-amber-800"
                        : "bg-green-50 border-green-200 text-green-700"
                  }`}>
                  <AlertTriangle
                    className={`w-3.5 h-3.5 shrink-0 ${
                      bulkConflict.allBlocked
                        ? "text-red-500"
                        : bulkConflict.conflicted.length > 0
                          ? "text-amber-500"
                          : "text-green-500"
                    }`}
                  />
                  <span>
                    {bulkConflict.allBlocked ? (
                      `All ${bulkConflict.total} units already in maintenance — cannot schedule`
                    ) : bulkConflict.conflicted.length > 0 ? (
                      <>
                        <span className="text-green-700 font-bold">
                          {bulkConflict.eligible} of {bulkConflict.total}
                        </span>
                        {" units eligible · "}
                        <span className="text-red-600 font-bold">
                          {bulkConflict.conflicted.length}
                        </span>
                        {" skipped ("}
                        {bulkConflict.conflicted.map((u, i) => (
                          <span key={u.id}>
                            {i > 0 && ", "}
                            <span className="font-mono">{u.assetCode}</span>
                          </span>
                        ))}
                        {")"}
                      </>
                    ) : (
                      `All ${bulkConflict.total} units eligible for scheduling`
                    )}
                  </span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="ui-form-label">Description *</label>
            <textarea
              required
              disabled={isReadOnly}
              value={formData.description || ""}
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }));
                if (errors.description)
                  setErrors((prev) => ({ ...prev, description: "" }));
              }}
              rows={3}
              maxLength={255}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white transition-all ${errors.description ? "border-red-500" : "border-gray-300"}`}
              placeholder="Maintenance details..."
            />
            {errors.description && (
              <p
                data-error="true"
                className="mt-1 text-xs text-red-600 font-medium">
                {errors.description}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            <div className="min-w-0">
              <label className="ui-form-label">Scheduled Date *</label>
              <input
                type="date"
                disabled={isReadOnly || isCompleted}
                value={toDateInputValue(formData.scheduledDate)}
                onChange={(e) => {
                  setFormData((prev) => ({
                    ...prev,
                    scheduledDate: e.target.value,
                  }));
                  if (errors.scheduledDate) {
                    setErrors((prev) => {
                      const newErrors = { ...prev };
                      delete newErrors.scheduledDate;
                      return newErrors;
                    });
                  }
                }}
                className={`ui-control block w-full min-w-0 max-w-full box-border h-9 sm:h-10 px-3 text-sm font-normal transition-all ${
                  isReadOnly || isCompleted
                    ? "bg-gray-100 cursor-not-allowed opacity-75"
                    : "bg-white cursor-pointer"
                }`}
              />
              {errors.scheduledDate && (
                <p
                  data-error="true"
                  className="mt-1 text-xs text-red-600 font-medium">
                  {errors.scheduledDate}
                </p>
              )}
            </div>

            <div className="min-w-0">
              <label className="ui-form-label">Completion Date</label>
              <input
                type="date"
                disabled={
                  isReadOnly ||
                  (isCompleted && Boolean(formData.completionDate))
                }
                value={toDateInputValue(formData.completionDate)}
                onChange={(e) => {
                  setFormData((prev) => ({
                    ...prev,
                    completionDate: e.target.value,
                    // Auto-switch to Completed when a completion date is set
                    ...(e.target.value ? { status: "Completed" as const } : {}),
                  }));
                  if (errors.completionDate) {
                    setErrors((prev) => {
                      const newErrors = { ...prev };
                      delete newErrors.completionDate;
                      return newErrors;
                    });
                  }
                }}
                className={`ui-control block w-full min-w-0 max-w-full box-border h-9 sm:h-10 px-3 text-sm font-normal transition-all ${
                  isReadOnly || isCompleted
                    ? "bg-gray-100 cursor-not-allowed opacity-75"
                    : "bg-white cursor-pointer"
                } ${errors.completionDate ? "border-red-500 focus:ring-red-500" : ""}`}
              />
              {errors.completionDate && (
                <p
                  data-error="true"
                  className="mt-1 text-xs text-red-600 font-medium">
                  {errors.completionDate}
                </p>
              )}
            </div>

            <div>
              <label className="ui-form-label">Status *</label>
              <SearchableSelect
                required
                disabled={isReadOnly || isCompleted}
                value={formData.status || ""}
                onChange={(value) => {
                  const nextStatus = value as MaintenanceRecord["status"];
                  setFormData((prev) => ({
                    ...prev,
                    status: nextStatus,
                    ...(nextStatus === MAINTENANCE_STATUS.COMPLETED &&
                    !prev.completionDate
                      ? {
                          completionDate: new Date()
                            .toISOString()
                            .split("T")[0],
                        }
                      : {}),
                  }));
                  if (nextStatus !== MAINTENANCE_STATUS.COMPLETED) {
                    setEnableSwap(false);
                    setReplacementAssetId("");
                  }
                  if (errors.status)
                    setErrors((prev) => ({ ...prev, status: "" }));
                }}
                options={[
                  { value: "Scheduled", label: "Scheduled" },
                  { value: "In Progress", label: "In Progress" },
                  { value: "Completed", label: "Completed" },
                  ...(formData.status === "Reported"
                    ? [
                        {
                          value: "Reported",
                          label: "Reported (Pending Schedule)",
                        },
                      ]
                    : []),
                ]}
                placeholder="Select status"
              />
            </div>

            {formData.status === MAINTENANCE_STATUS.COMPLETED &&
              isCurrentlyAllocated &&
              !isGroupMaintenance && (
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 mt-2 mb-2">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-semibold text-blue-900">
                        Replace Allocated Asset
                      </h4>
                      <p className="text-xs text-blue-700 mt-0.5">
                        This asset is currently allocated to{" "}
                        {selectedAsset?.parentAssetName ||
                          selectedAsset?.userName}
                        . Do you want to swap it with a replacement?
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        disabled={isSwapLocked}
                        checked={enableSwap}
                        onChange={(e) => {
                          setEnableSwap(e.target.checked);
                          if (!e.target.checked) setReplacementAssetId("");
                        }}
                      />
                      <div
                        className={`w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 ${isSwapLocked ? "opacity-60 cursor-not-allowed" : ""}`}></div>
                    </label>
                  </div>

                  {enableSwap && (
                    <div className="space-y-4 pt-3 border-t border-blue-100">
                      <div>
                        <label className="ui-form-label">
                          Replacement Asset *
                        </label>
                        <SearchableSelect
                          required={enableSwap}
                          value={replacementAssetId}
                          onChange={setReplacementAssetId}
                          options={availableReplacements.map((a) => ({
                            value: String(a.id),
                            label: `${a.assetName} (${a.assetCode})`,
                          }))}
                          placeholder={
                            availableReplacements.length > 0
                              ? "Select a replacement asset"
                              : "No available replacements"
                          }
                          disabled={
                            availableReplacements.length === 0 || isSwapLocked
                          }
                        />
                        {availableReplacements.length === 0 && (
                          <p className="mt-1 text-xs text-amber-600">
                            No {selectedAsset?.assetType} assets are currently
                            AVAILABLE.
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="ui-form-label">
                          Action for Broken Asset
                        </label>
                        <SearchableSelect
                          value={brokenAssetAction}
                          onChange={(v) =>
                            setBrokenAssetAction(v as "AVAILABLE" | "DISPOSED")
                          }
                          disabled={isSwapLocked}
                          options={[
                            {
                              value: "AVAILABLE",
                              label: "Return to Inventory (Available)",
                            },
                            { value: "DISPOSED", label: "Mark as Disposed" },
                          ]}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

            {formData.status === MAINTENANCE_STATUS.COMPLETED &&
              !isGroupMaintenance && (
                <>
                  <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-4 mt-2 mb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-purple-900">
                          Install Parts / Accessories
                        </h4>
                        <p className="text-xs text-purple-700 mt-0.5">
                          Did you consume any parts (like RAM, Battery) from
                          inventory to repair this asset?
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          disabled={isPartsLocked}
                          checked={enableParts}
                          onChange={(e) => {
                            setEnableParts(e.target.checked);
                            if (!e.target.checked) setConsumedPartIds([]);
                            else if (consumedPartIds.length === 0)
                              setConsumedPartIds([""]);
                          }}
                        />
                        <div
                          className={`w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600 ${isPartsLocked ? "opacity-60 cursor-not-allowed" : ""}`}></div>
                      </label>
                    </div>
                  </div>

                  {enableParts && (
                    <div className="space-y-4 pt-2 pb-2">
                      {consumedPartIds.map((partId, idx) => (
                        <div key={idx} className="flex gap-2 items-end">
                          <div className="flex-1">
                            <label className="ui-form-label">Select Part</label>
                            <SearchableSelect
                              value={partId}
                              onChange={(val) => {
                                const newArr = [...consumedPartIds];
                                newArr[idx] = val;
                                setConsumedPartIds(newArr);
                              }}
                              disabled={isPartsLocked}
                              options={availableParts.map((a) => ({
                                value: String(a.id),
                                label: `${a.assetName} (${a.assetCode}) - ${a.category}`,
                              }))}
                              placeholder="Select an available part"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={isPartsLocked}
                            onClick={() => {
                              const newArr = consumedPartIds.filter(
                                (_, i) => i !== idx,
                              );
                              setConsumedPartIds(newArr);
                              if (newArr.length === 0) setEnableParts(false);
                            }}
                            className={`h-9 px-3 text-red-600 rounded-lg flex items-center ${isPartsLocked ? "opacity-60 cursor-not-allowed" : "hover:bg-red-50"}`}>
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        disabled={isPartsLocked}
                        onClick={() =>
                          setConsumedPartIds([...consumedPartIds, ""])
                        }
                        className={`text-sm text-purple-700 font-medium ${isPartsLocked ? "opacity-60 cursor-not-allowed" : "hover:text-purple-900"}`}>
                        + Add another part
                      </button>
                    </div>
                  )}
                </>
              )}

            <div>
              <label className="ui-form-label">Frequency</label>
              <SearchableSelect
                disabled={isReadOnly || isCompleted}
                value={formData.frequency || ""}
                onChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    frequency: (value ||
                      null) as MaintenanceRecord["frequency"],
                  }))
                }
                options={Object.values(MAINTENANCE_FREQUENCY).map((f) => ({
                  value: f,
                  label: f,
                }))}
                placeholder="Select frequency"
              />
            </div>

            <div>
              <label className="ui-form-label">
                Technician (IT Department)
              </label>
              <SearchableSelect
                disabled={isReadOnly}
                value={formData.technician || ""}
                onChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    technician: value || null,
                  }))
                }
                options={users
                  .filter((u) => {
                    const dept = (u.department || "").toLowerCase();
                    return dept === "it" || dept === "information technology";
                  })
                  .map((u) => ({
                    value: u.userName,
                    label: `${u.userName} (${u.employeeId})`,
                    sublabel: u.department,
                  }))}
                placeholder="Select technician"
              />
            </div>

            <div>
              <label className="ui-form-label">Cost (₹)</label>
              <input
                type="number"
                disabled={isReadOnly}
                min="0"
                max={MAX_MAINTENANCE_COST}
                step="0.01"
                value={
                  formData.cost !== null && formData.cost !== undefined
                    ? formData.cost
                    : ""
                }
                onChange={(e) => {
                  const rawValue = e.target.value;
                  const parsedValue = rawValue === "" ? null : Number(rawValue);
                  const nextCost =
                    parsedValue === null || Number.isNaN(parsedValue)
                      ? null
                      : Math.max(0, parsedValue);

                  setFormData((prev) => ({
                    ...prev,
                    cost: nextCost,
                  }));

                  if (errors.cost) {
                    const nextCostError = getCostValidationError(nextCost);
                    setErrors((prev) => {
                      if (nextCostError)
                        return { ...prev, cost: nextCostError };
                      const { cost: _removedCostError, ...rest } = prev;
                      return rest;
                    });
                  }
                }}
                onKeyDown={(e) => {
                  if (["-", "e", "E", "+"].includes(e.key)) e.preventDefault();
                }}
                onWheel={(e) => e.currentTarget.blur()}
                className="w-full h-9 sm:h-10 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="0"
              />
              {costValidationError && (
                <p
                  data-error="true"
                  className="mt-1 text-xs text-red-600 font-medium">
                  {costValidationError}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="ui-form-label">Notes</label>
            <textarea
              disabled={isReadOnly}
              value={formData.notes || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  notes: e.target.value || null,
                }))
              }
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-normal bg-white transition-all"
              placeholder="Additional notes..."
            />
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-gray-100 mt-2">
            <div className="w-full sm:w-auto">
              {maintenance &&
                isExistingMaintenance &&
                maintenance.status !== MAINTENANCE_STATUS.CANCELLED &&
                maintenance.status !== MAINTENANCE_STATUS.COMPLETED && (
                  <button
                    type="button"
                    onClick={() => {
                      setCancelReason("");
                      setShowCancelConfirm(true);
                    }}
                    className="w-full sm:w-auto px-6 py-2 border border-red-200 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-xs font-bold uppercase tracking-wide flex justify-center">
                    Cancel Maintenance
                  </button>
                )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={onCancel}
                className="w-full sm:w-auto px-6 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-xs font-bold text-gray-700 transition-colors uppercase tracking-wide flex justify-center">
                Close
              </button>
              {!isReadOnly && (
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    !!bulkConflict?.allBlocked ||
                    !!costValidationError
                  }
                  className={`px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-sm text-xs font-bold uppercase tracking-wide ${
                    isSubmitting ||
                    !!bulkConflict?.allBlocked ||
                    !!costValidationError
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}>
                  <Save className="w-4 h-4" />
                  {isSubmitting
                    ? "Saving..."
                    : isExistingMaintenance
                      ? "Update"
                      : applyToAllUnits && bulkConflict
                        ? `Schedule ${bulkConflict.eligible} Unit${bulkConflict.eligible !== 1 ? "s" : ""}`
                        : "Schedule"}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {showCancelConfirm && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-70"
          onClick={() => setShowCancelConfirm(false)}>
          <div
            className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl max-w-md w-full p-5 sm:p-6 animate-in slide-in-from-bottom-4 sm:zoom-in-95"
            onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-start gap-3 mb-3 sm:mb-4">
              <div className="p-2 bg-red-100 rounded-full shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">
                  Cancel Maintenance?
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  This action cannot be undone.
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4 sm:mb-5">
              Are you sure you want to cancel this maintenance? The status will
              be permanently set to "Cancelled".
            </p>
            <div className="space-y-3 mb-5 sm:mb-6">
              <label className="block text-sm font-medium text-gray-700">
                Reason for Cancellation *
              </label>
              <textarea
                required
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Asset was replaced, maintenance no longer needed..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 text-sm min-h-20"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 transition-all">
                No, Keep it
              </button>
              <button
                type="button"
                disabled={!cancelReason.trim()}
                onClick={() => {
                  const newNotes = formData.notes
                    ? `${formData.notes}\n\nCancellation Reason: ${cancelReason}`
                    : `Cancellation Reason: ${cancelReason}`;
                  onSave({ ...formData, status: "Cancelled", notes: newNotes });
                  setShowCancelConfirm(false);
                }}
                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm">
                Yes, Cancel Maintenance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
