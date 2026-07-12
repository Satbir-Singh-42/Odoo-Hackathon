/**
 * Auth.js (NextAuth) Type Augmentation
 * Extends the default Session and JWT types to include
 * AssetFlow-specific fields: role, employeeId, managedCategories, permissions.
 */

import type { DefaultSession, DefaultUser } from "next-auth";
import type { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      /** EmployeeID — primary key, e.g. "EMP001" */
      id: string;
      employeeId: string;
      fullName: string;
      department?: string | null;
      role: string;
      /**
       * Comma-separated list of authorized category names.
       * "ALL" means unrestricted (Admin + Viewers).
       * Used for Category-Based Access Control (CBAC) for Managers.
       */
      managedCategories: string;
      /** Resolved list of permission strings for this role. */
      permissions: string[];
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    id: string;
    employeeId: string;
    fullName: string;
    department?: string | null;
    role: string;
    managedCategories: string;
    permissions: string[];
    lastLogoutAt?: Date | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    employeeId: string;
    fullName: string;
    department?: string | null;
    role: string;
    managedCategories: string;
    permissions: string[];
    lastLogoutAt?: number | null; // epoch ms
    iat: number;
    exp: number;
  }
}
