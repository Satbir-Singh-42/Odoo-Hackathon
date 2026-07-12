import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, notFound, serverError, noContent } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { updateVendor, deleteVendor } from "@/lib/services/vendorService";
import { z } from "zod";
import { parseBody, isParseError } from "@/lib/api-helpers";

export const runtime = "nodejs";

const updateVendorSchema = z.object({
  vendorName: z.string().min(1).max(150).optional(),
  isBlocked: z.boolean().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(PERMISSIONS.VENDOR_UPDATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  const bodyResult = await parseBody(req, updateVendorSchema);
  if (isParseError(bodyResult)) return bodyResult;
  try {
    const { id } = await params;
    const updated = await updateVendor(id, bodyResult.data, session.user.employeeId);
    return ok(updated);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) return notFound(err.message);
    return serverError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(PERMISSIONS.VENDOR_DELETE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  try {
    const { id } = await params;
    await deleteVendor(id, session.user.employeeId);
    return noContent();
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) return notFound(err.message);
    return serverError(err);
  }
}
