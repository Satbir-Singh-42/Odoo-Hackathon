/**
 * Permissions & RBAC
 * Single source of truth for permission keys and role defaults.
 *
 * DB tables (Permission / RolePermission / UserPermission) are the runtime
 * source of truth once seeded — this file is what SEEDS them (prisma/seed.ts
 * reads PERMISSIONS + ROLE_PERMISSIONS from here) and what the app imports
 * for type safety and for building UI (e.g. an Admin permissions matrix).
 */

import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

// =============================================
// ROLES
// =============================================
export const ROLES = {
  ADMIN: "ADMIN",
  ASSET_MANAGER: "ASSET_MANAGER",
  DEPARTMENT_HEAD: "DEPARTMENT_HEAD",
  EMPLOYEE: "EMPLOYEE",
} as const;

// =============================================
// PERMISSIONS  (key: "resource:action")
// =============================================
export const PERMISSIONS = {
  // Organization setup
  DEPARTMENT_CREATE: "department:create",
  DEPARTMENT_READ: "department:read",
  DEPARTMENT_UPDATE: "department:update",
  DEPARTMENT_DELETE: "department:delete",

  CATEGORY_CREATE: "category:create",
  CATEGORY_READ: "category:read",
  CATEGORY_UPDATE: "category:update",
  CATEGORY_DELETE: "category:delete",

  USER_CREATE: "user:create",
  USER_READ: "user:read",
  USER_UPDATE: "user:update",
  USER_DELETE: "user:delete",
  USER_PROMOTE: "user:promote", // assign Department Head / Asset Manager

  // Assets
  ASSET_CREATE: "asset:create",
  ASSET_READ: "asset:read",
  ASSET_UPDATE: "asset:update",
  ASSET_DELETE: "asset:delete",

  // Allocation & transfer
  ALLOCATION_CREATE: "allocation:create",
  ALLOCATION_READ: "allocation:read",
  ALLOCATION_RETURN: "allocation:return",
  TRANSFER_REQUEST: "transfer:request",
  TRANSFER_APPROVE: "transfer:approve",

  // Booking
  BOOKING_CREATE: "booking:create",
  BOOKING_READ: "booking:read",
  BOOKING_CANCEL: "booking:cancel",

  // Maintenance
  MAINTENANCE_REQUEST: "maintenance:request",
  MAINTENANCE_READ: "maintenance:read",
  MAINTENANCE_APPROVE: "maintenance:approve",
  MAINTENANCE_UPDATE: "maintenance:update", // technician assignment / progress / resolve

  // Audit cycles
  AUDIT_CREATE: "audit:create",
  AUDIT_READ: "audit:read",
  AUDIT_VERIFY: "audit:verify", // auditor marks Verified/Missing/Damaged
  AUDIT_CLOSE: "audit:close",

  // Reports & dashboard
  REPORT_VIEW: "report:view",
  DASHBOARD_VIEW: "dashboard:view",

  // Notifications & logs
  NOTIFICATIONS_READ: "notifications:read",
  ACTIVITY_LOG_VIEW: "activitylog:view",

  // Permissions admin
  PERMISSIONS_MANAGE: "permissions:manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// =============================================
// ROLE -> DEFAULT PERMISSIONS
// (seeded into RolePermission; editable later from the Admin UI)
// =============================================
export const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS),

  [ROLES.ASSET_MANAGER]: [
    PERMISSIONS.CATEGORY_READ,
    PERMISSIONS.DEPARTMENT_READ,
    PERMISSIONS.USER_READ,

    PERMISSIONS.ASSET_CREATE,
    PERMISSIONS.ASSET_READ,
    PERMISSIONS.ASSET_UPDATE,
    PERMISSIONS.ASSET_DELETE,

    PERMISSIONS.ALLOCATION_CREATE,
    PERMISSIONS.ALLOCATION_READ,
    PERMISSIONS.ALLOCATION_RETURN,
    PERMISSIONS.TRANSFER_REQUEST,
    PERMISSIONS.TRANSFER_APPROVE,

    PERMISSIONS.BOOKING_READ,

    PERMISSIONS.MAINTENANCE_READ,
    PERMISSIONS.MAINTENANCE_APPROVE,
    PERMISSIONS.MAINTENANCE_UPDATE,

    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.AUDIT_VERIFY,

    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.NOTIFICATIONS_READ,
  ],

  [ROLES.DEPARTMENT_HEAD]: [
    PERMISSIONS.DEPARTMENT_READ,
    PERMISSIONS.USER_READ,

    PERMISSIONS.ASSET_READ,

    PERMISSIONS.ALLOCATION_READ,
    PERMISSIONS.TRANSFER_REQUEST,
    PERMISSIONS.TRANSFER_APPROVE, // within their department

    PERMISSIONS.BOOKING_CREATE,
    PERMISSIONS.BOOKING_READ,
    PERMISSIONS.BOOKING_CANCEL,

    PERMISSIONS.MAINTENANCE_REQUEST,
    PERMISSIONS.MAINTENANCE_READ,

    PERMISSIONS.AUDIT_READ,

    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.NOTIFICATIONS_READ,
  ],

  [ROLES.EMPLOYEE]: [
    PERMISSIONS.ASSET_READ,

    PERMISSIONS.ALLOCATION_READ, // their own
    PERMISSIONS.TRANSFER_REQUEST, // request to give up / hand over their own asset

    PERMISSIONS.BOOKING_CREATE,
    PERMISSIONS.BOOKING_READ,
    PERMISSIONS.BOOKING_CANCEL, // their own

    PERMISSIONS.MAINTENANCE_REQUEST,
    PERMISSIONS.MAINTENANCE_READ, // their own

    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.NOTIFICATIONS_READ,
  ],
};

// =============================================
// RESOLVER — effective permissions for a user
// =============================================

/**
 * Effective permissions = role defaults (RolePermission)
 *   + UserPermission rows with granted = true
 *   - UserPermission rows with granted = false
 *
 * Call this at login and on JWT refresh; cache the result on the token
 * (token.permissions) so middleware never has to hit the DB per-request.
 */
export async function resolveEffectivePermissions(
  userId: string,
  role: Role,
): Promise<string[]> {
  const [roleDefaults, overrides] = await Promise.all([
    prisma.rolePermission.findMany({
      where: { role },
      include: { permission: true },
    }),
    prisma.userPermission.findMany({
      where: { userId },
      include: { permission: true },
    }),
  ]);

  const effective = new Set(roleDefaults.map((rp) => rp.permission.key));

  for (const override of overrides) {
    if (override.granted) {
      effective.add(override.permission.key);
    } else {
      effective.delete(override.permission.key);
    }
  }

  return Array.from(effective);
}

// =============================================
// HELPERS (used by middleware + API route guards)
// =============================================

export function hasPermission(
  userPermissions: string[],
  required: PermissionKey,
): boolean {
  return userPermissions.includes(required);
}

export function hasAllPermissions(
  userPermissions: string[],
  required: PermissionKey[],
): boolean {
  return required.every((p) => userPermissions.includes(p));
}

export function hasAnyPermission(
  userPermissions: string[],
  required: PermissionKey[],
): boolean {
  return required.some((p) => userPermissions.includes(p));
}

// =============================================
// ROUTE -> REQUIRED PERMISSION MAP
// middleware.ts looks up "METHOD:/api/path" here to decide what to check.
// Keep this in sync with src/app/api/**/route.ts.
// =============================================
export const ROUTE_PERMISSIONS: Record<string, PermissionKey> = {
  "POST:/api/assets": PERMISSIONS.ASSET_CREATE,
  "PUT:/api/assets": PERMISSIONS.ASSET_UPDATE,
  "PATCH:/api/assets": PERMISSIONS.ASSET_UPDATE,
  "DELETE:/api/assets": PERMISSIONS.ASSET_DELETE,

  "POST:/api/allocations": PERMISSIONS.ALLOCATION_CREATE,
  "PATCH:/api/allocations/return": PERMISSIONS.ALLOCATION_RETURN,

  "POST:/api/transfers": PERMISSIONS.TRANSFER_REQUEST,
  "PATCH:/api/transfers/approve": PERMISSIONS.TRANSFER_APPROVE,
  "PATCH:/api/transfers/reject": PERMISSIONS.TRANSFER_APPROVE,

  "POST:/api/bookings": PERMISSIONS.BOOKING_CREATE,
  "PATCH:/api/bookings/cancel": PERMISSIONS.BOOKING_CANCEL,

  "POST:/api/maintenance": PERMISSIONS.MAINTENANCE_REQUEST,
  "PATCH:/api/maintenance/approve": PERMISSIONS.MAINTENANCE_APPROVE,
  "PATCH:/api/maintenance/reject": PERMISSIONS.MAINTENANCE_APPROVE,
  "PATCH:/api/maintenance": PERMISSIONS.MAINTENANCE_UPDATE,

  "POST:/api/audit-cycles": PERMISSIONS.AUDIT_CREATE,
  "PATCH:/api/audit-cycles/verify": PERMISSIONS.AUDIT_VERIFY,
  "PATCH:/api/audit-cycles/close": PERMISSIONS.AUDIT_CLOSE,

  "POST:/api/departments": PERMISSIONS.DEPARTMENT_CREATE,
  "PUT:/api/departments": PERMISSIONS.DEPARTMENT_UPDATE,
  "DELETE:/api/departments": PERMISSIONS.DEPARTMENT_DELETE,

  "POST:/api/categories": PERMISSIONS.CATEGORY_CREATE,
  "PUT:/api/categories": PERMISSIONS.CATEGORY_UPDATE,
  "DELETE:/api/categories": PERMISSIONS.CATEGORY_DELETE,

  "POST:/api/users": PERMISSIONS.USER_CREATE,
  "PUT:/api/users": PERMISSIONS.USER_UPDATE,
  "DELETE:/api/users": PERMISSIONS.USER_DELETE,
  "PATCH:/api/users/promote": PERMISSIONS.USER_PROMOTE,
};