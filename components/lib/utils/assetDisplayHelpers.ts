import { Asset } from '@/types';

// =============================================
// SHARED DISPLAY CONSTANTS
// =============================================

/**
 * Status dot + highlight color pairs, used by AssetList and AllocationsPage
 * for their filter dropdowns and row styling.
 */
export const STATUS_DOT_HL: Record<string, { dot: string; hl: string }> = {
    all: { dot: "bg-gray-400", hl: "bg-gray-50 text-gray-700" },
    Available: { dot: "bg-green-500", hl: "bg-green-50 text-green-700" },
    Allocated: { dot: "bg-blue-500", hl: "bg-blue-50 text-blue-700" },
    "Partially Allocated": {
        dot: "bg-indigo-500",
        hl: "bg-indigo-50 text-indigo-700",
    },
    "Under Maintenance": {
        dot: "bg-amber-500",
        hl: "bg-amber-50 text-amber-700",
    },
    "License Expired": {
        dot: "bg-red-500",
        hl: "bg-red-50 text-red-700",
    },
    Disposed: { dot: "bg-red-500", hl: "bg-red-50 text-red-700" },
};

// =============================================
// SHARED DISPLAY HELPERS
// =============================================

/**
 * Get a human-readable allocation display for an asset.
 * Used by both AssetList (table rows) and AllocationsPage (table rows).
 */
export const getAllocationDisplay = (
    asset: Asset,
): { primary: string; secondary: string } => {
    if (asset.userName) {
        return { primary: asset.userName, secondary: asset.employeeId || "" };
    }
    if (asset.parentAssetName) {
        return { primary: asset.parentAssetName, secondary: "Installed in Asset" };
    }
    if (asset.installationLocation) {
        return { primary: asset.installationLocation, secondary: "Installed at Location" };
    }
    return { primary: "Unassigned", secondary: "" };
};
