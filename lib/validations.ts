import { z } from "zod";

export const createBookingSchema = z.object({
  assetId: z.string().min(1, "Asset is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  purpose: z.string().min(1, "Purpose is required").max(255, "Purpose is too long"),
}).refine(data => new Date(data.endTime) > new Date(data.startTime), {
  message: "End time must be after start time",
  path: ["endTime"],
});

export const createAuditSchema = z.object({
  assetId: z.string().min(1, "Asset is required"),
  status: z.enum(["VERIFIED", "DISCREPANCY"], {
    errorMap: () => ({ message: "Status must be Verified or Discrepancy" })
  }),
  notes: z.string().optional(),
});

export const assetSchema = z.object({
  assetCode: z.string().min(1, "Asset Code is required").max(20),
  assetName: z.string().min(1, "Asset Name is required").max(150),
  assetTypeId: z.string().min(1, "Asset Type is required"),
  purchasePrice: z.number().min(0, "Price must be positive"),
  totalQuantity: z.number().min(1, "Quantity must be at least 1"),
  vendorId: z.string().optional(),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().optional(),
  serialNumber: z.string().optional(),
  model: z.string().optional(),
});

export const maintenanceSchema = z.object({
  assetId: z.string().min(1, "Asset is required"),
  scheduledDate: z.string().min(1, "Scheduled Date is required"),
  description: z.string().min(1, "Description is required"),
  cost: z.number().min(0, "Cost must be positive"),
  technician: z.string().optional(),
});

export const allotmentSchema = z.object({
  employeeId: z.string().optional(),
  targetUnitId: z.string().optional(),
  installationLocation: z.string().optional(),
  allocationDate: z.string().min(1, "Allocation date is required"),
}).superRefine((data, ctx) => {
  if (!data.employeeId && !data.targetUnitId && !data.installationLocation) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Must specify an Employee, Target Asset, or Location",
      path: ["employeeId"],
    });
  }
});
