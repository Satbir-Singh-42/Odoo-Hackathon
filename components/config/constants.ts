/**
 * Application Constants Configuration
 * Single source of truth for all system-wide constants
 */

// =============================================
// RBAC - USER ROLES
// =============================================
export const USER_ROLES = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  VIEWER: "Viewer",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

// =============================================
// RBAC - PERMISSIONS
// =============================================
export const PERMISSIONS = {
  // Asset Permissions
  ASSET_CREATE: "asset:create",
  ASSET_READ: "asset:read",
  ASSET_UPDATE: "asset:update",
  ASSET_DELETE: "asset:delete",
  ASSET_ALLOCATE: "asset:allocate",
  ASSET_RETURN: "asset:return",
  ASSET_DISPOSE: "asset:dispose",

  // Maintenance Permissions
  MAINTENANCE_CREATE: "maintenance:create",
  MAINTENANCE_READ: "maintenance:read",
  MAINTENANCE_UPDATE: "maintenance:update",
  MAINTENANCE_DELETE: "maintenance:delete",

  // User Permissions
  USER_CREATE: "user:create",
  USER_READ: "user:read",
  USER_UPDATE: "user:update",
  USER_DELETE: "user:delete",

  // Vendor Permissions
  VENDOR_CREATE: "vendor:create",
  VENDOR_READ: "vendor:read",
  VENDOR_UPDATE: "vendor:update",
  VENDOR_DELETE: "vendor:delete",

  // Reports & Audit
  REPORT_VIEW: "report:view",
  AUDIT_VIEW: "audit:view",
  HISTORY_VIEW: "history:view",

  // Dashboard
  DASHBOARD_VIEW: "dashboard:view",
} as const;

// =============================================
// RBAC - ROLE PERMISSIONS MAPPING
// =============================================
export const ROLE_PERMISSIONS: Record<UserRole, readonly string[]> = {
  [USER_ROLES.ADMIN]: Object.values(PERMISSIONS),
  [USER_ROLES.MANAGER]: [
    // Assets - All except delete
    PERMISSIONS.ASSET_CREATE,
    PERMISSIONS.ASSET_READ,
    PERMISSIONS.ASSET_UPDATE,
    PERMISSIONS.ASSET_ALLOCATE,
    PERMISSIONS.ASSET_RETURN,
    PERMISSIONS.ASSET_DISPOSE,

    // Maintenance - All except delete
    PERMISSIONS.MAINTENANCE_CREATE,
    PERMISSIONS.MAINTENANCE_READ,
    PERMISSIONS.MAINTENANCE_UPDATE,

    // Users - Read and Update only
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_UPDATE,

    // Vendors - All except delete
    PERMISSIONS.VENDOR_CREATE,
    PERMISSIONS.VENDOR_READ,
    PERMISSIONS.VENDOR_UPDATE,

    // Reports & Audit - View only
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.HISTORY_VIEW,
    PERMISSIONS.DASHBOARD_VIEW,
  ],
  [USER_ROLES.VIEWER]: [
    // Read-only access
    PERMISSIONS.ASSET_READ,
    PERMISSIONS.MAINTENANCE_READ,
    PERMISSIONS.USER_READ,
    PERMISSIONS.VENDOR_READ,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.HISTORY_VIEW,
    PERMISSIONS.DASHBOARD_VIEW,
  ],
} as const;

// =============================================
// RBAC - HELPER FUNCTIONS
// =============================================

/**
 * Check if user has a specific permission
 */
export const hasPermission = (role: UserRole, permission: string): boolean => {
  return ROLE_PERMISSIONS[role]?.includes(permission) || false;
};

/**
 * Check if user can create
 */
export const canCreate = (role: UserRole): boolean =>
  role === USER_ROLES.ADMIN || role === USER_ROLES.MANAGER;

/**
 * Check if user can update
 */
export const canUpdate = (role: UserRole): boolean =>
  role === USER_ROLES.ADMIN || role === USER_ROLES.MANAGER;

/**
 * Check if user can delete
 */
export const canDelete = (role: UserRole): boolean => role === USER_ROLES.ADMIN;

/**
 * Check if user can dispose assets
 */
export const canDispose = (role: UserRole): boolean =>
  role === USER_ROLES.ADMIN || role === USER_ROLES.MANAGER;

// =============================================
// DATE FORMAT (Indian/European Standard)
// =============================================

// =============================================
// ASSET CONDITIONS
// =============================================
export const ASSET_CONDITIONS = {
  EXCELLENT: "EXCELLENT",
  GOOD: "GOOD",
  FAIR: "FAIR",
  POOR: "POOR",
} as const;

export const DEFAULT_CONDITION = ASSET_CONDITIONS.EXCELLENT;

// Array format for SearchableSelect components (generated from objects)
const toSelectArray = (obj: Record<string, string>) =>
  Object.values(obj).map((v) => ({
    value: v,
    label: v.charAt(0) + v.slice(1).toLowerCase(),
  }));

export const ASSET_CONDITIONS_ARRAY = toSelectArray(
  ASSET_CONDITIONS,
) as readonly { value: string; label: string }[];

// Legacy type alias for backward compatibility
export type AssetCondition = string;
export const DEFAULT_ASSET_CONDITION: AssetCondition = "EXCELLENT";

// =============================================
// ASSET STATUS
// =============================================
export const ASSET_STATUS = {
  AVAILABLE: "Available",
  ALLOCATED: "Allocated",
  PARTIALLY_ALLOCATED: "Partially Allocated",
  UNDER_MAINTENANCE: "Under Maintenance",
  LICENSE_EXPIRED: "License Expired",
  DISPOSED: "Disposed",
} as const;

// Array format for SearchableSelect and filters (generated from ASSET_STATUS)
export const ASSET_STATUS_ARRAY = Object.values(ASSET_STATUS).map((v) => ({
  value: v,
  label: v,
})) as readonly { value: string; label: string }[];

// =============================================
// ALLOCATION STATUS
// =============================================
export const ALLOCATION_STATUS_DISPLAY = {
  ACTIVE: "Active",
  RETURNED: "Returned",
  REVOKED: "Revoked",
  EXPIRED: "Expired",
} as const;

// =============================================
// MAINTENANCE STATUS
// =============================================
export const MAINTENANCE_STATUS = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REPORTED: "Reported",
} as const;

// =============================================
// MAINTENANCE FREQUENCY
// =============================================
export const MAINTENANCE_FREQUENCY = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-Yearly",
  YEARLY: "Yearly",
  ONE_TIME: "One-Time",
} as const;

// =============================================
// ASSET CATEGORIES (built-in types with special handling)
// Users can create custom categories via the form
// =============================================
export const ASSET_CATEGORIES = {
  HARDWARE: "Hardware",
  SOFTWARE: "Software",
  NETWORKING: "Networking",
} as const;

// =============================================
// CATEGORY HELPERS — data-driven field visibility
// These helpers determine which fields are relevant for a given category.
// Unknown/custom categories default to showing hardware-like fields.
// =============================================

/**
 * Whether the category uses license fields (licenseType, licenseExpiryDate, totalQuantity as licenses)
 * Software always does; future categories can be added here.
 */
export const isSoftwareLikeCategory = (category: string): boolean =>
  category === ASSET_CATEGORIES.SOFTWARE;

/**
 * Whether the category shows hardware spec fields (processor, ram, storage)
 * Only Hardware category shows them by default. Existing assets with these fields will show them too.
 */
export const hasHardwareSpecs = (category: string): boolean =>
  category === ASSET_CATEGORIES.HARDWARE;

/**
 * Whether the category shows networking spec fields (portCount, portSpeed)
 * Networking always does; other categories don't.
 */
export const hasNetworkingSpecs = (category: string): boolean =>
  category === ASSET_CATEGORIES.NETWORKING;

/**
 * Whether the category supports deployment fields (ipAddress, macAddress) during allocation.
 * Hardware and Networking support this.
 */
export const hasDeploymentFields = (category: string): boolean =>
  category === ASSET_CATEGORIES.HARDWARE ||
  category === ASSET_CATEGORIES.NETWORKING;

/**
 * Whether the category supports the operating system field during allocation.
 * Only Hardware does.
 */
export const hasOperatingSystemField = (category: string): boolean =>
  category === ASSET_CATEGORIES.HARDWARE;

// =============================================
// ACTION TYPES (for History and Audit)
// =============================================
export const ACTION_TYPES = {
  CREATION: "CREATION",
  ALLOCATION: "ALLOCATION",
  RETURN: "RETURN",
  DISPOSAL: "DISPOSAL",
  DELETION: "DELETION",
  MAINTENANCE_START: "MAINTENANCE_START",
  MAINTENANCE_END: "MAINTENANCE_END",
  MAINTENANCE_SCHEDULE: "MAINTENANCE_SCHEDULE",
  MAINTENANCE_CANCEL: "MAINTENANCE_CANCEL",
  LICENSE_EXPIRED: "LICENSE_EXPIRED",
  LICENSE_RENEWED: "LICENSE_RENEWED",
  UPDATE: "UPDATE",
  REVOKED: "REVOKED",
} as const;

// =============================================
// QUANTITY DEFAULTS
// =============================================
export const QUANTITY = {
  DEFAULT_TOTAL: 1,
  MINIMUM: 0,
  DEFAULT_ALLOCATION: 1,
} as const;

// =============================================
// VALIDATION LIMITS
// =============================================
export const VALIDATION = {
  ASSET_CODE_MAX_LENGTH: 20,
  ASSET_NAME_MAX_LENGTH: 150,
  EMPLOYEE_ID_MAX_LENGTH: 20,
  VENDOR_ID_MAX_LENGTH: 20,
  NOTES_MAX_LENGTH: 255,
  DESCRIPTION_MAX_LENGTH: 500,
  SERIAL_NUMBER_MAX_LENGTH: 50,
  MODEL_MAX_LENGTH: 50,
} as const;

// =============================================
// UI CONSTANTS
// =============================================
export const RECORDS_PER_PAGE = 25;

// =============================================
// HARDWARE SPEC OPTIONS (SearchableSelect)
// =============================================
export const RAM_OPTIONS = [
  { value: "8GB", label: "8GB" },
  { value: "16GB", label: "16GB" },
  { value: "32GB", label: "32GB" },
  { value: "64GB", label: "64GB" },
];

export const STORAGE_OPTIONS = [
  { value: "256GB SSD", label: "256GB SSD" },
  { value: "512GB SSD", label: "512GB SSD" },
  { value: "1TB SSD", label: "1TB SSD" },
  { value: "2TB HDD", label: "2TB HDD" },
];

// =============================================
// CHART STYLES (Recharts)
// =============================================
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.98)",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
  padding: "12px",
} as const;

export const CHART_LEGEND_STYLE = {
  fontSize: "14px",
  fontWeight: "500",
} as const;

// =============================================
// FEATURE FLAGS
// =============================================
export const HIDE_DELETE_UI = true;
