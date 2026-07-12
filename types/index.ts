import { AssetCondition, isSoftwareLikeCategory } from '@/config/constants';

// =============================================
// ASSET — Maps to: Assets table + AssetTypes + Vendors + Allocations (joined)
// Schema: SCHEMA_OVERVIEW.md §4
// =============================================
export interface Asset {
  id: string; // Assets.AssetID
  assetCode: string; // Assets.AssetCode
  assetName: string; // Assets.AssetName
  category: string; // AssetTypes.CategoryName (joined via AssetTypeID)
  assetType: string; // AssetTypes.TypeName (joined via AssetTypeID)

  // Purchase Information
  invoiceNumber: string; // Assets.InvoiceNumber
  invoiceDate: string | null; // Assets.InvoiceDate
  vendorId: string; // Assets.VendorID (FK → Vendors)
  vendorName: string; // Vendors.VendorName (joined)
  purchasePrice: number | null; // Assets.PurchasePrice
  purchaseNumber?: string | null; // Assets.PurchaseNumber (PO number)
  prNumber?: string | null; // Assets.PRNumber (Purchase Request number)
  importBillUrl?: string | null; // Assets.ImportBillUrl (file path/URL)

  // Current Allocation (from Allocations table via CurrentAllocation CTE)
  employeeId: string | null; // Allocations.EmployeeID (most recent active)
  userName: string | null; // Users.FullName (joined via Allocations)
  parentAssetId?: number | null; // Allocations.ParentAssetID
  parentAssetName?: string | null; // Assets.AssetName of parent (joined)
  installationLocation?: string | null; // Allocations.InstallationLocation (most recent active)

  // Asset Specifications
  serialNumber?: string; // Assets.SerialNumber
  model?: string; // Assets.Model

  // Hardware-specific fields
  ram?: string; // Assets.RAM
  storage?: string; // Assets.Storage
  processor?: string; // Assets.Processor
  macAddress?: string | null; // Assets.MACAddress (unique per hardware device)

  // Software-specific fields
  licenseExpiryDate?: string | null; // Assets.LicenseExpiry
  licenseType?:
  | "PERPETUAL"
  | "SUBSCRIPTION"
  | "SAAS"
  | "TRIAL"
  | "VOLUME"
  | "ENTERPRISE"
  | null; // Assets.LicenseType
  renewalCost?: number | null; // For license renewals
  isRenewalRecord?: boolean; // For license renewals

  // Networking-specific fields (immutable hardware specs)
  portCount?: number | null; // Assets.PortCount
  portSpeed?: string; // Assets.PortSpeed

  // Quantity Tracking — single source of truth for all categories
  totalQuantity?: number; // Assets.TotalQuantity (same value for Hardware, Software, Networking)
  allocatedQuantity?: number; // Assets.AllocatedQuantity — count of active allocations
  availableQuantity?: number; // Computed frontend-only: TotalQuantity - AllocatedQuantity (NOT stored in DB)

  // Bulk Order Fields — for individual unit tracking
  isBulkOrder?: boolean; // TRUE for parent asset (e.g., HW001), FALSE for children (e.g., HW001-01)
  bulkOrderParentId?: string | null; // NULL for parent, AssetID of parent for children
  bulkOrderIndex?: number | null; // NULL for parent, 1-based index for children (1, 2, 3...)
  unitNumber?: number | null; // Alias for bulkOrderIndex for display purposes

  // Status management
  status:
  | "Available"
  | "Allocated"
  | "Partially Allocated"
  | "Under Maintenance"
  | "License Expired"
  | "Disposed";
  condition?: AssetCondition | null; // Assets.Condition ('EXCELLENT','GOOD','FAIR','POOR')

  // Disposal
  disposalDate: string | null; // Assets.DisposalDate
  disposalReason?: string | null; // Assets.DisposalReason

  // Timestamps
  createdAt: string; // Assets.CreatedAt
  updatedAt: string; // Assets.UpdatedAt
}

// =============================================
// MAINTENANCE — Maps to: Maintenance table
// Schema: SCHEMA_OVERVIEW.md §6
// =============================================
export interface MaintenanceRecord {
  id: string; // Maintenance.MaintenanceID
  assetId: string; // Maintenance.AssetID (FK → Assets)
  assetCode: string; // Assets.AssetCode (joined)
  assetName: string; // Assets.AssetName (joined)
  scheduledDate: string; // Maintenance.ScheduledDate
  completionDate: string | null; // Maintenance.CompletedDate
  description: string; // Maintenance.Description
  status: "Scheduled" | "In Progress" | "Completed" | "Cancelled" | "Reported"; // Maintenance.Status
  technician: string | null; // Maintenance.Technician
  cost: number | null; // Maintenance.Cost
  notes: string | null; // Maintenance.Notes (in actual table)
  frequency?:
  | "Monthly"
  | "Quarterly"
  | "Half-Yearly"
  | "Yearly"
  | "One-Time"
  | null; // Maintenance.Frequency
  createdAt?: string; // Maintenance.CreatedAt
  createdBy?: string | null; // Resolved from AuditLog.ChangedBy
  createdByName?: string | null; // Resolved from Users.FullName
  isBulkGroupRecord?: boolean | number; // Maintenance.IsBulkGroupRecord
  unitCount?: number; // Maintenance.UnitCount (for bulk group records)
  snapshotCoveredUnits?: Array<{ id: string; code: string; name?: string }>;
  snapshotSkippedUnits?: Array<{ id: string; code: string; name?: string }>;
  snapshotTotalUnits?: number;
  renewed?: MaintenanceRecord; // Auto-renewed next schedule (only present in update response)
}

// =============================================
// USER — Maps to: Users table
// Schema: SCHEMA_OVERVIEW.md §3
// =============================================
export interface User {
  employeeId: string; // Users.EmployeeID (PK)
  userName: string; // Users.FullName
  department: string; // Users.Department
  email?: string | null; // Users.Email (optional, for notifications)
  role?: "Admin" | "Manager" | "Viewer"; // Users.Role (RBAC)
  isBlocked?: boolean; // Users.IsBlocked
  managedCategories?: string[]; // Users.ManagedCategories
  createdAt?: string; // Users.CreatedAt
  updatedAt?: string; // Users.UpdatedAt
}

// =============================================
// VENDOR — Maps to: Vendors table
// Schema: SCHEMA_OVERVIEW.md §2
// =============================================
export interface Vendor {
  id: string; // Vendors.VendorID (PK)
  vendorName: string; // Vendors.VendorName
  isBlocked?: boolean; // Vendors.IsBlocked
  createdAt?: string; // Vendors.CreatedAt
  updatedAt?: string; // Vendors.UpdatedAt
}

// =============================================
// ASSET HISTORY — Maps to: AssetHistory table
// Schema: SCHEMA_OVERVIEW.md §7
// =============================================
export interface AssetHistory {
  id: string; // AssetHistory.HistoryID
  assetId: string; // AssetHistory.AssetID
  assetCode: string; // Assets.AssetCode (joined)
  assetName: string; // Assets.AssetName (joined)
  category: string; // AssetTypes.CategoryName (joined)
  employeeId: string | null; // Allocations.EmployeeID (context)
  userName: string | null; // Users.FullName (joined)
  department: string | null; // Users.Department (joined)
  parentAssetId?: string | number | null; // Allocations.ParentAssetID
  parentAssetName?: string | null; // Assets.AssetName of parent
  parentAssetCode?: string | null; // Assets.AssetCode of parent
  assignedDate: string; // AssetHistory.ActionDate
  returnedDate: string | null; // Derived from action type
  durationDays: number | null; // Computed
  status: "Active" | "Returned" | "Revoked" | "Expired"; // Derived
  assignedBy: string; // AssetHistory.PerformedBy
  returnedBy: string | null; // AssetHistory.PerformedBy (on return)
  notes: string | null; // AssetHistory.Notes
  condition: AssetCondition | null; // AssetHistory.Condition (general)
  conditionAtAllocation?: AssetCondition | null; // Condition when allocated (ALLOCATION actions)
  conditionAtReturn?: AssetCondition | null; // Condition when returned (RETURN/REVOKED actions)
  actionType?: string | null; // AssetHistory.ActionType
  changedBy?: string | null; // AssetHistory.PerformedBy
  performedByName?: string | null; // Users.FullName of PerformedBy
  changeDescription?: string | null; // AssetHistory.Notes
  licensesAllocated?: number; // Hardcoded: 1 per allocation row (no Quantity column in DB)
  // v8.0 Schema - Allocation-specific deployment fields
  ipAddress?: string | null; // Allocations.IPAddress
  operatingSystem?: string | null; // Allocations.OperatingSystem
  installationLocation?: string | null; // Allocations.InstallationLocation
  // Chain allocation fields (for showing child assets allocated to a parent)
  isChildAsset?: boolean; // True if this is a child asset in a chain
  chainParentAssetId?: string | number | null; // The ultimate parent in the chain (e.g., laptop)
  chainParentAssetName?: string | null; // Name of the chain parent
}

// =============================================
// ALLOCATION — Maps to: Allocations table
// Schema: SCHEMA_OVERVIEW.md §5
// =============================================
export interface LicenseAllocation {
  id: string; // Allocations.AllocationID
  assetId: string; // Allocations.AssetID
  assetCode: string; // Assets.AssetCode (joined)
  assetName: string; // Assets.AssetName (joined)
  employeeId: string | null; // Allocations.EmployeeID
  userName: string | null; // Users.FullName (joined)
  department: string | null; // Users.Department (joined)
  parentAssetId?: number | null; // Allocations.ParentAssetID
  parentAssetName?: string | null; // Assets.AssetName of parent (joined)
  targetUnitId?: string | number | null; // Allocations.TargetUnitID (for asset-to-asset to child units)
  licensesAllocated: number; // Hardcoded: 1 per allocation row (no Quantity column in DB)
  allocationDate: string; // Allocations.AllocationDate
  returnDate?: string | null; // Allocations.ReturnDate
  installationLocation?: string | null; // Allocations.InstallationLocation (schema v9.0)

  // Deployment-specific fields (MUTABLE per allocation)
  ipAddress?: string | null; // Allocations.IPAddress
  operatingSystem?: string | null; // Allocations.OperatingSystem

  status: "Active" | "Revoked" | "Returned" | "Expired"; // Allocations.Status
  conditionAtAllocation?: AssetCondition | null; // Allocations.ConditionAtAllocation
  conditionAtReturn?: AssetCondition | null; // Allocations.ConditionAtReturn
  assignedBy?: string | null; // Allocations.AssignedBy
  returnedBy?: string | null; // User who returned the allocation
  returnNotes?: string | null; // Allocations.ReturnNotes
}

// =============================================
// AUDIT LOG — Maps to: AuditLog table
// Schema: SCHEMA_OVERVIEW.md §8
// =============================================
export interface AuditLog {
  id: string; // AuditLog.AuditLogID
  table: string; // AuditLog.TableName
  recordId: string; // AuditLog.RecordID
  action: string; // AuditLog.Action
  oldValue: string | null; // AuditLog.OldValues
  newValue: string | null; // AuditLog.NewValues
  performedBy: string; // AuditLog.ChangedBy (employee ID)
  performedByName?: string | null; // Users.FullName (JOIN-resolved, human-readable)
  date: string; // AuditLog.ChangedAt
  additionalInfo?: string | null; // AuditLog.AdditionalInfo
  assetName?: string | null; // Resolved asset name from JOIN
  assetCode?: string | null; // Resolved asset code from JOIN
  targetUserName?: string | null; // For Users table records — resolved FullName
  targetVendorName?: string | null; // For Vendors table records — resolved VendorName
}

// =============================================
// CATEGORY — Maps to: AssetTypes table (distinct CategoryName)
// Schema: SCHEMA_OVERVIEW.md §1
// =============================================
export interface Category {
  id: string; // AssetTypes.CategoryName (used as ID)
  name?: string; // Display name (same as id)
}

// =============================================
// UNIFIED ASSET HELPERS
// =============================================

/** Get display label for quantity based on category */
export const getQuantityLabel = (category: string, singular = false): string =>
  isSoftwareLikeCategory(category)
    ? singular
      ? "License"
      : "Licenses"
    : singular
      ? "Unit"
      : "Units";

/** Get total allocatable quantity */
export const getTotalQuantity = (asset: Asset): number => {
  if (asset.totalQuantity === 0) return 0;
  return asset.totalQuantity || 1;
};

/** Get currently allocated quantity */
export const getAllocatedQuantity = (asset: Asset): number =>
  asset.allocatedQuantity || 0;

/** Get available quantity (remaining for allocation) */
export const getAvailableQuantity = (asset: Asset): number =>
  getTotalQuantity(asset) - getAllocatedQuantity(asset);

/** Get allocation target display name */
export const getAllocationTargetName = (
  employeeId: string | null,
  userName: string | null,
  parentAssetId: number | string | null,
  parentAssetName: string | null,
): string =>
  parentAssetId && parentAssetName
    ? `Asset: ${parentAssetName}`
    : employeeId && userName
      ? userName
      : "Unassigned";


// NOTE: Do NOT re-export from config/constants or utils/assetUtils here.
// Doing so creates circular imports and duplicate export conflicts.
// Import constants directly from '@/config/constants' where needed.
