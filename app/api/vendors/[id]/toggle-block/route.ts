import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, notFound, serverError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { toggleVendorBlock } from "@/lib/services/vendorService";

export const runtime = "nodejs";

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(PERMISSIONS.VENDOR_UPDATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  try {
    const { id } = await params;
    const result = await toggleVendorBlock(id, session.user.employeeId);
    return ok(result);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) return notFound(err.message);
    return serverError(err);
  }
}
