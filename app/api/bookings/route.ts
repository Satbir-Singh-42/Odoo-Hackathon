import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, created, serverError, badRequest,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

const createBookingSchema = z.object({
  assetId: z.number(),
  startTime: z.string().datetime() || z.string(),
  endTime: z.string().datetime() || z.string(),
  purpose: z.string().max(255).optional(),
});

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;
  try {
    const sp = req.nextUrl.searchParams;
    const assetId = sp.get("assetId") ? parseInt(sp.get("assetId")!, 10) : undefined;
    const userId = sp.get("userId") ?? undefined;

    const allocations = await prisma.allocation.findMany({
      where: {
        assetId,
        employeeId: userId,
        allocationDate: { gt: new Date() }, // Future allocations act as bookings
        isDeleted: false,
      },
      include: {
        asset: { select: { id: true, assetCode: true, assetName: true } },
        employee: { select: { id: true, fullName: true, email: true } }
      },
      orderBy: { allocationDate: 'asc' }
    });

    const bookings = allocations.map(a => ({
      id: a.id,
      assetId: a.assetId,
      userId: a.employeeId,
      startTime: a.allocationDate,
      endTime: a.returnDate || a.allocationDate,
      status: "UPCOMING",
      purpose: a.returnNotes || "No purpose provided",
      asset: a.asset,
      user: a.employee
    }));

    return ok(bookings);
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const bodyResult = await parseBody(req, createBookingSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const allocation = await prisma.allocation.create({
      data: {
        assetId: bodyResult.data.assetId,
        employeeId: session.user.employeeId,
        allocationDate: new Date(bodyResult.data.startTime),
        returnDate: new Date(bodyResult.data.endTime),
        status: 'ACTIVE',
        returnNotes: bodyResult.data.purpose,
        assignedBy: session.user.employeeId,
      }
    });

    revalidatePath("/bookings");
    revalidatePath("/dashboard");
    revalidatePath("/assets");

    return created({
      id: allocation.id,
      assetId: allocation.assetId,
      userId: allocation.employeeId,
      startTime: allocation.allocationDate,
      endTime: allocation.returnDate,
      status: "UPCOMING",
      purpose: allocation.returnNotes
    });
  } catch (err) {
    if (err instanceof Error) {
      return badRequest(err.message);
    }
    return serverError(err);
  }
}
