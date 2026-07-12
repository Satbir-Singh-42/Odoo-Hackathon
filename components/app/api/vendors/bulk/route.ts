import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError, parseBody, isParseError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { bulkCreateVendors } from "@/lib/services/vendorService";
import { z } from "zod";

export const runtime = "nodejs";

const bulkSchema = z.object({
  vendors: z.array(z.object({
    id: z.string().optional(),
    vendorId: z.string().optional(),
    vendorName: z.string().min(1),
  })),
});

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.VENDOR_CREATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  const bodyResult = await parseBody(req, bulkSchema);
  if (isParseError(bodyResult)) return bodyResult;
  try {
    const result = await bulkCreateVendors(bodyResult.data.vendors, session.user.employeeId);
    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}
