import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export interface TransferRequestListParams {
  status?: string;
  requesterId?: string;
  currentHolderId?: string;
}

export async function listTransferRequests(params: TransferRequestListParams = {}) {
  const { status, requesterId, currentHolderId } = params;
  const where: any = {};

  if (status) where.status = status;
  if (requesterId) where.requesterId = requesterId;
  if (currentHolderId) where.currentHolderId = currentHolderId;

  return prisma.transferRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      asset: {
        select: {
          id: true,
          assetCode: true,
          assetName: true,
          status: true,
        },
      },
      currentHolder: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      requester: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      allocation: true,
    },
  });
}

export async function createTransferRequest(data: {
  assetId: number;
  requesterId: string;
  reason?: string;
}, changedBy: string) {
  // Find the active allocation
  const activeAlloc = await prisma.allocation.findFirst({
    where: {
      assetId: data.assetId,
      status: "ACTIVE",
      isDeleted: false,
    },
    orderBy: { allocationDate: "desc" },
  });

  if (!activeAlloc || !activeAlloc.employeeId) {
    throw new Error("No active employee allocation found for this asset to transfer from.");
  }

  const transfer = await prisma.transferRequest.create({
    data: {
      assetId: data.assetId,
      currentHolderId: activeAlloc.employeeId,
      requesterId: data.requesterId,
      allocationId: activeAlloc.id,
      reason: data.reason,
      status: "PENDING",
    },
  });

  await writeAuditLog({
    tableName: "transfer_requests",
    recordId: transfer.id,
    action: "CREATION",
    changedBy,
    newValues: {
      assetId: transfer.assetId,
      currentHolderId: transfer.currentHolderId,
      requesterId: transfer.requesterId,
      allocationId: transfer.allocationId,
      status: transfer.status,
    },
  });

  return transfer;
}

export async function approveTransferRequest(id: number, performedBy: string, performedByName: string) {
  const transfer = await prisma.transferRequest.findUnique({
    where: { id },
    include: { asset: true, allocation: true },
  });

  if (!transfer) throw new Error("Transfer request not found.");
  if (transfer.status !== "PENDING") throw new Error("Transfer request is already resolved.");

  const { asset, allocation } = transfer;

  // Perform return and re-allotment in transaction
  const [, newAlloc] = await prisma.$transaction([
    // 1. Mark current allocation as RETURNED
    prisma.allocation.update({
      where: { id: allocation.id },
      data: {
        status: "RETURNED",
        returnDate: new Date(),
        returnedBy: performedByName,
        returnNotes: `Transferred to employee ID: ${transfer.requesterId}`,
      },
    }),
    // 2. Create new allocation for requester
    prisma.allocation.create({
      data: {
        assetId: transfer.assetId,
        employeeId: transfer.requesterId,
        assignedBy: performedByName,
        status: "ACTIVE",
        conditionAtAllocation: allocation.conditionAtAllocation,
      },
    }),
    // 3. Update transfer request status
    prisma.transferRequest.update({
      where: { id },
      data: { status: "APPROVED" },
    }),
  ]);

  // Create asset history for return
  await prisma.assetHistory.create({
    data: {
      assetId: transfer.assetId,
      employeeId: transfer.currentHolderId,
      actionType: "RETURN",
      performedBy: performedByName,
      notes: `Returned via transfer approval. Action performed by ${performedByName}`,
    },
  });

  // Create asset history for allocation
  await prisma.assetHistory.create({
    data: {
      assetId: transfer.assetId,
      employeeId: transfer.requesterId,
      actionType: "ALLOCATION",
      performedBy: performedByName,
      notes: `Allocated via transfer approval. Action performed by ${performedByName}`,
    },
  });

  await writeAuditLog({
    tableName: "transfer_requests",
    recordId: id,
    action: "UPDATE",
    changedBy: performedBy,
    oldValues: { status: "PENDING" },
    newValues: { status: "APPROVED" },
  });

  return newAlloc;
}

export async function rejectTransferRequest(id: number, performedBy: string, performedByName: string) {
  const transfer = await prisma.transferRequest.findUnique({
    where: { id },
  });

  if (!transfer) throw new Error("Transfer request not found.");
  if (transfer.status !== "PENDING") throw new Error("Transfer request is already resolved.");

  const updated = await prisma.transferRequest.update({
    where: { id },
    data: { status: "REJECTED" },
  });

  await writeAuditLog({
    tableName: "transfer_requests",
    recordId: id,
    action: "UPDATE",
    changedBy: performedBy,
    oldValues: { status: "PENDING" },
    newValues: { status: "REJECTED" },
  });

  return updated;
}
