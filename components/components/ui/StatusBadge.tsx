'use client';

import {
  CheckCircle,
  XCircle,
  Clock,
  HelpCircle,
  User,
  RefreshCw,
  Trash2,
  PlayCircle,
  AlertTriangle,
  Wrench,
} from "lucide-react";
import { Asset } from '@/types';

export interface StatusBadgeProps {
  /** Current status of the asset */
  status: Asset["status"] | string;
  /** Size variant */
  size?: "xs" | "sm" | "md";
  /** Show icon alongside text */
  showIcon?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Role of the current user (to support role-specific labeling) */
  userRole?: string;
}

export type BadgeSize = "xs" | "sm" | "md";

/**
 * Mapping of status to Tailwind color classes
 * Single source of truth for status styling across the application
 */
const STATUS_STYLES: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  Available: {
    bg: "bg-green-100",
    text: "text-green-800",
    border: "border-green-200",
  },
  Allocated: {
    bg: "bg-blue-100",
    text: "text-blue-800",
    border: "border-blue-200",
  },
  "Partially Allocated": {
    bg: "bg-purple-100",
    text: "text-purple-800",
    border: "border-purple-200",
  },
  "Under Maintenance": {
    bg: "bg-orange-100",
    text: "text-orange-800",
    border: "border-orange-200",
  },
  "License Expired": {
    bg: "bg-red-100",
    text: "text-red-800",
    border: "border-red-200",
  },
  Disposed: {
    bg: "bg-red-100",
    text: "text-red-800",
    border: "border-red-200",
  },

  // Maintenance status variants
  Scheduled: {
    bg: "bg-blue-100",
    text: "text-blue-800",
    border: "border-blue-200",
  },
  "In Progress": {
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    border: "border-yellow-200",
  },
  Completed: {
    bg: "bg-green-100",
    text: "text-green-800",
    border: "border-green-200",
  },
  Cancelled: {
    bg: "bg-gray-100",
    text: "text-gray-500",
    border: "border-gray-200",
  },
  // Allocation status variants
  Active: {
    bg: "bg-green-100",
    text: "text-green-800",
    border: "border-green-200",
  },
  Revoked: {
    bg: "bg-red-100",
    text: "text-red-700",
    border: "border-red-200",
  },
  Expired: {
    bg: "bg-amber-100",
    text: "text-amber-800",
    border: "border-amber-200",
  },
  Returned: {
    bg: "bg-gray-100",
    text: "text-gray-600",
    border: "border-gray-200",
  },
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  xs: "px-1.5 py-0.5 text-[10px] mobile-micro",
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-0.5 text-xs sm:px-3 sm:py-1 sm:text-sm",
};

const BADGE_BASE_CLASS =
  "inline-flex items-center rounded-full border font-semibold leading-none";

/**
 * Shared pill badge class generator for non-asset status badges.
 * Keeps badge density and font weight consistent across all pages.
 */
export const getPillBadgeClass = (
  toneClass: string,
  size: BadgeSize = "sm",
  className = "",
) => {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.sm;
  return `${BADGE_BASE_CLASS} ${sizeClass} ${toneClass} ${className}`.trim();
};

/**
 * Get style classes for a given status
 */
const getStatusStyles = (
  status: string,
): { bg: string; text: string; border: string } => {
  return (
    STATUS_STYLES[status] || {
      bg: "bg-gray-100",
      text: "text-gray-800",
      border: "border-gray-200",
    }
  );
};

/**
 * Mapping of status to Lucide Icon components
 */
const STATUS_ICONS: Record<string, any> = {
  Available: CheckCircle,
  Allocated: User,
  "Partially Allocated": User, // Or PieChart/Users if available
  "Under Maintenance": Wrench,
  "License Expired": AlertTriangle,
  Disposed: Trash2,
  Scheduled: Clock,
  "In Progress": PlayCircle,
  Completed: CheckCircle,
  Cancelled: XCircle,
  Active: CheckCircle,
  Revoked: XCircle,
  Expired: AlertTriangle,
  Returned: RefreshCw,
};

/**
 * Reusable status badge component with consistent styling
 * Used across AssetList, AssetDetail, Dashboard, and MaintenanceSchedule
 */
export function StatusBadge({
  status,
  size = "sm",
  showIcon = false,
  className = "",
  userRole,
}: StatusBadgeProps) {
  const styles = getStatusStyles(status);
  const IconComponent = STATUS_ICONS[status] || HelpCircle;

  // Role-specific label translation: Viewers see "Return" instead of "Available"
  const displayLabel = (status === "Available" && userRole === "Viewer") ? "Return" : status;

  return (
    <span
      className={getPillBadgeClass(
        `${styles.bg} ${styles.text} ${styles.border}`,
        size,
        `${showIcon ? "gap-1.5" : ""} ${className}`,
      )}>
      {showIcon && (
        <IconComponent
          className={`w-3.5 h-3.5 ${size === "xs" ? "w-3 h-3" : size === "md" ? "w-4 h-4" : ""}`}
        />
      )}
      {displayLabel}
    </span>
  );
}



/**
 * Check if asset can be allocated
 * Note: For multi-unit assets (like software licenses), even 'Allocated' status
 * doesn't mean fully allocated - we need to check actual available quantity.
 * This function is a quick status check; the backend validates actual availability.
 */
export const canAllocate = (status: Asset["status"]): boolean => {
  const blockedStatuses: Asset["status"][] = [
    "Disposed",
    "Under Maintenance",
    "License Expired",
  ];
  return !blockedStatuses.includes(status);
};

/**
 * Check if asset can be edited
 */
export const canEdit = (status: Asset["status"]): boolean => {
  return status !== "Disposed";
};

/**
 * Check if asset can be deleted
 */
export const canDelete = (status: Asset["status"]): boolean => {
  return status !== "Disposed";
};

/**
 * Get a user-friendly message explaining why an action is blocked
 */
export const getBlockedReason = (
  status: Asset["status"],
  action: "edit" | "delete" | "allocate",
): string | null => {
  if (status === "Disposed") {
    switch (action) {
      case "edit":
        return "Disposed assets cannot be edited.";
      case "delete":
        return "Disposed assets cannot be deleted to maintain audit trail.";
      case "allocate":
        return "Disposed assets cannot be allocated.";
    }
  }
  if (status === "Under Maintenance" && action === "allocate") {
    return "Assets under maintenance cannot be allocated until maintenance is complete.";
  }
  if (status === "License Expired" && action === "allocate") {
    return "Licenses marked as expired cannot be allocated until they are renewed.";
  }
  // Removed: 'Allocated' status alone no longer blocks allocation.
  // The backend validates actual available quantity for multi-unit assets.
  return null;
};
