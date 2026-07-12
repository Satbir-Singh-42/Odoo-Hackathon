import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export async function listCategories() {
  return prisma.assetCategory.findMany({
    orderBy: { name: "asc" },
  });
}

export async function getCategoryById(id: number) {
  return prisma.assetCategory.findUnique({
    where: { id },
  });
}

export async function createCategory(data: {
  name: string;
  fields?: any;
}, changedBy: string) {
  const category = await prisma.assetCategory.create({
    data: {
      name: data.name,
      fields: data.fields || null,
    },
  });

  // Keep existing AssetType category list updated:
  // AssetType requires categoryName (20 chars). Let's see if we should create a default asset type or not.
  // Wait, let's keep Category in sync with AssetType or let AssetCategory stand alone.
  // We can write to AuditLog.
  await writeAuditLog({
    tableName: "asset_categories",
    recordId: category.id,
    action: "CREATION",
    changedBy,
    newValues: {
      name: category.name,
      fields: category.fields,
    },
  });

  return category;
}

export async function updateCategory(id: number, data: {
  name?: string;
  fields?: any;
}, changedBy: string) {
  const old = await prisma.assetCategory.findUnique({ where: { id } });

  const category = await prisma.assetCategory.update({
    where: { id },
    data: {
      name: data.name,
      fields: data.fields,
    },
  });

  await writeAuditLog({
    tableName: "asset_categories",
    recordId: category.id,
    action: "UPDATE",
    changedBy,
    oldValues: old ? {
      name: old.name,
      fields: old.fields,
    } : null,
    newValues: {
      name: category.name,
      fields: category.fields,
    },
  });

  return category;
}

export async function deleteCategory(id: number, changedBy: string) {
  const category = await prisma.assetCategory.delete({
    where: { id },
  });

  await writeAuditLog({
    tableName: "asset_categories",
    recordId: category.id,
    action: "DELETION",
    changedBy,
    oldValues: {
      name: category.name,
    },
  });

  return category;
}
