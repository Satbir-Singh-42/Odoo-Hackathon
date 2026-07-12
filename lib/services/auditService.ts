import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export async function listAuditCycles() {
  return prisma.auditCycle.findMany({
    orderBy: { startDate: "desc" },
    include: {
      department: {
        select: {
          id: true,
          name: true,
        },
      },
      auditors: {
        include: {
          auditor: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      },
      items: {
        include: {
          asset: true,
        },
      },
      discrepancyReports: {
        include: {
          asset: true,
        },
      },
    },
  });
}

export async function getAuditCycleById(id: number) {
  return prisma.auditCycle.findUnique({
    where: { id },
    include: {
      department: {
        select: {
          id: true,
          name: true,
        },
      },
      auditors: {
        include: {
          auditor: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      },
      items: {
        include: {
          asset: true,
          verifiedBy: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      },
      discrepancyReports: {
        include: {
          asset: true,
        },
      },
    },
  });
}

export async function createAuditCycle(data: {
  name: string;
  departmentId: number;
  startDate: Date | string;
  endDate: Date | string;
  auditorIds: string[];
}, changedBy: string) {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);

  // Get department details
  const dept = await prisma.department.findUnique({
    where: { id: data.departmentId },
  });
  if (!dept) throw new Error("Department not found.");

  // Create AuditCycle
  const cycle = await prisma.auditCycle.create({
    data: {
      name: data.name,
      departmentId: data.departmentId,
      startDate: start,
      endDate: end,
      status: "ACTIVE", // Start as ACTIVE directly so auditors can work on it
    },
  });

  // Create Auditors
  if (data.auditorIds && data.auditorIds.length > 0) {
    await prisma.auditCycleAuditor.createMany({
      data: data.auditorIds.map((auditorId) => ({
        auditCycleId: cycle.id,
        auditorId,
      })),
    });
  }

  // Populate cycle scope: assets allocated to users in this department
  // 1. Find users in this department
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { department: dept.name },
        { departmentId: dept.id },
      ],
      isDeleted: false,
    },
    select: { id: true },
  });

  const userIds = users.map((u) => u.id);

  // 2. Find active allocations for these users
  const allocations = await prisma.allocation.findMany({
    where: {
      employeeId: { in: userIds },
      status: "ACTIVE",
      isDeleted: false,
    },
    select: { assetId: true },
  });

  const assetIds = Array.from(new Set(allocations.map((a) => a.assetId)));

  // 3. Create AuditItems
  if (assetIds.length > 0) {
    await prisma.auditItem.createMany({
      data: assetIds.map((assetId) => ({
        auditCycleId: cycle.id,
        assetId,
        status: "PENDING",
      })),
    });
  }

  await writeAuditLog({
    tableName: "audit_cycles",
    recordId: cycle.id,
    action: "CREATION",
    changedBy,
    newValues: {
      name: cycle.name,
      departmentId: cycle.departmentId,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      assetCount: assetIds.length,
    },
  });

  return cycle;
}

export async function logItemAudit(data: {
  auditCycleId: number;
  assetId: number;
  status: string; // PENDING, VERIFIED, MISSING, DAMAGED
  notes?: string;
  verifiedById: string;
}, changedBy: string) {
  // Update or upsert AuditItem
  const item = await prisma.auditItem.upsert({
    where: {
      auditCycleId_assetId: {
        auditCycleId: data.auditCycleId,
        assetId: data.assetId,
      },
    },
    update: {
      status: data.status,
      notes: data.notes,
      verifiedAt: new Date(),
      verifiedById: data.verifiedById,
    },
    create: {
      auditCycleId: data.auditCycleId,
      assetId: data.assetId,
      status: data.status,
      notes: data.notes,
      verifiedAt: new Date(),
      verifiedById: data.verifiedById,
    },
  });

  // Generate or update DiscrepancyReport if status is MISSING or DAMAGED
  if (data.status === "MISSING" || data.status === "DAMAGED") {
    await prisma.discrepancyReport.upsert({
      where: {
        auditCycleId_assetId: {
          auditCycleId: data.auditCycleId,
          assetId: data.assetId,
        },
      },
      update: {
        description: `Asset verified as ${data.status}. Auditor notes: ${data.notes || "None"}`,
        resolved: false,
      },
      create: {
        auditCycleId: data.auditCycleId,
        assetId: data.assetId,
        description: `Asset verified as ${data.status}. Auditor notes: ${data.notes || "None"}`,
        resolved: false,
      },
    });
  } else if (data.status === "VERIFIED") {
    // If resolved, we can auto-resolve discrepancy if it exists
    try {
      await prisma.discrepancyReport.update({
        where: {
          auditCycleId_assetId: {
            auditCycleId: data.auditCycleId,
            assetId: data.assetId,
          },
        },
        data: {
          resolved: true,
          resolutionNotes: "Resolved automatically: asset verified as Good/Verified.",
        },
      });
    } catch (e) {
      // Discrepancy report might not exist, ignore
    }
  }

  await writeAuditLog({
    tableName: "audit_items",
    recordId: item.id,
    action: "UPDATE",
    changedBy,
    newValues: {
      auditCycleId: data.auditCycleId,
      assetId: data.assetId,
      status: data.status,
    },
  });

  return item;
}

export async function resolveDiscrepancy(data: {
  auditCycleId: number;
  assetId: number;
  resolutionNotes: string;
}, changedBy: string) {
  const discrepancy = await prisma.discrepancyReport.update({
    where: {
      auditCycleId_assetId: {
        auditCycleId: data.auditCycleId,
        assetId: data.assetId,
      },
    },
    data: {
      resolved: true,
      resolutionNotes: data.resolutionNotes,
    },
  });

  await writeAuditLog({
    tableName: "discrepancy_reports",
    recordId: discrepancy.id,
    action: "UPDATE",
    changedBy,
    newValues: {
      auditCycleId: data.auditCycleId,
      assetId: data.assetId,
      resolved: true,
      resolutionNotes: data.resolutionNotes,
    },
  });

  return discrepancy;
}

export async function closeAuditCycle(id: number, changedBy: string) {
  const cycle = await prisma.auditCycle.update({
    where: { id },
    data: { status: "COMPLETED" },
  });

  // Find all missing audit items in this cycle
  const missingItems = await prisma.auditItem.findMany({
    where: {
      auditCycleId: id,
      status: "MISSING",
    },
  });

  // Update asset status to "Lost" for all missing assets
  const missingAssetIds = missingItems.map((item) => item.assetId);

  if (missingAssetIds.length > 0) {
    await prisma.asset.updateMany({
      where: {
        id: { in: missingAssetIds },
      },
      data: {
        status: "Lost" as any, // Enum updated to include Lost
      },
    });

    // Write audit log / history for each missing asset
    for (const assetId of missingAssetIds) {
      await prisma.assetHistory.create({
        data: {
          assetId,
          actionType: "DISPOSAL", // Treat lost as disposal
          performedBy: "Audit System",
          notes: `Asset status set to Lost automatically on closure of audit cycle "${cycle.name}"`,
        },
      });

      await writeAuditLog({
        tableName: "assets",
        recordId: assetId,
        action: "DISPOSE",
        changedBy,
        newValues: {
          status: "Lost",
        },
      });
    }
  }

  await writeAuditLog({
    tableName: "audit_cycles",
    recordId: cycle.id,
    action: "UPDATE",
    changedBy,
    newValues: {
      status: "COMPLETED",
      closedAt: new Date(),
    },
  });

  return cycle;
}
