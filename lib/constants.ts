/**
 * Server Constants Configuration
 * Single source of truth for all backend constants
 */

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

// =============================================
// ALLOCATION STATUS
// =============================================
export const ALLOCATION_STATUS = {
  ACTIVE: "ACTIVE",
  RETURNED: "RETURNED",
  REVOKED: "REVOKED",
  EXPIRED: "EXPIRED",
} as const;

// =============================================
// MAINTENANCE STATUS
// =============================================
export const MAINTENANCE_STATUS = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  REPORTED: "Reported",
  CANCELLED: "Cancelled",
} as const;

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
  MAINTENANCE_CANCEL: "MAINTENANCE_CANCEL",
  MAINTENANCE_SCHEDULE: "MAINTENANCE_SCHEDULE",
  LICENSE_EXPIRED: "LICENSE_EXPIRED",
  LICENSE_RENEWED: "LICENSE_RENEWED",
  UPDATE: "UPDATE",
  REVOKED: "REVOKED",
} as const;

// =============================================
// AUDIT LOG ACTIONS
// =============================================
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
  USER_BLOCK_TOGGLE: "USER_BLOCK_TOGGLE",
  UNAUTHORIZED_ACCESS: "UNAUTHORIZED_ACCESS",
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  LOGIN_FAILED: "LOGIN_FAILED",
  CREATION: "CREATION",
  DELETION: "DELETION",
} as const;

// =============================================
// RBAC - USER ROLES
// =============================================
export const USER_ROLES = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  VIEWER: "Viewer",
} as const;

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
export const ROLE_PERMISSIONS = {
  [USER_ROLES.ADMIN]: [
    // Full access to everything
    ...Object.values(PERMISSIONS),
  ],
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

    // Users - Read only (used for dropdowns)
    PERMISSIONS.USER_READ,

    // Vendors - Read only (used for dropdowns)
    PERMISSIONS.VENDOR_READ,

    // Reports & History - View only (Audit restricted to Admin)
    PERMISSIONS.REPORT_VIEW,
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
// HTTP STATUS CODES
// =============================================
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  MULTI_STATUS: 207,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GONE: 410,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

// =============================================
// HELPER FUNCTIONS
// =============================================

/**
 * Get authenticated user ID from request.
 * Note: In Next.js App Router, prefer using next-auth session \`auth()\` instead.
 * This is provided for backwards compatibility with legacy code or explicit header injection.
 */
export const getDefaultUserId = (req: any): string => {
  const userId = req?.userId || (req?.headers && typeof req.headers.get === 'function' ? req.headers.get("x-user-id") : req?.headers?.["x-user-id"]);
  if (!userId) {
    throw new Error("User not authenticated. No user ID found in request.");
  }
  // Block known system identifiers from being treated as real users
  if (userId.toLowerCase() === "admin") {
    throw new Error("System identifiers cannot be used as user credentials.");
  }
  return userId;
};
