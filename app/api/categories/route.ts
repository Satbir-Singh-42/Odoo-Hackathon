import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, created, serverError,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { listCategories, createCategory } from "@/lib/services/categoryService";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  fields: z.any().optional(),
});

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;

  try {
    // Get database categories
    const dbCategories = await listCategories();

    // Get distinct category names from AssetType for backwards compatibility
    const distinct = await prisma.assetType.findMany({
      distinct: ["categoryName"],
      select: { categoryName: true },
    });

    const categoryNames = new Set(dbCategories.map(c => c.name.toLowerCase()));
    
    // Add distinct asset type categories if not already present
    const combined = [...dbCategories];
    distinct.forEach(item => {
      if (!categoryNames.has(item.categoryName.toLowerCase())) {
        combined.push({
          id: item.categoryName as any,
          name: item.categoryName,
          fields: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    });

    // Make sure they are returned in format: { id, name, fields }
    const formatted = combined.map(c => ({
      id: c.id.toString(),
      name: c.name,
      fields: c.fields,
    }));

    return ok({ data: formatted });
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.SETTINGS_WRITE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const bodyResult = await parseBody(req, createCategorySchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const category = await createCategory(bodyResult.data, session.user.employeeId);
    
    // On-Demand Revalidation
    revalidatePath("/settings");
    revalidatePath("/assets");
    
    return created(category);
  } catch (err) {
    return serverError(err);
  }
}
