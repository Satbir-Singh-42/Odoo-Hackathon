import { NextRequest } from "next/server";
import {
  requireAuth, isAuthError,
  ok, serverError, notFound, badRequest,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { getBookingById, cancelBooking } from "@/lib/services/bookingService";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;

  const { id } = await params;
  const bookingId = parseInt(id, 10);
  if (isNaN(bookingId)) return notFound();

  try {
    const booking = await getBookingById(bookingId);
    if (!booking) return notFound();
    return ok(booking);
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const { id } = await params;
  const bookingId = parseInt(id, 10);
  if (isNaN(bookingId)) return notFound();

  try {
    // Check if the user is authorized (either booking owner or Admin/Manager)
    const booking = await getBookingById(bookingId);
    if (!booking) return notFound();

    const isOwner = booking.userId === session.user.employeeId;
    const isPrivileged = session.user.role === "Admin" || session.user.role === "Manager";

    if (!isOwner && !isPrivileged) {
      return badRequest("You are not authorized to cancel this booking.");
    }

    const cancelled = await cancelBooking(bookingId, session.user.employeeId);

    // On-Demand Revalidation
    revalidatePath("/bookings");
    revalidatePath("/dashboard");

    return ok(cancelled);
  } catch (err) {
    if (err instanceof Error) {
      return badRequest(err.message);
    }
    return serverError(err);
  }
}
