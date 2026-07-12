import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, created, serverError, badRequest,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { listBookings, createBooking } from "@/lib/services/bookingService";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

const createBookingSchema = z.object({
  assetId: z.number(),
  startTime: z.string().datetime() || z.string(), // accommodate string datetimes
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
    const status = sp.get("status") ?? undefined;

    const result = await listBookings({
      assetId: isNaN(assetId as any) ? undefined : assetId,
      userId,
      status,
    });
    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ); // All authenticated users can book resources
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const bodyResult = await parseBody(req, createBookingSchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const booking = await createBooking({
      assetId: bodyResult.data.assetId,
      userId: session.user.employeeId, // Set to the logged-in user
      startTime: bodyResult.data.startTime,
      endTime: bodyResult.data.endTime,
      purpose: bodyResult.data.purpose,
    }, session.user.employeeId);

    // On-Demand Revalidation
    revalidatePath("/bookings");
    revalidatePath("/dashboard");

    return created(booking);
  } catch (err) {
    if (err instanceof Error) {
      return badRequest(err.message);
    }
    return serverError(err);
  }
}
