import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAuth, isAuthError, parseBody, isParseError,
  ok, serverError, notFound,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import { updateCategory, deleteCategory, getCategoryById } from "@/lib/services/categoryService";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  fields: z.any().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth(PERMISSIONS.ASSET_READ);
  if (isAuthError(authResult)) return authResult;

  const { id } = await params;
  const catId = parseInt(id, 10);
  if (isNaN(catId)) return notFound();

  try {
    const category = await getCategoryById(catId);
    if (!category) return notFound();
    return ok(category);
  } catch (err) {
    return serverError(err);
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth(PERMISSIONS.SETTINGS_WRITE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const { id } = await params;
  const catId = parseInt(id, 10);
  if (isNaN(catId)) return notFound();

  const bodyResult = await parseBody(req, updateCategorySchema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const category = await updateCategory(catId, bodyResult.data, session.user.employeeId);
    
    // On-Demand Revalidation
    revalidatePath("/settings");
    revalidatePath("/assets");
    
    return ok(category);
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth(PERMISSIONS.SETTINGS_WRITE);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  const { id } = await params;
  const catId = parseInt(id, 10);
  if (isNaN(catId)) return notFound();

  try {
    const category = await deleteCategory(catId, session.user.employeeId);
    
    // On-Demand Revalidation
    revalidatePath("/settings");
    revalidatePath("/assets");
    
    return ok(category);
  } catch (err) {
    return serverError(err);
  }
}
