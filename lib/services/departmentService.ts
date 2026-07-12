import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export interface DepartmentListParams {
  search?: string;
  status?: string;
  isDeleted?: boolean;
}

export async function listDepartments(params: DepartmentListParams = {}) {
  const { search, status, isDeleted = false } = params;

  const where: any = { isDeleted };

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
    ];
  }

  return prisma.department.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      head: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      parent: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

export async function getDepartmentById(id: number) {
  return prisma.department.findUnique({
    where: { id },
    include: {
      head: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      parent: {
        select: {
          id: true,
          name: true,
        },
      },
      subDepartments: true,
      users: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });
}

export async function createDepartment(data: {
  name: string;
  departmentHeadId?: string | null;
  parentDepartmentId?: number | null;
  status?: string;
}, changedBy: string) {
  const department = await prisma.department.create({
    data: {
      name: data.name,
      departmentHeadId: data.departmentHeadId || null,
      parentDepartmentId: data.parentDepartmentId || null,
      status: data.status || "Active",
    },
  });

  // Log in AuditLog
  await writeAuditLog({
    tableName: "departments",
    recordId: department.id,
    action: "CREATION",
    changedBy,
    newValues: {
      name: department.name,
      departmentHeadId: department.departmentHeadId,
      parentDepartmentId: department.parentDepartmentId,
      status: department.status,
    },
  });

  return department;
}

export async function updateDepartment(id: number, data: {
  name?: string;
  departmentHeadId?: string | null;
  parentDepartmentId?: number | null;
  status?: string;
  isDeleted?: boolean;
}, changedBy: string) {
  const old = await prisma.department.findUnique({ where: { id } });

  const department = await prisma.department.update({
    where: { id },
    data: {
      name: data.name,
      departmentHeadId: data.departmentHeadId === undefined ? undefined : data.departmentHeadId,
      parentDepartmentId: data.parentDepartmentId === undefined ? undefined : data.parentDepartmentId,
      status: data.status,
      isDeleted: data.isDeleted,
    },
  });

  // Update Users belonging to this department string-wise if needed to keep existing flow
  if (data.name && old && old.name !== data.name) {
    await prisma.user.updateMany({
      where: { department: old.name },
      data: { department: data.name },
    });
  }

  // Log in AuditLog
  await writeAuditLog({
    tableName: "departments",
    recordId: department.id,
    action: "UPDATE",
    changedBy,
    oldValues: old ? {
      name: old.name,
      departmentHeadId: old.departmentHeadId,
      parentDepartmentId: old.parentDepartmentId,
      status: old.status,
      isDeleted: old.isDeleted,
    } : null,
    newValues: {
      name: department.name,
      departmentHeadId: department.departmentHeadId,
      parentDepartmentId: department.parentDepartmentId,
      status: department.status,
      isDeleted: department.isDeleted,
    },
  });

  return department;
}

export async function deleteDepartment(id: number, changedBy: string) {
  return updateDepartment(id, { isDeleted: true }, changedBy);
}
