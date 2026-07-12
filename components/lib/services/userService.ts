/**
 * User Service
 * Prisma-based business logic ported from server/routes/users.js
 */

import { prisma } from "@/lib/prisma";
import { auditUser, writeAuditLog } from "@/lib/audit";
import { hash } from "bcryptjs";
import type { Prisma } from "@prisma/client";

// =============================================
// TYPES
// =============================================

export interface UserListParams {
  search?: string;
  role?: string;
  department?: string;
  isBlocked?: boolean;
  isDeleted?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface CreateUserData {
  id: string; // EmployeeID
  fullName: string;
  department?: string;
  email?: string;
  password: string;
  role?: string;
  managedCategories?: string;
}

export interface UpdateUserData {
  fullName?: string;
  department?: string;
  email?: string;
  role?: string;
  managedCategories?: string;
  isBlocked?: boolean;
}

// =============================================
// LIST USERS
// =============================================

export async function listUsers(params: UserListParams) {
  const {
    search,
    role,
    department,
    isBlocked,
    isDeleted = false,
    page = 1,
    pageSize = 50,
    sortBy = "fullName",
    sortOrder = "asc",
  } = params;

  const where: Prisma.UserWhereInput = { isDeleted };

  if (role) where.role = role as any;
  if (department) where.department = { contains: department, mode: "insensitive" };
  if (isBlocked !== undefined) where.isBlocked = isBlocked;

  if (search) {
    where.OR = [
      { id: { contains: search, mode: "insensitive" } },
      { fullName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { department: { contains: search, mode: "insensitive" } },
    ];
  }

  const skip = (page - 1) * pageSize;
  const validSortFields: Record<string, boolean> = {
    fullName: true, id: true, role: true, department: true, createdAt: true,
  };
  const orderByField = validSortFields[sortBy] ? sortBy : "fullName";

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { [orderByField]: sortOrder },
      select: {
        id: true,
        fullName: true,
        department: true,
        email: true,
        role: true,
        managedCategories: true,
        isBlocked: true,
        isDeleted: true,
        createdAt: true,
        updatedAt: true,
        // Exclude password
        password: false,
        lastLogoutAt: false,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// =============================================
// GET USER BY ID
// =============================================

export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      department: true,
      email: true,
      role: true,
      managedCategories: true,
      isBlocked: true,
      isDeleted: true,
      createdAt: true,
      updatedAt: true,
      password: false,
      lastLogoutAt: false,
    },
  });
}

// =============================================
// CREATE USER
// =============================================

export async function createUser(
  data: CreateUserData,
  performedBy: string
) {
  // Check for duplicate EmployeeID
  const existing = await prisma.user.findUnique({ where: { id: data.id } });
  if (existing) {
    throw new Error(`Employee ID "${data.id}" already exists.`);
  }

  // Check for duplicate email
  if (data.email) {
    const dupEmail = await prisma.user.findFirst({
      where: { email: data.email, isDeleted: false },
    });
    if (dupEmail) {
      throw new Error(`Email "${data.email}" is already in use.`);
    }
  }

  const hashedPassword = await hash(data.password, 12);

  const user = await prisma.user.create({
    data: {
      id: data.id,
      fullName: data.fullName,
      department: data.department,
      email: data.email,
      password: hashedPassword,
      role: (data.role as any) ?? "Viewer",
      managedCategories: data.managedCategories ?? "ALL",
    },
    select: {
      id: true,
      fullName: true,
      department: true,
      email: true,
      role: true,
      managedCategories: true,
      createdAt: true,
      password: false,
    },
  });

  await auditUser("CREATION", user.id, performedBy, {
    newValues: { fullName: user.fullName, role: user.role },
  });

  return user;
}

// =============================================
// UPDATE USER
// =============================================

export async function updateUser(
  id: string,
  data: UpdateUserData,
  performedBy: string
) {
  const existing = await prisma.user.findFirst({
    where: { id, isDeleted: false },
  });
  if (!existing) throw new Error("User not found.");

  const oldRole = existing.role;

  const updated = await prisma.user.update({
    where: { id },
    data: {
      fullName: data.fullName,
      department: data.department,
      email: data.email,
      role: data.role as any,
      managedCategories: data.managedCategories,
      isBlocked: data.isBlocked,
    },
    select: {
      id: true, fullName: true, department: true, email: true,
      role: true, managedCategories: true, isBlocked: true,
      password: false,
    },
  });

  if (data.role && data.role !== oldRole) {
    await auditUser("ROLE_CHANGE", id, performedBy, {
      oldValues: { role: oldRole },
      newValues: { role: data.role },
    });
  } else {
    await auditUser("UPDATE", id, performedBy, {
      newValues: { fullName: data.fullName, department: data.department },
    });
  }

  if (data.isBlocked !== undefined && data.isBlocked !== existing.isBlocked) {
    await auditUser("USER_BLOCK_TOGGLE", id, performedBy, {
      newValues: { isBlocked: data.isBlocked },
    });
  }

  return updated;
}

// =============================================
// DELETE USER (soft)
// =============================================

export async function deleteUser(id: string, performedBy: string) {
  const existing = await prisma.user.findFirst({
    where: { id, isDeleted: false },
  });
  if (!existing) throw new Error("User not found.");

  // Cannot delete yourself
  if (id === performedBy) {
    throw new Error("You cannot delete your own account.");
  }

  // Check for active allocations
  const activeAllocs = await prisma.allocation.count({
    where: { employeeId: id, status: "ACTIVE", isDeleted: false },
  });
  if (activeAllocs > 0) {
    throw new Error(
      `Cannot delete user with ${activeAllocs} active asset allocation(s). Return the assets first.`
    );
  }

  await prisma.user.update({
    where: { id },
    data: { isDeleted: true },
  });

  await auditUser("DELETION", id, performedBy, {
    oldValues: { fullName: existing.fullName, role: existing.role },
  });
}

// =============================================
// CHANGE PASSWORD
// =============================================

export async function changePassword(
  id: string,
  currentPassword: string,
  newPassword: string,
  performedBy: string
) {
  const { compare } = await import("bcryptjs");
  const user = await prisma.user.findFirst({
    where: { id, isDeleted: false },
    select: { id: true, password: true },
  });
  if (!user || !user.password) throw new Error("User not found.");

  const valid = await compare(currentPassword, user.password);
  if (!valid) throw new Error("Current password is incorrect.");

  const hashed = await hash(newPassword, 12);
  await prisma.user.update({
    where: { id },
    data: { password: hashed, lastLogoutAt: new Date() }, // invalidate all existing tokens
  });

  await auditUser("PASSWORD_CHANGE", id, performedBy);
}

// =============================================
// RESET PASSWORD (Admin)
// =============================================

export async function adminResetPassword(
  id: string,
  newPassword: string,
  performedBy: string
) {
  const user = await prisma.user.findFirst({
    where: { id, isDeleted: false },
  });
  if (!user) throw new Error("User not found.");

  const hashed = await hash(newPassword, 12);
  await prisma.user.update({
    where: { id },
    data: { password: hashed, lastLogoutAt: new Date() }, // invalidate all existing tokens
  });

  await auditUser("PASSWORD_CHANGE", id, performedBy, {
    additionalInfo: { resetBy: performedBy },
  });
}

// =============================================
// FORGOT PASSWORD (generates reset token)
// =============================================

export async function createPasswordResetToken(email: string) {
  const user = await prisma.user.findFirst({
    where: { email, isDeleted: false, isBlocked: false },
  });
  // Return silently even if user not found (security — don't reveal existence)
  if (!user) return null;

  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.verificationToken.upsert({
    where: { identifier_token: { identifier: email, token: "_" } },
    create: { identifier: email, token, expires },
    update: { token, expires },
  }).catch(async () => {
    // If upsert fails (token doesn't exist yet), just create
    await prisma.verificationToken.create({
      data: { identifier: email, token, expires },
    });
  });

  return { token, user };
}

// =============================================
// VERIFY & CONSUME RESET TOKEN
// =============================================

export async function resetPasswordWithToken(
  token: string,
  newPassword: string
) {
  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });
  if (!record) throw new Error("Invalid or expired reset token.");
  if (record.expires < new Date()) throw new Error("Reset token has expired.");

  const user = await prisma.user.findFirst({
    where: { email: record.identifier, isDeleted: false },
  });
  if (!user) throw new Error("User not found.");

  const hashed = await hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, lastLogoutAt: new Date() },
    }),
    prisma.verificationToken.delete({ where: { token } }),
  ]);

  await auditUser("PASSWORD_CHANGE", user.id, user.id, {
    additionalInfo: { method: "reset-token" },
  });
}
