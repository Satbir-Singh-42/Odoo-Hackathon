/**
 * GET  /api/assets  — list assets (paginated, filtered, CBAC-aware)
 * POST /api/assets  — create a new asset
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  isAuthError,
  parseBody,
  isParseError,
  serverError,
  created,
  ok,
  getManagedCategories,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { listAssets, createAsset } from "@/lib/services/assetService";

export const runtime = "nodejs";

// =============================================
// VALIDATION SCHEMAS
// =============================================

const createAssetSchema = z.object({
  assetCode: z.string().min(1).max(20),
  assetName: z.string().min(1).max(150),
  assetTypeId: z.number().int().positive(),
  invoiceNumber: z.string().max(50).optional(),
  invoiceDate: z.string().optional(),
  vendorId: z.string().max(20).optional(),
  purchasePrice: z.number().min(0).optional(),
  purchaseNumber: z.string().max(50).optional(),
  prNumber: z.string().max(50).optional(),
  serialNumber: z.string().max(50).optional(),
  model: z.string().max(50).optional(),
  ram: z.string().max(20).optional(),
  storage: z.string().max(20).optional(),
  processor: z.string().max(50).optional(),
  macAddress: z.string().max(20).optional(),
  portCount: z.number().int().optional(),
  portSpeed: z.string().max(20).optional(),
  totalQuantity: z.number().int().min(1).optional(),
  licenseExpiryDate: z.string().optional(),
  licenseType: z
    .enum(["PERPETUAL", "SUBSCRIPTION", "SAAS", "TRIAL", "VOLUME", "ENTERPRISE"])
    .optional(),
  condition: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR"]).optional(),
  isBulkOrder: z.boolean().optional(),
});

// =============================================
// GET — List Assets
// =============================================

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  try {
    const sp = req.nextUrl.searchParams;
    const viewerMode = req.headers.get("x-viewer-mode") === "true";
    const managedCategories = getManagedCategories(session, viewerMode);

    const result = await listAssets({
      search: sp.get("search") ?? undefined,
      status: sp.get("status") ?? undefined,
      category: sp.get("category") ?? undefined,
      type: sp.get("type") ?? undefined,
      vendorId: sp.get("vendorId") ?? undefined,
      condition: sp.get("condition") ?? undefined,
      page: sp.get("page") ? parseInt(sp.get("page")!, 10) : 1,
      pageSize: sp.get("pageSize") ? parseInt(sp.get("pageSize")!, 10) : 50,
      sortBy: sp.get("sortBy") ?? "updatedAt",
      sortOrder: (sp.get("sortOrder") as "asc" | "desc") ?? "desc",
      isDeleted: sp.get("deleted") === "true",
      managedCategories,
    });

    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}

// =============================================
// POST — Create Asset
// =============================================

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_CREATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const bodyResult = await parseBody(req, createAssetSchema);
  if (isParseError(bodyResult)) return bodyResult;
  const { data } = bodyResult;

  try {
    const asset = await createAsset(data, session.user.employeeId);
    return created(asset);
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) {
      return NextResponse.json(
        { status: "error", message: err.message },
        { status: 409 }
      );
    }
    return serverError(err);
  }
}
