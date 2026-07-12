/**
 * Permissions & RBAC
 * Ported from server/config/constants.js
 * Single source of truth for roles, permissions, and role-permission mapping.
 */

// =============================================
// USER ROLES
// =============================================
export const USER_ROLES = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  VIEWER: "Viewer",
} as const;

export type UserRoleType = (typeof USER_ROLES)[keyof typeof USER_ROLES];

// =============================================
// PERMISSIONS
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

  // Settings
  SETTINGS_READ: "settings:read",
  SETTINGS_WRITE: "settings:write",

  // Notifications
  NOTIFICATIONS_READ: "notifications:read",
  NOTIFICATIONS_MANAGE: "notifications:manage",
} as const;

export type PermissionType = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// =============================================
// ROLE → PERMISSIONS MAPPING
// Matches the existing MSSQL RBAC logic exactly.
// =============================================
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  [USER_ROLES.ADMIN]: [
    // Full access to everything
    ...Object.values(PERMISSIONS),
  ],
  [USER_ROLES.MANAGER]: [
    // Assets - All except hard delete
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

    // Users - Read only (for dropdowns)
    PERMISSIONS.USER_READ,

    // Vendors - Read only (for dropdowns)
    PERMISSIONS.VENDOR_READ,

    // Reports & History (Audit restricted to Admin)
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.HISTORY_VIEW,
    PERMISSIONS.DASHBOARD_VIEW,

    // Notifications
    PERMISSIONS.NOTIFICATIONS_READ,

    // Settings - read only
    PERMISSIONS.SETTINGS_READ,
  ],
  [USER_ROLES.VIEWER]: [
    // Read-only access across the board
    PERMISSIONS.ASSET_READ,
    PERMISSIONS.MAINTENANCE_READ,
    PERMISSIONS.USER_READ,
    PERMISSIONS.VENDOR_READ,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.HISTORY_VIEW,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.NOTIFICATIONS_READ,
    PERMISSIONS.SETTINGS_READ,
  ],
};

// =============================================
// HELPERS
// =============================================

/**
 * Resolve the full list of permissions for a given role.
 */
export function resolvePermissions(role: string): string[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Check whether a user's permission list includes the required permission.
 * Used by middleware.ts and API route guards.
 */
export function hasPermission(
  userPermissions: string[],
  required: string
): boolean {
  return userPermissions.includes(required);
}

/**
 * Check whether a user has ALL of the specified permissions.
 */
export function hasAllPermissions(
  userPermissions: string[],
  required: string[]
): boolean {
  return required.every((p) => userPermissions.includes(p));
}

/**
 * Check whether a user has ANY of the specified permissions.
 */
export function hasAnyPermission(
  userPermissions: string[],
  required: string[]
): boolean {
  return required.some((p) => userPermissions.includes(p));
}

// =============================================
// ASSET STATUS & CONDITIONS (shared constants)
// =============================================
export const ASSET_STATUS = {
  AVAILABLE: "Available",
  ALLOCATED: "Allocated",
  PARTIALLY_ALLOCATED: "Partially Allocated",
  UNDER_MAINTENANCE: "Under Maintenance",
  LICENSE_EXPIRED: "License Expired",
  DISPOSED: "Disposed",
} as const;

export const ASSET_CONDITIONS = {
  EXCELLENT: "EXCELLENT",
  GOOD: "GOOD",
  FAIR: "FAIR",
  POOR: "POOR",
} as const;

export const ALLOCATION_STATUS = {
  ACTIVE: "ACTIVE",
  RETURNED: "RETURNED",
  REVOKED: "REVOKED",
  EXPIRED: "EXPIRED",
} as const;

export const MAINTENANCE_STATUS = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  REPORTED: "Reported",
  CANCELLED: "Cancelled",
} as const;

export const ACTION_TYPES = {
  CREATION: "CREATION",
  ALLOCATION: "ALLOCATION",
  RETURN: "RETURN",
  DISPOSAL: "DISPOSAL",
  DELETION: "DELETION",
  MAINTENANCE_START: "MAINTENANCE_START",
  MAINTENANCE_END: "MAINTENANCE_END",
  MAINTENANCE_CANCEL: "MAINTENANCE_CANCEL",
  MAINTENANCE_SCHEDULE: "MAINTENANCE_SCHEDULE",
  LICENSE_EXPIRED: "LICENSE_EXPIRED",
  LICENSE_RENEWED: "LICENSE_RENEWED",
  UPDATE: "UPDATE",
  REVOKED: "REVOKED",
} as const;

export const AUDIT_ACTIONS = {
  INSERT: "INSERT",
  ASSET_INSERT: "ASSET_INSERT",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  ALLOCATE: "ALLOCATE",
  RETURN: "RETURN",
  MAINTENANCE: "MAINTENANCE",
  MAINTENANCE_UPDATE: "MAINTENANCE_UPDATE",
  MAINTENANCE_START: "MAINTENANCE_START",
  MAINTENANCE_END: "MAINTENANCE_END",
  MAINTENANCE_SCHEDULE: "MAINTENANCE_SCHEDULE",
  MAINTENANCE_CANCEL: "MAINTENANCE_CANCEL",
  LICENSE_RENEWED: "LICENSE_RENEWED",
  DISPOSE: "DISPOSE",
  ROLE_CHANGE: "ROLE_CHANGE",
  PASSWORD_CHANGE: "PASSWORD_CHANGE",
  USER_BLOCK_TOGGLE: "USER_BLOCK_TOGGLE",
  UNAUTHORIZED_ACCESS: "UNAUTHORIZED_ACCESS",
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  LOGIN_FAILED: "LOGIN_FAILED",
  CREATION: "CREATION",
  DELETION: "DELETION",
  EMAIL_SENT: "EMAIL_SENT",
  EMAIL_SUPPRESSED: "EMAIL_SUPPRESSED",
  EMAIL_MERGED: "EMAIL_MERGED",
} as const;
