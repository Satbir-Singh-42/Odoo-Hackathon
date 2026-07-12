'use client';

import { useState, useRef, useEffect } from "react";
import { Eye, Edit, Trash2, MoreVertical } from "lucide-react";
import { Asset, MaintenanceRecord, LicenseAllocation } from '@/types';
import { motion, AnimatePresence } from "framer-motion";
import { canEdit } from "./StatusBadge";
import {
  canUpdate as canRoleUpdate,
  canDelete as canRoleDelete,
  type UserRole,
  ALLOCATION_STATUS_DISPLAY,
  HIDE_DELETE_UI,
  ASSET_STATUS,
} from '@/config/constants';

export interface ActionMenuProps {
  /** The asset to perform actions on */
  asset: Asset;
  /** All assets (for bulk-child checks) */
  allAssets?: Asset[];
  /** All maintenance records (for initial-stage detection) */
  allMaintenanceRecords?: MaintenanceRecord[];
  /** All license allocations (for initial-stage + dispose-block detection) */
  allLicenseAllocations?: LicenseAllocation[];
  /** Callback when view is clicked */
  onView: (asset: Asset) => void;
  /** Callback when edit is clicked */
  onEdit: (asset: Asset) => void;
  /** Callback when delete is clicked (initial stage only) */
  onDelete: (asset: Asset) => void;
  /** Callback when dispose is clicked (post-history stage) */
  onDispose?: (asset: Asset) => void;
  /** Additional CSS classes for the trigger button */
  triggerClassName?: string;
  /** Stop propagation on clicks (useful inside clickable rows) */
  stopPropagation?: boolean;
  /** Current user's role for RBAC gating */
  userRole?: UserRole;
}

/**
 * Reusable action menu component for asset row actions
 * Provides View, Edit, Delete with proper disabled states and warnings
 */
/**
 * Determine if an asset is in its "initial stage":
 * No maintenance records, no allocation history (any status), no current
 * parent/child allocation, and (for bulk parents) no child allocations.
 */
function computeIsInitialStage(
  asset: Asset,
  allAssets: Asset[],
  allMaintenanceRecords: MaintenanceRecord[],
  allLicenseAllocations: LicenseAllocation[],
): boolean {
  const assetId = String(asset.id);

  // Gather the set of IDs to check (parent + all children for bulk orders)
  const idsToCheck = new Set<string>([assetId]);
  if (asset.isBulkOrder) {
    allAssets
      .filter((a) => String(a.bulkOrderParentId) === assetId && !a.isBulkOrder)
      .forEach((child) => idsToCheck.add(String(child.id)));
  }

  // Any maintenance record (regardless of status) disqualifies initial stage
  const hasMaintenance = allMaintenanceRecords.some((m) =>
    idsToCheck.has(String(m.assetId)),
  );
  if (hasMaintenance) return false;

  // Any allocation record (any status) disqualifies initial stage
  const hasAllocation = allLicenseAllocations.some(
    (a) =>
      idsToCheck.has(String(a.assetId)) ||
      // Also check if this asset is referenced as a parentAsset in any allocation
      idsToCheck.has(String(a.parentAssetId ?? "")),
  );
  if (hasAllocation) return false;

  // Current parent-asset assignment also disqualifies
  if (asset.parentAssetId) return false;

  return true;
}

export function ActionMenu({
  asset,
  allAssets = [],
  allMaintenanceRecords = [],
  allLicenseAllocations = [],
  onView,
  onEdit,
  onDelete,
  onDispose,
  triggerClassName = "",
  stopPropagation = false,
  userRole = "Viewer" as UserRole,
}: ActionMenuProps) {
  // Determine lifecycle stage
  const isInitialStage = computeIsInitialStage(
    asset,
    allAssets,
    allMaintenanceRecords,
    allLicenseAllocations,
  );

  // For dispose: disabled if any unit in the group is actively allocated
  const assetId = String(asset.id);
  const childIds = asset.isBulkOrder
    ? allAssets
      .filter((a) => String(a.bulkOrderParentId) === assetId && !a.isBulkOrder)
      .map((a) => String(a.id))
    : [];
  const idsInGroup = new Set([assetId, ...childIds]);
  const hasActiveAllocations = allLicenseAllocations.some(
    (a) =>
      a.status === ALLOCATION_STATUS_DISPLAY.ACTIVE &&
      idsInGroup.has(String(a.assetId)),
  );

  const showDelete = canRoleDelete(userRole) && (isInitialStage || !HIDE_DELETE_UI);
  const showDispose = canRoleDelete(userRole) && (!isInitialStage || !HIDE_DELETE_UI);
  const showEdit = canRoleUpdate(userRole);

  if (!showDelete && !showDispose && !showEdit) {
    return null;
  }

  // Delete is blocked if the asset itself or any of its child units is Disposed, or if it has active allocations
  const isDeleteBlocked = hasActiveAllocations || allAssets.some(
    (a) =>
      (String(a.id) === assetId || String(a.bulkOrderParentId) === assetId) &&
      a.status === ASSET_STATUS.DISPOSED
  );
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (isOpen) setIsOpen(false);
    };

    if (isOpen) {
      // Use setTimeout to avoid immediate close on trigger click
      const timer = setTimeout(() => {
        document.addEventListener("click", handleClickOutside);
      }, 0);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("click", handleClickOutside);
      };
    }
  }, [isOpen]);

  // Close on scroll so menu doesn't get misaligned in edge cases
  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = () => setIsOpen(false);
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [isOpen]);

  const handleTriggerClick = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();

    if (isOpen) {
      setIsOpen(false);
      return;
    }

    // Compute fixed position from trigger button rect
    // Clamp so the 224px (w-56) menu stays within the viewport on mobile
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const menuW = 224;
      const r = Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - menuW - 8));
      setMenuPos(
        spaceBelow < 220
          ? { bottom: window.innerHeight - rect.top + 5, right: r }
          : { top: rect.bottom + 5, right: r },
      );
    }

    setIsOpen(true);
  };

  const handleView = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    onView(asset);
    setIsOpen(false);
  };

  const handleEdit = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();

    if (!canEdit(asset.status)) return;

    onEdit(asset);
    setIsOpen(false);
  };

  const handleDelete = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    if (isDeleteBlocked) return;
    onDelete(asset);
    setIsOpen(false);
  };

  const handleDispose = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    if (hasActiveAllocations) return;
    onDispose?.(asset);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={handleTriggerClick}
        className={`p-2.5 hover:bg-gray-100 rounded-xl transition-all duration-200 group ${triggerClassName}`}
        title="Actions">
        <MoreVertical className="w-5 h-5 text-gray-500 group-hover:text-gray-700" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop to close menu */}
            <div
              className="fixed inset-0 z-10"
              onClick={(e) => {
                if (stopPropagation) e.stopPropagation();
                setIsOpen(false);
              }}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed w-56 bg-white rounded-2xl shadow-xl overflow-hidden z-50"
              style={{
                top: menuPos?.top,
                bottom: menuPos?.bottom,
                right: menuPos?.right,
                boxShadow:
                  "0 10px 40px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.06)",
              }}
              onClick={(e: React.MouseEvent) => {
                if (stopPropagation) e.stopPropagation();
              }}>
              <div className="py-2">
                {/* View - Always enabled */}
                <button
                  onClick={handleView}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors no-push">
                  <Eye className="w-4 h-4" />
                  <span>View Details</span>
                </button>

                {/* Edit - Hidden for viewers, disabled for retired assets */}
                {canRoleUpdate(userRole) && (
                  <button
                    onClick={handleEdit}
                    disabled={!canEdit(asset.status)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors no-push ${canEdit(asset.status)
                      ? "text-gray-700 hover:bg-green-50 hover:text-green-700"
                      : "text-gray-400 cursor-not-allowed bg-gray-50"
                      }`}
                    title={
                      !canEdit(asset.status)
                        ? "Disposed assets cannot be edited."
                        : ""
                    }>
                    <Edit className="w-4 h-4" />
                    <span>Edit Asset</span>
                    {!canEdit(asset.status) && (
                      <span className="ml-auto text-xs text-gray-400">
                        Blocked
                      </span>
                    )}
                  </button>
                )}

                {(canRoleUpdate(userRole) || canRoleDelete(userRole)) && (
                  <div className="border-t border-gray-200 my-1" />
                )}

                {/* Delete option */}
                {showDelete && (
                  <button
                    onClick={handleDelete}
                    disabled={isDeleteBlocked}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors no-push ${isDeleteBlocked
                      ? "text-gray-400 cursor-not-allowed bg-gray-50"
                      : "text-gray-700 hover:bg-red-50 hover:text-red-700"
                      }`}
                    title={
                      isDeleteBlocked
                        ? hasActiveAllocations
                          ? "All allocations must be revoked before deleting."
                          : "Disposed assets cannot be deleted."
                        : ""
                    }>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Asset</span>
                    {isDeleteBlocked && (
                      <span className="ml-auto text-xs text-gray-400">Blocked</span>
                    )}
                  </button>
                )}

                {/* Dispose option */}
                {showDispose && (
                  <button
                    onClick={handleDispose}
                    disabled={hasActiveAllocations || asset.status === "Disposed"}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors no-push ${hasActiveAllocations || asset.status === "Disposed"
                      ? "text-gray-400 cursor-not-allowed bg-gray-50"
                      : "text-gray-700 hover:bg-orange-50 hover:text-orange-700"
                      }`}
                    title={
                      asset.status === "Disposed"
                        ? "Asset is already disposed."
                        : hasActiveAllocations
                          ? "All allocations must be revoked before disposing."
                          : ""
                    }>
                    <Trash2 className="w-4 h-4" />
                    <span>Dispose Asset</span>
                    {(hasActiveAllocations || asset.status === "Disposed") && (
                      <span className="ml-auto text-xs text-gray-400">Blocked</span>
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
