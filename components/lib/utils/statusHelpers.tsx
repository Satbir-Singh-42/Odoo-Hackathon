import React from "react";
import {
  CheckCircle,
  User,
  Wrench,
  Trash2,
  Box,
  Clock,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { ASSET_STATUS, MAINTENANCE_STATUS } from '@/config/constants';

type IconSize = "sm" | "md";

const SIZE_CLASSES: Record<IconSize, string> = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
};

/**
 * Get icon element for asset status.
 */
export function getAssetStatusIcon(
  status: string,
  size: IconSize = "md",
): React.ReactElement {
  const cls = SIZE_CLASSES[size];
  switch (status) {
    case ASSET_STATUS.AVAILABLE:
      return <CheckCircle className={cls} />;
    case ASSET_STATUS.ALLOCATED:
    case ASSET_STATUS.PARTIALLY_ALLOCATED:
      return <User className={cls} />;
    case ASSET_STATUS.UNDER_MAINTENANCE:
      return <Wrench className={cls} />;
    case ASSET_STATUS.DISPOSED:
      return <Trash2 className={cls} />;
    default:
      return <Box className={cls} />;
  }
}



/**
 * Get icon element for maintenance status.
 */
export function getMaintenanceStatusIcon(
  status: string,
  size: IconSize = "md",
): React.ReactElement {
  const cls = SIZE_CLASSES[size];
  switch (status) {
    case MAINTENANCE_STATUS.COMPLETED:
      return <CheckCircle className={cls} />;
    case MAINTENANCE_STATUS.IN_PROGRESS:
      return <Clock className={cls} />;
    case MAINTENANCE_STATUS.SCHEDULED:
      return <Calendar className={cls} />;
    case "Cancelled":
      return <AlertCircle className={cls} />;
    default:
      return <Clock className={cls} />;
  }
}

/**
 * Get Tailwind badge classes for an asset condition.
 */
export function getConditionBadgeColor(
  condition: string | null | undefined,
): string {
  switch (condition?.toUpperCase()) {
    case "EXCELLENT":
      return "text-green-700 bg-green-50 border-green-200";
    case "GOOD":
      return "text-blue-700 bg-blue-50 border-blue-200";
    case "FAIR":
      return "text-yellow-700 bg-yellow-50 border-yellow-200";
    case "POOR":
      return "text-red-700 bg-red-50 border-red-200";
    default:
      return "text-gray-600 bg-gray-50 border-gray-200";
  }
}
