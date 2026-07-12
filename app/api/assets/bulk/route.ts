import { NextRequest } from "next/server";
import { requireAuth, isAuthError, ok, serverError, parseBody, isParseError } from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { createAsset } from "@/lib/services/assetService";
import { z } from "zod";

export const runtime = "nodejs";

const createBulkAssetSchema = z.object({
  assetCode: z.string().min(1),
  assetName: z.string().min(1),
  assetTypeId: z.number().int().positive(),
  totalQuantity: z.number().int().min(1).optional(),
}).passthrough();

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_CREATE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;
  const bodyResult = await parseBody(req, createBulkAssetSchema);
  if (isParseError(bodyResult)) return bodyResult;
  try {
    const data = bodyResult.data;
    const parentAsset = await createAsset({
      ...data,
      isBulkOrder: true,
    } as any, session.user.employeeId);

    const quantity = data.totalQuantity || 1;
    if (quantity > 1) {
      // Create child units for the bulk order
      const childrenData = Array.from({ length: quantity }).map((_, idx) => {
        const unitIndex = idx + 1;
        return {
          assetCode: `${parentAsset.assetCode}-${String(unitIndex).padStart(2, "0")}`,
          assetName: `${parentAsset.assetName} - Unit ${unitIndex}`,
          assetTypeId: parentAsset.assetTypeId,
          vendorId: parentAsset.vendorId,
          purchasePrice: parentAsset.purchasePrice,
          totalQuantity: 1,
          isBulkOrder: false,
          bulkOrderParentId: parentAsset.id,
          bulkOrderIndex: unitIndex,
          status: "Available",
          condition: parentAsset.condition,
          invoiceNumber: parentAsset.invoiceNumber,
          invoiceDate: parentAsset.invoiceDate,
          purchaseNumber: parentAsset.purchaseNumber,
          prNumber: parentAsset.prNumber,
          model: parentAsset.model,
          ram: parentAsset.ram,
          storage: parentAsset.storage,
          processor: parentAsset.processor,
          portCount: parentAsset.portCount,
          portSpeed: parentAsset.portSpeed,
          licenseExpiryDate: parentAsset.licenseExpiryDate,
          licenseType: parentAsset.licenseType,
        };
      });

      const { prisma } = await import("@/lib/prisma");
      await prisma.asset.createMany({ data: childrenData });

      const children = await prisma.asset.findMany({
        where: { bulkOrderParentId: parentAsset.id },
        select: { id: true, assetCode: true }
      });

      const historyData = children.map(c => ({
        assetId: c.id,
        actionType: "CREATION",
        performedBy: session.user.employeeId,
        notes: `Child unit created for bulk order: ${parentAsset.assetCode}`,
      }));

      await prisma.assetHistory.createMany({ data: historyData });
    }

    return ok({ parentId: parentAsset.id, data: parentAsset });
  } catch (err) {
    return serverError(err);
  }
}
