import "server-only";
import { prisma } from "@/lib/prisma";

export async function getAssetsData(params: { managedCategories?: string[] } = {}) {
  const where: any = { isDeleted: false };
  if (params.managedCategories && !params.managedCategories.includes("ALL")) {
    where.assetType = { categoryName: { in: params.managedCategories } };
  }
  
  const rawAssets = await prisma.asset.findMany({
    where,
    include: {
      assetType: { select: { categoryName: true, typeName: true } },
      vendor: { select: { vendorName: true } },
      allocations: {
        where: { status: "ACTIVE", isDeleted: false },
        take: 1,
        include: {
          employee: { select: { fullName: true, department: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 10000,
  });
  
  const assets = rawAssets.map((asset: any) => ({
    ...asset,
    category: asset.assetType?.categoryName || "",
    assetType: asset.assetType?.typeName || "",
    vendorName: asset.vendor?.vendorName || "",
  }));
  
  // Serialize dates to strings for Next.js Server Components passing to Client Components
  return JSON.parse(JSON.stringify(assets));
}

export async function getMaintenanceData() {
  const rawMaintenance = await prisma.maintenance.findMany({
    where: { isDeleted: false },
    include: {
      asset: {
        select: {
          assetCode: true,
          assetName: true,
          assetType: { select: { categoryName: true, typeName: true } },
        },
      },
      reporter: { select: { fullName: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const maintenance = rawMaintenance.map((m: any) => ({
    ...m,
    assetCode: m.asset?.assetCode || "",
    assetName: m.asset?.assetName || "",
    category: m.asset?.assetType?.categoryName || "",
    assetType: m.asset?.assetType?.typeName || "",
  }));

  return JSON.parse(JSON.stringify(maintenance));
}

export async function getLicenseAllocationsData() {
  const rawAllocations = await prisma.allocation.findMany({
    where: { isDeleted: false, status: "ACTIVE" },
    include: {
      asset: { select: { assetCode: true, assetName: true } },
      employee: { select: { fullName: true, department: true } },
    },
    orderBy: { allocationDate: "desc" },
  });

  const allocations = rawAllocations.map((a: any) => ({
    ...a,
    assetCode: a.asset?.assetCode || "",
    assetName: a.asset?.assetName || "",
    userName: a.employee?.fullName || "",
    department: a.employee?.department || "",
  }));

  return JSON.parse(JSON.stringify(allocations));
}

export async function getUsersData() {
  const users = await prisma.user.findMany({
    where: { isDeleted: false, isBlocked: false },
    select: { id: true, fullName: true, department: true, email: true, role: true },
  });
  return JSON.parse(JSON.stringify(users));
}

export async function getCategoriesData() {
  const dbCategories = await prisma.assetCategory.findMany({
    orderBy: { name: "asc" },
  });

  const distinct = await prisma.assetType.findMany({
    distinct: ["categoryName"],
    select: { categoryName: true },
  });

  const categoryNames = new Set(dbCategories.map(c => c.name.toLowerCase()));
  
  const combined = [...dbCategories];
  distinct.forEach(item => {
    if (!categoryNames.has(item.categoryName.toLowerCase())) {
      combined.push({
        id: item.categoryName as any,
        name: item.categoryName,
        fields: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    }
  });

  const formatted = combined.map(c => ({
    id: c.name || c.id.toString(),
    name: c.name,
    fields: c.fields,
  }));

  return JSON.parse(JSON.stringify(formatted));
}

export async function getVendorsData() {
  const vendors = await prisma.vendor.findMany({
    where: { isDeleted: false, isBlocked: false },
    select: { id: true, vendorName: true },
  });
  return JSON.parse(JSON.stringify(vendors));
}

export async function getAssetHistoryData() {
  const history = await prisma.assetHistory.findMany({
    orderBy: { actionDate: "desc" },
    take: 50,
    include: {
      employee: { select: { fullName: true, department: true } },
      parentAsset: { select: { assetCode: true, assetName: true } },
    },
  });
  return JSON.parse(JSON.stringify(history));
}

export async function getAppContainerData(session?: any) {
  const managedCategories = session?.user?.managedCategories ? session.user.managedCategories.split(',') : ['ALL'];
  const [
    assets,
    maintenanceRecords,
    licenseAllocations,
    users,
    categories,
    vendors,
    assetHistory
  ] = await Promise.all([
    getAssetsData({ managedCategories }),
    getMaintenanceData(),
    getLicenseAllocationsData(),
    getUsersData(),
    getCategoriesData(),
    getVendorsData(),
    getAssetHistoryData()
  ]);
  return { assets, maintenanceRecords, licenseAllocations, users, categories, vendors, assetHistory };
}