"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface GetAssetsParams {
  search?: string;
  status?: string;
  categoryName?: string;
  typeName?: string;
  vendorId?: string;
  condition?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  isDeleted?: boolean;
  selectFields?: string[]; // Array of Asset fields to select, e.g. ["id", "assetCode", "assetName"]
}

/**
 * Server Action to fetch list of assets with dedicated filters, pagination, and field selection.
 * Exposes database access to client/server components, ideal for ISR static build pre-rendering.
 */
export async function getAssetsAction(params: GetAssetsParams) {
  const {
    search,
    status,
    categoryName,
    typeName,
    vendorId,
    condition,
    page = 1,
    pageSize = 50,
    sortBy = "updatedAt",
    sortOrder = "desc",
    isDeleted = false,
    selectFields,
  } = params;

  // Build filter where clause
  const where: Prisma.AssetWhereInput = {
    isDeleted,
  };

  if (search) {
    where.OR = [
      { assetCode: { contains: search, mode: "insensitive" } },
      { assetName: { contains: search, mode: "insensitive" } },
      { serialNumber: { contains: search, mode: "insensitive" } },
      { model: { contains: search, mode: "insensitive" } },
    ];
  }

  if (status) where.status = status as any;
  if (categoryName || typeName) {
    where.assetType = {};
    if (categoryName) where.assetType.categoryName = categoryName;
    if (typeName) where.assetType.typeName = typeName;
  }
  if (vendorId) where.vendorId = vendorId;
  if (condition) where.condition = condition as any;

  const skip = (page - 1) * pageSize;
  const validSortFields = ["assetCode", "assetName", "status", "createdAt", "updatedAt", "purchasePrice"];
  const orderByField = validSortFields.includes(sortBy) ? sortBy : "updatedAt";

  // Build dynamic select object if fields are selected
  let select: Prisma.AssetSelect | undefined = undefined;
  if (selectFields && selectFields.length > 0) {
    select = {};
    for (const field of selectFields) {
      // Direct field assignment
      (select as any)[field] = true;
    }
    // Always select id for safety
    select.id = true;

    // If assetType is requested, specify inner select
    if (selectFields.includes("assetType")) {
      select.assetType = {
        select: {
          id: true,
          categoryName: true,
          typeName: true,
        },
      };
    }
    // If vendor is requested, specify inner select
    if (selectFields.includes("vendor")) {
      select.vendor = {
        select: {
          id: true,
          vendorName: true,
        },
      };
    }
  }

  let assets;
  if (select) {
    assets = await prisma.asset.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { [orderByField]: sortOrder },
      select,
    });
  } else {
    assets = await prisma.asset.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { [orderByField]: sortOrder },
      include: {
        assetType: { select: { categoryName: true, typeName: true } },
        vendor: { select: { vendorName: true } },
      },
    });
  }

  const total = await prisma.asset.count({ where });

  const formattedAssets = assets.map((asset: any) => ({
    ...asset,
    category: asset.assetType?.categoryName || "",
    assetType: asset.assetType?.typeName || "",
    vendorName: asset.vendor?.vendorName || "",
  }));

  return {
    assets: formattedAssets,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Server Action to fetch unique asset categories.
 */
export async function getAssetCategoriesAction() {
  const categories = await prisma.assetType.findMany({
    distinct: ["categoryName"],
    select: {
      categoryName: true,
    },
    orderBy: {
      categoryName: "asc",
    },
  });
  return categories.map((c) => c.categoryName);
}

/**
 * Server Action to fetch asset types by category.
 */
export async function getAssetTypesByCategoryAction(categoryName: string) {
  return prisma.assetType.findMany({
    where: { categoryName },
    select: {
      id: true,
      typeName: true,
    },
    orderBy: {
      typeName: "asc",
    },
  });
}
