import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export interface BookingListParams {
  assetId?: number;
  userId?: string;
  status?: string;
}

export async function listBookings(params: BookingListParams = {}) {
  const { assetId, userId, status } = params;
  const where: any = {};

  if (assetId) where.assetId = assetId;
  if (userId) where.userId = userId;
  if (status) where.status = status;

  return prisma.booking.findMany({
    where,
    orderBy: { startTime: "asc" },
    include: {
      asset: {
        select: {
          id: true,
          assetCode: true,
          assetName: true,
        },
      },
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });
}

export async function createBooking(data: {
  assetId: number;
  userId: string;
  startTime: Date | string;
  endTime: Date | string;
  purpose?: string;
}, changedBy: string) {
  const start = new Date(data.startTime);
  const end = new Date(data.endTime);

  if (start >= end) {
    throw new Error("Start time must be before end time.");
  }

  // Overlap check
  const overlap = await prisma.booking.findFirst({
    where: {
      assetId: data.assetId,
      status: { in: ["UPCOMING", "ONGOING"] },
      startTime: { lt: end },
      endTime: { gt: start },
    },
  });

  if (overlap) {
    throw new Error("This resource is already booked during this time range.");
  }

  const booking = await prisma.booking.create({
    data: {
      assetId: data.assetId,
      userId: data.userId,
      startTime: start,
      endTime: end,
      purpose: data.purpose,
      status: "UPCOMING",
    },
  });

  await writeAuditLog({
    tableName: "bookings",
    recordId: booking.id,
    action: "CREATION",
    changedBy,
    newValues: {
      assetId: booking.assetId,
      userId: booking.userId,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
    },
  });

  return booking;
}

export async function cancelBooking(id: number, changedBy: string) {
  const old = await prisma.booking.findUnique({ where: { id } });
  if (!old) throw new Error("Booking not found");

  const booking = await prisma.booking.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  await writeAuditLog({
    tableName: "bookings",
    recordId: booking.id,
    action: "UPDATE",
    changedBy,
    oldValues: { status: old.status },
    newValues: { status: "CANCELLED" },
  });

  return booking;
}

export async function getBookingById(id: number) {
  return prisma.booking.findUnique({
    where: { id },
    include: {
      asset: true,
      user: true,
    },
  });
}
