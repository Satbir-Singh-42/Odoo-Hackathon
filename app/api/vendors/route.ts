import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, created, noContent, notFound, serverError, conflict,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { listVendors, createVendor, updateVendor, deleteVendor } from "@/lib/services/vendorService";

export const runtime = "nodejs";

const createVendorSchema = z.object({
  id: z.string().min(1).max(20).optional(),
  vendorId: z.string().min(1).max(20).optional(),
  vendorName: z.string().min(1).max(150),
}).refine(data => data.id || data.vendorId, {
  message: "Either id or vendorId must be provided.",
}).transform(data => ({
  id: (data.id || data.vendorId)!,
  vendorName: data.vendorName,
}));

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.VENDOR_READ);
  if (isAuthError(authResult)) return authResult;
  try {
    const sp = req.nextUrl.searchParams;
    const result = await listVendors({
      search: sp.get("search") ?? undefined,
      page: sp.get("page") ? parseInt(sp.get("page")!, 10) : 1,
      pageSize: sp.get("pageSize") ? parseInt(sp.get("pageSize")!, 10) : 100,
    });
    return ok(result);
  } catch (err) { return serverError(err); }
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.VENDOR_CREATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  const bodyResult = await parseBody(req, createVendorSchema);
  if (isParseError(bodyResult)) return bodyResult;
  try {
    const vendor = await createVendor(bodyResult.data, session.user.employeeId);
    return created(vendor);
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) return conflict(err.message);
    return serverError(err);
  }
}
