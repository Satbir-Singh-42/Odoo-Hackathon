import { Asset, LicenseAllocation, MaintenanceRecord, User } from '@/types';
import { ASSET_STATUS, MAINTENANCE_STATUS } from '@/config/constants';
import { formatCSVDate, formatCSVDateTime } from "./csvHelpers";
import { openDataView } from "./dataViewHelpers";
import { sumCosts } from "./assetHelpers";

export function generateAssetsExport(
  assetsToExport: Asset[],
  allAssets: Asset[],
  licenseAllocations: LicenseAllocation[],
  users: User[],
  userRole: string,
  shouldHideBulkChildUnits: boolean,
  maintenanceRecords: MaintenanceRecord[] = []
) {
  const userMap = new Map(users.map((user) => [user.employeeId, user]));
  const hasAssetAllocations =
    licenseAllocations.some((a) => !!a.parentAssetId) ||
    allAssets.some((a) => !!a.parentAssetId);

  const getAttachedAssets = (parentId: string | number | undefined): string[] => {
    if (!parentId) return [];
    
    const childAllocs = licenseAllocations.filter(la => 
      la.status === "Active" && String(la.parentAssetId) === String(parentId)
    );
    
    let attached: string[] = [];
    for (const alloc of childAllocs) {
       const name = alloc.assetName || alloc.assetCode || "Unknown Asset";
       const code = alloc.assetCode || "";
       attached.push(`${name} ${code ? `(${code})` : ""}`.trim());
       attached = attached.concat(getAttachedAssets(alloc.assetId));
    }
    return attached;
  };

  const headers = [
    "S.No",
    "Asset Code",
    "Asset Name",
    "Parent Asset Code",
    "Category",
    "Asset Type",
    "Model",
    "Serial Number",
    "Status",
    "Condition",
    "Invoice Number",
    "Invoice Date",
    "Vendor Name",
    "Vendor Code",
    "Purchase Price (INR)",
    "Latest Renewal Cost (INR)",
    "Maintenance/Repair Cost (INR)",
    "PO Number",
    "PR Number",
    "Import Bill URL",
    "Installation Location",
    "IP Address",
    "MAC Address",
    "Processor",
    "RAM",
    "Storage",
    "Operating System",
    "Port Count",
    "License Expiry Date",
    "Total Quantity",
    "Allocated Quantity",
    "Attached Assets",
    "Allocation Status",
    "Allocated To (Name)",
    "Allocated To (ID)",
    ...(hasAssetAllocations ? ["End User"] : []),
    "Department",
    "Allocation Date",
    "Return Date",
    "Condition at Allocation",
    "Condition at Return",
    "Assigned By",
    "Disposal Date",
    "Disposal Reason",
    "Created At",
    "Updated At",
  ];

  const rows: (string | number | null)[][] = [];
  let serial = 0;

  const formatStatusForExport = (status?: string | null) => {
    if (status === ASSET_STATUS.AVAILABLE && userRole === "Viewer") {
      return "Return";
    }
    return status || "";
  };

  const buildAssetRow = (
    asset: Asset,
    parentCode: string,
  ): (string | number | null)[] => {
    const costs = sumCosts(maintenanceRecords.filter(r => String(r.assetId) === String(asset.id)));
    
    return [
      asset.assetCode || "",
      asset.assetName || "",
      parentCode,
      asset.category || "",
      asset.assetType || "",
      asset.model || "",
      asset.serialNumber || "",
      formatStatusForExport(asset.status),
      asset.condition || "",
      asset.invoiceNumber || "",
      formatCSVDate(asset.invoiceDate),
      asset.vendorName || "",
      asset.vendorId || "",
      asset.purchasePrice ?? "",
      costs.renewal || "",
      costs.repair || "",
      asset.purchaseNumber || "",
      asset.prNumber || "",
      asset.importBillUrl || "",
      asset.installationLocation || "",
      "", // IP
      asset.macAddress || "",
      asset.processor || "",
      asset.ram || "",
      asset.storage || "",
      "", // OS
      asset.portCount ?? "",
      formatCSVDate(asset.licenseExpiryDate),
      asset.totalQuantity ?? "",
      asset.allocatedQuantity ?? 0,
      getAttachedAssets(asset.id).join(", "),
    ];
  };

  const appendAllocationCols = (
    asset: Asset,
    allocation?: {
      userName?: string | null;
      employeeId?: string | null;
      parentAssetId?: number | string | null;
      parentAssetName?: string | null;
      department?: string | null;
      ipAddress?: string | null;
      operatingSystem?: string | null;
      installationLocation?: string | null;
      status?: string | null;
      allocationDate?: string | null;
      returnDate?: string | null;
      conditionAtAllocation?: string | null;
      conditionAtReturn?: string | null;
      assignedBy?: string | null;
    } | null,
  ): (string | number | null)[] => {
    let allocStatus = "";
    let allocName = "";
    let allocId = "";
    let dept = "";
    let endUser = "";
    let allocDate = "";
    let returnDate = "";
    let condAlloc = "";
    let condReturn = "";
    let assignedBy = "";

    if (allocation) {
      allocStatus = allocation.status || "";
      allocDate = formatCSVDate(allocation.allocationDate);
      returnDate = formatCSVDate(allocation.returnDate);
      condAlloc = allocation.conditionAtAllocation || "";
      condReturn = allocation.conditionAtReturn || "";
      assignedBy = allocation.assignedBy || "";

      if (allocation.parentAssetId) {
        allocName = `[Asset] ${allocation.parentAssetName || "Unknown"}`;
        allocId = `AssetID: ${allocation.parentAssetId}`;
        dept = "Asset Allocation";
        
        let currentId: number | string | null | undefined = allocation.parentAssetId;
        const seen = new Set();
        while (currentId && !seen.has(String(currentId))) {
          seen.add(String(currentId));
          const pAsset = allAssets.find((a) => String(a.id) === String(currentId));
          if (!pAsset) break;
          if (pAsset.userName) {
            endUser = `${pAsset.userName} (Indirect)`;
            break;
          }
          const pAlloc = licenseAllocations.find(
            (la) => String(la.assetId) === String(pAsset.id) && la.status === "Active"
          );
          if (pAlloc?.userName) {
            endUser = `${pAlloc.userName} (Indirect)`;
            break;
          }
          currentId = pAlloc?.parentAssetId;
        }
      } else if (allocation.installationLocation && !allocation.employeeId) {
        allocName = `[Location] ${allocation.installationLocation}`;
        allocId = "";
        dept = "Location Allocation";
        endUser = "";
      } else {
        allocName = allocation.userName || "";
        allocId = allocation.employeeId || "";
        dept = allocation.department || "";
        endUser = allocation.userName || "";
      }
    } else if (asset.userName || asset.employeeId || asset.parentAssetId) {
      allocStatus = "Active";
      if (asset.parentAssetId) {
        allocName = `Allocated to Asset: ${asset.parentAssetName || "Unknown"}`;
        allocId = `Parent Asset ID: ${asset.parentAssetId}`;
        dept = "Asset Allocation";
        let currentId: number | string | null | undefined = asset.parentAssetId;
        const seen = new Set();
        while (currentId && !seen.has(String(currentId))) {
          seen.add(String(currentId));
          const pAsset = allAssets.find((a) => String(a.id) === String(currentId));
          if (!pAsset) break;
          if (pAsset.userName) {
            endUser = `${pAsset.userName} (Indirect)`;
            break;
          }
          const pAlloc = licenseAllocations.find(
            (la) => String(la.assetId) === String(pAsset.id) && la.status === "Active"
          );
          if (pAlloc?.userName) {
            endUser = `${pAlloc.userName} (Indirect)`;
            break;
          }
          currentId = pAlloc?.parentAssetId;
        }
      } else {
        allocName = asset.userName || "";
        allocId = asset.employeeId || "";
        const user = asset.employeeId ? userMap.get(asset.employeeId) : undefined;
        dept = user?.department || "";
        endUser = asset.userName || "";
      }
    }

    const result = [allocStatus, allocName, allocId];

    if (hasAssetAllocations) {
      result.push(endUser);
    }

    result.push(
      dept,
      allocDate,
      returnDate,
      condAlloc,
      condReturn,
      assignedBy,
      formatCSVDate(asset.disposalDate),
      asset.disposalReason || "",
      formatCSVDateTime(asset.createdAt),
      formatCSVDateTime(asset.updatedAt),
    );

    return result;
  };

  const emitAssetRows = (
    asset: Asset,
    parentCode: string,
  ) => {
    // Include both active and inactive/historical allocations associated with the asset
    const assetAllocations = licenseAllocations.filter(
      (la) => String(la.assetId) === String(asset.id),
    );

    const baseData = buildAssetRow(asset, parentCode);

    if (assetAllocations.length > 0) {
      assetAllocations.forEach((alloc) => {
        serial++;
        const row = [serial, ...baseData];
        row[21] = alloc.ipAddress || ""; // Fixed bug: IP Address is at index 21 of row
        row[26] = alloc.operatingSystem || ""; // Fixed bug: OS is at index 26 of row
        rows.push([...row, ...appendAllocationCols(asset, alloc)]);
      });
    } else {
      serial++;
      rows.push([serial, ...baseData, ...appendAllocationCols(asset)]);
    }
  };

  assetsToExport.forEach((asset) => {
    let parentCode = "";

    // If it's a child unit and being processed directly, resolve its parent info
    if (asset.bulkOrderParentId && !asset.isBulkOrder) {
      const parent = allAssets.find((a) => String(a.id) === String(asset.bulkOrderParentId));
      if (parent) {
        parentCode = parent.assetCode || "";
      }
    }

    emitAssetRows(asset, parentCode);

    if (shouldHideBulkChildUnits && asset.isBulkOrder) {
      const childUnits = allAssets
        .filter(
          (a) =>
            String(a.bulkOrderParentId) === String(asset.id) &&
            !a.isBulkOrder,
        )
        .sort((a, b) => ((a.unitNumber || a.bulkOrderIndex || 0) - (b.unitNumber || b.bulkOrderIndex || 0)));

      childUnits.forEach((child) => {
        emitAssetRows(
          child,
          asset.assetCode || "",
        );
      });
    }
  });

  openDataView({
    title: "Asset Management System - Asset Export",
    headers,
    rows,
    filename: `assets_export_${new Date().toISOString().split("T")[0]}.csv`,
  });
}

export function generateAllocationsExport(
  assetsToExport: Asset[],
  allAssets: Asset[],
  allocations: LicenseAllocation[]
) {
  const hasAssetAllocations =
    allocations.some((a) => !!a.parentAssetId) ||
    allAssets.some((a) => !!a.parentAssetId);

  const headers = [
    "S.No",
    "Asset Code",
    "Asset Name",
    "Category",
    "Asset Type",
    "Asset Status",
    "Asset Condition",
    "Vendor",
    "Serial Number",
    "Model",
    "Part Of (Parent)",
    "Allocation Status",
    "Allocated To (Name)",
    "Allocated To (ID)",
    ...(hasAssetAllocations ? ["End User"] : []),
    "Department",
    "Installation Location",
    "Attached Assets",
    "IP Address",
    "MAC Address",
    "Operating System",
    "Allocation Date",
    "Return Date",
    "Condition at Allocation",
    "Condition at Return",
    "Assigned By",
    "Asset Created At",
    "Asset Updated At",
  ];

  const rows: (string | number | null)[][] = [];
  let serial = 0;

  const getUltimateEndUser = (startParentId: number | string | null | undefined): string => {
    let currentId: number | string | null | undefined = startParentId;
    const seen = new Set();
    while (currentId && !seen.has(String(currentId))) {
      seen.add(String(currentId));
      const pAsset = allAssets.find((a) => String(a.id) === String(currentId));
      if (!pAsset) break;
      if (pAsset.userName) return `${pAsset.userName} (Indirect)`;
      
      const pAlloc = allocations.find(
        (la) => String(la.assetId) === String(pAsset.id) && la.status === "Active"
      );
      if (pAlloc?.userName) return `${pAlloc.userName} (Indirect)`;
      currentId = pAlloc?.parentAssetId;
    }
    return "";
  };

  const getAttachedAssets = (parentId: string | number | undefined, parentAlloc?: LicenseAllocation): string[] => {
    if (!parentId) return [];
    
    const childAllocs = allocations.filter(la => {
        if (String(la.parentAssetId) !== String(parentId)) return false;
        
        if (parentAlloc) {
          // If checking against a specific historical/active allocation, see if they overlap
          const pStart = new Date(parentAlloc.allocationDate || 0).getTime();
          const pEnd = parentAlloc.returnDate ? new Date(parentAlloc.returnDate).getTime() : Infinity;
          
          const cStart = new Date(la.allocationDate || 0).getTime();
          const cEnd = la.returnDate ? new Date(la.returnDate).getTime() : Infinity;
          
          return cStart <= pEnd && cEnd >= pStart;
        }
        
        return la.status === "Active";
    });
    
    let attached: string[] = [];
    for (const childAlloc of childAllocs) {
       const name = childAlloc.assetName || childAlloc.assetCode || "Unknown Asset";
       const code = childAlloc.assetCode || "";
       attached.push(`${name} ${code ? `(${code})` : ""}`.trim());
       attached = attached.concat(getAttachedAssets(childAlloc.assetId, parentAlloc));
    }
    return attached;
  };

  const addAssetRows = (asset: Asset, parentLabel: string) => {
    const assetAllocations = allocations
      .filter((la) => String(la.assetId) === String(asset.id))
      .sort((a, b) => new Date(b.allocationDate || 0).getTime() - new Date(a.allocationDate || 0).getTime());

    if (assetAllocations.length > 0) {
      assetAllocations.forEach((alloc) => {
        serial++;
        let allocName = "";
        let allocId = "";
        let dept = "";
        let endUser = "";

        if (alloc.parentAssetId) {
          allocName = `[Asset] ${alloc.parentAssetName || "Unknown"}`;
          allocId = `AssetID: ${alloc.parentAssetId}`;
          dept = "Asset Allocation";
          endUser = getUltimateEndUser(alloc.parentAssetId);
        } else if (alloc.installationLocation && !alloc.employeeId) {
          allocName = `[Location] ${alloc.installationLocation}`;
          allocId = "";
          dept = "Location Allocation";
          endUser = "";
        } else {
          allocName = alloc.userName || "";
          allocId = alloc.employeeId || "";
          dept = alloc.department || "";
          endUser = alloc.userName || "";
        }

        const rowData = [
          serial,
          asset.assetCode || "",
          asset.assetName || "",
          asset.category || "",
          asset.assetType || "",
          asset.status || "",
          asset.condition || "",
          asset.vendorName || "",
          asset.serialNumber || "",
          asset.model || "",
          parentLabel,
          alloc.status || "",
          allocName,
          allocId,
        ];

        if (hasAssetAllocations) {
          rowData.push(endUser);
        }

        rowData.push(
          dept,
          alloc.installationLocation || asset.installationLocation || "",
          getAttachedAssets(asset.id, alloc).join(", "),
          alloc.ipAddress || "",
          asset.macAddress || "",
          alloc.operatingSystem || "",
          formatCSVDate(alloc.allocationDate),
          formatCSVDate(alloc.returnDate),
          alloc.conditionAtAllocation || "",
          alloc.conditionAtReturn || "",
          alloc.assignedBy || "",
          formatCSVDateTime(asset.createdAt),
          formatCSVDateTime(asset.updatedAt),
        );

        rows.push(rowData);
      });
    }
  };

  const sortedAssetsForExport = [...assetsToExport].sort((a, b) => {
    const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return dateB - dateA;
  });

  sortedAssetsForExport.forEach((asset) => {
    const parentAsset = asset.bulkOrderParentId
      ? allAssets.find((a) => String(a.id) === String(asset.bulkOrderParentId))
      : null;
    const parentLabel = parentAsset
      ? parentAsset.assetName || parentAsset.assetCode || ""
      : "";

    if (asset.isBulkOrder) {
      const childUnits = allAssets
        .filter((a) => String(a.bulkOrderParentId) === String(asset.id) && !a.isBulkOrder)
        .sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
          const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
          return dateB - dateA;
        });
      if (childUnits.length > 0) {
        const bulkParentLabel = asset.assetName || asset.assetCode || "";
        childUnits.forEach((child) => addAssetRows(child, bulkParentLabel));
      } else {
        addAssetRows(asset, parentLabel);
      }
    } else {
      addAssetRows(asset, parentLabel);
    }
  });

  openDataView({
    title: "Allocations - Asset Export",
    headers,
    rows,
    filename: `allocations_export_${new Date().toISOString().split("T")[0]}.csv`,
  });
}

export function generateMaintenanceExport(
  recordsToExport: MaintenanceRecord[],
  allAssets: Asset[]
) {
  const headers = [
    "S.No",
    "Asset Code",
    "Asset Name",
    "Serial Number",
    "Category",
    "Asset Type",
    "Asset Status",
    "Asset Condition",
    "Installation Location",
    "Parent/Bulk Asset",
    "Assigned To",
    "Assigned ID",
    "Vendor Name",
    "Vendor Code",
    "Maintenance Status",
    "Description",
    "Scheduled Date",
    "Completion Date",
    "Duration (Days)",
    "Technician",
    "Cost (INR)",
    "Notes",
    "Created By",
    "Created At",
  ];

  const rows = recordsToExport.map((record, index) => {
    const asset = allAssets.find((a) => String(a.id) === String(record.assetId));

    const scheduledMs = record.scheduledDate
      ? new Date(record.scheduledDate).getTime()
      : 0;
    const endMs = record.completionDate
      ? new Date(record.completionDate).getTime()
      : record.status === "In Progress" || record.status === "Scheduled"
        ? Date.now()
        : 0;
    const durationDays =
      scheduledMs && endMs
        ? Math.ceil(Math.abs(endMs - scheduledMs) / 86400000)
        : "";

    const parentAsset = asset?.bulkOrderParentId
      ? allAssets.find((a) => String(a.id) === String(asset.bulkOrderParentId))
      : null;
    const parentLabel = parentAsset
      ? parentAsset.assetName || parentAsset.assetCode
      : "";

    return [
      index + 1,
      record.assetCode || "",
      record.assetName || "",
      asset?.serialNumber || "",
      asset?.category || "",
      asset?.assetType || "",
      asset?.status || "",
      asset?.condition || "",
      asset?.installationLocation || "",
      parentLabel || "",
      asset?.parentAssetId
        ? `[Asset] ${asset.parentAssetName || "Unknown"}`
        : asset?.installationLocation && !asset?.employeeId
          ? `[Location] ${asset.installationLocation}`
          : asset?.userName || "",
      asset?.parentAssetId
        ? `AssetID: ${asset.parentAssetId}`
        : asset?.installationLocation && !asset?.employeeId
          ? ""
          : asset?.employeeId || "",
      asset?.vendorName || "",
      asset?.vendorId || "",
      record.status || "",
      record.description || "",
      formatCSVDate(record.scheduledDate),
      formatCSVDate(record.completionDate),
      durationDays,
      record.technician || "",
      record.cost ?? "",
      record.notes || "",
      record.createdByName || record.createdBy || "",
      formatCSVDateTime(record.createdAt),
    ];
  });

  openDataView({
    title: "Maintenance Schedule Report",
    headers,
    rows,
    filename: `maintenance_schedule_${new Date().toISOString().split("T")[0]}.csv`,
  });
}
