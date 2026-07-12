'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  RefreshCw,
  Store,
  Eye,
  MoreVertical,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Ban,
} from "lucide-react";
import { Vendor } from '@/types';
import dataService from '@/lib/dataService';
import { useDebounce } from '@/hooks/useDebounce';
import { useIsMobile } from '@/hooks/useIsMobile';
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { DeleteConfirmModal } from '@/components/ui/DeleteConfirmModal';
import { getErrorMessage } from '@/lib/utils/errorHelpers';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/utils/dateHelpers';
import { downloadCSV } from '@/lib/utils/csvHelpers';
import { Pagination, DEFAULT_PAGE_SIZE } from '@/components/ui/pagination';

// =============================================
// VENDOR DETAIL MODAL (read-only)
// =============================================

function VendorDetailModal({
  vendor,
  onClose,
  onEdit,
}: {
  vendor: Vendor;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[95dvh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            Vendor Details
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 modal-safe-bottom">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="ui-caps-label">Vendor Code</p>
              <p className="mt-1 text-sm font-mono font-semibold text-gray-900">
                {vendor.id}
              </p>
            </div>
            <div>
              <p className="ui-caps-label">Vendor Name</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {vendor.vendorName}
              </p>
            </div>
            <div>
              <p className="ui-caps-label">Created</p>
              <p className="mt-1 text-sm text-gray-700">
                {formatDisplayDateTime(vendor.createdAt)}
              </p>
            </div>
            <div>
              <p className="ui-caps-label">Updated</p>
              <p className="mt-1 text-sm text-gray-700">
                {formatDisplayDateTime(vendor.updatedAt)}
              </p>
            </div>
            <div>
              <p className="ui-caps-label">Status</p>
              <div className="mt-1">
                {vendor.isBlocked ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                    <Ban className="w-3.5 h-3.5" />
                    Blocked
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Active
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-all">
              Close
            </button>
            <button
              onClick={onEdit}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              Edit
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// =============================================
// VENDOR FORM MODAL
// =============================================

interface VendorFormData {
  vendorId: string;
  vendorName: string;
}

function VendorFormModal({
  vendor,
  existingVendors,
  onSave,
  onClose,
}: {
  vendor: Vendor | null;
  existingVendors: Vendor[];
  onSave: (data: VendorFormData, isEdit: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const isEdit = !!vendor;
  const [form, setForm] = useState<VendorFormData>({
    vendorId: vendor?.id || "",
    vendorName: vendor?.vendorName || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const validateField = (field: string, value: string) => {
    if (field === "vendorId") {
      if (!value.trim()) return "Vendor Code is required";
      if (value.trim().length < 2) return "Must be at least 2 characters";
      if (value.trim().length > 20) return "Must be at most 20 characters";
      if (/\s/.test(value.trim())) return "Must not contain spaces";
      if (
        !isEdit &&
        existingVendors.some(
          (v) => v.id.toLowerCase() === value.trim().toLowerCase(),
        )
      ) {
        return "Vendor Code already exists";
      }
    }
    if (field === "vendorName") {
      if (!value.trim()) return "Vendor Name is required";
      if (value.trim().length < 2) return "Must be at least 2 characters";
      if (value.trim().length > 100) return "Must be at most 100 characters";
      const duplicate = existingVendors.find(
        (v) =>
          v.vendorName.toLowerCase() === value.trim().toLowerCase() &&
          v.id !== vendor?.id,
      );
      if (duplicate) return "Vendor with this name already exists";
    }
    return "";
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    const idErr = validateField("vendorId", form.vendorId);
    if (idErr) errors.vendorId = idErr;
    const nameErr = validateField("vendorName", form.vendorName);
    if (nameErr) errors.vendorName = nameErr;
    setFieldErrors(errors);
    setTouched({ vendorId: true, vendorName: true });
    return Object.keys(errors).length === 0;
  };

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (touched[field]) {
      const err = validateField(field, value);
      if (err) {
        setFieldErrors((prev) => ({ ...prev, [field]: err }));
      } else {
        setFieldErrors((prev) => {
          const { [field]: _, ...rest } = prev;
          return rest;
        });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      setSaving(true);
      setError("");
      await onSave(
        { vendorId: form.vendorId.trim(), vendorName: form.vendorName.trim() },
        isEdit,
      );
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Failed to save vendor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[95dvh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? "Edit Vendor" : "Add Vendor"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 modal-safe-bottom">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Vendor Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.vendorId}
              onChange={(e) => handleChange("vendorId", e.target.value)}
              onBlur={() => {
                setTouched((p) => ({ ...p, vendorId: true }));
                const err = validateField("vendorId", form.vendorId);
                if (err) setFieldErrors((p) => ({ ...p, vendorId: err }));
                else
                  setFieldErrors((p) => {
                    const { vendorId: _, ...rest } = p;
                    return rest;
                  });
              }}
              disabled={isEdit}
              className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${isEdit
                ? "bg-gray-100 text-gray-500 cursor-not-allowed border-gray-300"
                : touched.vendorId && fieldErrors.vendorId
                  ? "border-red-400 bg-red-50/30"
                  : "border-gray-300"
                }`}
              placeholder="e.g., VEND001"
              autoFocus={!isEdit}
            />
            {touched.vendorId && fieldErrors.vendorId && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors.vendorId}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Vendor Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.vendorName}
              onChange={(e) => handleChange("vendorName", e.target.value)}
              onBlur={() => {
                setTouched((p) => ({ ...p, vendorName: true }));
                const err = validateField("vendorName", form.vendorName);
                if (err) setFieldErrors((p) => ({ ...p, vendorName: err }));
                else
                  setFieldErrors((p) => {
                    const { vendorName: _, ...rest } = p;
                    return rest;
                  });
              }}
              className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${touched.vendorName && fieldErrors.vendorName
                ? "border-red-400 bg-red-50/30"
                : "border-gray-300"
                }`}
              placeholder="Vendor name"
              autoFocus={isEdit}
            />
            {touched.vendorName && fieldErrors.vendorName && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors.vendorName}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-all">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2">
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {isEdit ? "Save Changes" : "Create Vendor"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// =============================================
// BULK VENDOR IMPORT MODAL
// =============================================

interface BulkVendorRow {
  vendorId: string;
  vendorName: string;
  status: "valid" | "invalid";
  error?: string;
}

function BulkVendorImportModal({
  existingVendors,
  onClose,
  onImported,
}: {
  existingVendors: Vendor[];
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [step, setStep] = useState<"input" | "preview" | "result">("input");
  const [parsedRows, setParsedRows] = useState<BulkVendorRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseAndValidate = (csvText: string) => {
    const lines = csvText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

    const existingIds = new Set(existingVendors.map((v) => v.id.toLowerCase()));
    const existingNames = new Set(existingVendors.map((v) => v.vendorName.toLowerCase()));
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();

    const rows: BulkVendorRow[] = lines
      .filter((line) => {
        const lower = line.toLowerCase();
        return !(
          lower.startsWith("vendorid") ||
          lower.startsWith("vendor_id") ||
          lower.startsWith("vendor id")
        );
      })
      .map((line) => {
        const sep = line.includes("\t") ? "\t" : ",";
        const parts = line.split(sep).map((p) => p.trim().replace(/^"|"$/g, ""));
        const vendorId = parts[0] || "";
        const vendorName = parts.slice(1).join(",").trim() || "";

        if (!vendorId || !vendorName)
          return { vendorId, vendorName, status: "invalid" as const, error: "Missing Code or Name" };
        if (vendorId.length < 2 || vendorId.length > 20)
          return { vendorId, vendorName, status: "invalid" as const, error: "Code must be 2–20 chars" };
        if (/\s/.test(vendorId))
          return { vendorId, vendorName, status: "invalid" as const, error: "Code must not contain spaces" };
        if (vendorName.length < 2 || vendorName.length > 100)
          return { vendorId, vendorName, status: "invalid" as const, error: "Name must be 2–100 chars" };
        if (existingIds.has(vendorId.toLowerCase()) || seenIds.has(vendorId.toLowerCase()))
          return { vendorId, vendorName, status: "invalid" as const, error: "Vendor Code already exists" };
        if (existingNames.has(vendorName.toLowerCase()) || seenNames.has(vendorName.toLowerCase()))
          return { vendorId, vendorName, status: "invalid" as const, error: "Vendor name already exists" };

        seenIds.add(vendorId.toLowerCase());
        seenNames.add(vendorName.toLowerCase());
        return { vendorId, vendorName, status: "valid" as const };
      });

    setParsedRows(rows);
    setStep("preview");
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) || "";
      parseAndValidate(text);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    const validRows = parsedRows.filter((r) => r.status === "valid");
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const result = await dataService.bulkCreateVendors(
        validRows.map((r) => ({ vendorId: r.vendorId, vendorName: r.vendorName })),
      );
      setImportResult(result);
      setStep("result");
      if (result.created > 0) {
        toast.success(`${result.created} vendor(s) imported successfully`);
        onImported(result.created);
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Bulk import failed");
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = "vendorId,vendorName\r\nVEND001,Acme Corporation\r\nVEND002,Global Supplies Ltd\r\nVEND003,Tech Parts Inc";
    downloadCSV(csv, "vendor_import_template.csv");
  };

  const validCount = parsedRows.filter((r) => r.status === "valid").length;
  const skipCount = parsedRows.filter((r) => r.status === "invalid").length;

  const stepLabels = ["Upload File", "Review", "Done"] as const;
  const stepKeys = ["input", "preview", "result"] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[95dvh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <Upload className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">Bulk Import Vendors</h2>
              {step === "preview" && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {parsedRows.length} row(s) · {validCount} valid · {skipCount} will be skipped
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 modal-safe-bottom">
          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs font-medium">
            {stepKeys.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <div className="w-6 h-px bg-gray-200" />}
                <div
                  className={`px-2.5 py-1 rounded-full transition-all ${step === s
                    ? "bg-blue-100 text-blue-700"
                    : (step === "preview" && s === "input") || (step === "result" && s !== "result")
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-400"
                    }`}>
                  {i + 1}. {stepLabels[i]}
                </div>
              </div>
            ))}
          </div>

          {/* STEP 1: Upload File */}
          {step === "input" && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Upload CSV File</p>
                <label
                  htmlFor="vendor-import-csv"
                  className={`flex flex-col items-center justify-center w-full border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all ${
                    fileName ? "border-blue-400 bg-blue-50/40" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/20"
                  }`}>
                  <Upload className={`w-8 h-8 mb-2 ${ fileName ? "text-blue-500" : "text-gray-400"}`} />
                  <p className="text-sm font-medium text-gray-700">
                    {fileName || "Click to upload CSV file"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">or drag and drop</p>
                  <input
                    id="vendor-import-csv"
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleFile}
                  />
                </label>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 space-y-1">
                <p className="font-semibold">Format rules:</p>
                <ul className="list-disc list-inside space-y-0.5 text-blue-600">
                  <li><code className="bg-blue-100 px-1 rounded">vendorId</code>, <code className="bg-blue-100 px-1 rounded">vendorName</code> (headers required)</li>
                  <li>Vendor Code: 2–20 characters, no spaces</li>
                  <li>Vendor Name: 2–100 characters</li>
                  <li>Comma or tab separated</li>
                  <li>Maximum 1000 vendors per import</li>
                  <li>Duplicates are automatically skipped</li>
                </ul>
              </div>

              <div className="flex justify-between gap-3">
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-all">
                  <Download className="w-4 h-4" />
                  Download Template
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-all">
                    Cancel
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    Choose File
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Preview */}
          {step === "preview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900">{parsedRows.length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Total Rows</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{validCount}</p>
                  <p className="text-xs text-green-600 mt-0.5">Will Import</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">{skipCount}</p>
                  <p className="text-xs text-amber-600 mt-0.5">Will Skip</p>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider w-8">#</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider w-28">Code</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider w-40">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {parsedRows.map((row, i) => (
                        <tr key={i} className={row.status === "valid" ? "bg-white" : "bg-red-50/40"}>
                          <td className="px-3 py-2 text-xs text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-700">{row.vendorId || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2 text-xs text-gray-700">{row.vendorName || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2">
                            {row.status === "valid" ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" /> Valid
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full" title={row.error}>
                                <AlertCircle className="w-3 h-3" /> {row.error}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {validCount === 0 && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  No valid rows to import. Please fix the errors and try again.
                </div>
              )}

              <div className="flex justify-between gap-3">
                <button
                  onClick={() => setStep("input")}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-all">
                  ← Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || validCount === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2">
                  {importing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  Import {validCount} Vendor{validCount !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Result */}
          {step === "result" && importResult && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-green-600" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900">Import Complete</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {importResult.created} vendor{importResult.created !== 1 ? "s" : ""} created
                    {importResult.skipped > 0 && `, ${importResult.skipped} skipped`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-green-700">{importResult.created}</p>
                  <p className="text-xs text-green-600 mt-1">Created</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-amber-700">{importResult.skipped}</p>
                  <p className="text-xs text-amber-600 mt-1">Skipped</p>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="border border-red-200 rounded-lg overflow-hidden">
                  <div className="bg-red-50 px-3 py-2 border-b border-red-200">
                    <p className="text-xs font-semibold text-red-700">Skipped Rows ({importResult.errors.length})</p>
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-red-100">
                    {importResult.errors.map((e, i) => (
                      <p key={i} className="px-3 py-2 text-xs text-red-600">{e}</p>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// =============================================
// ACTION MENU FOR VENDOR ROW
// =============================================

function VendorActionMenu({
  vendor,
  onView,
  onEdit,
  onDelete,
  onToggleBlock,
}: {
  vendor: Vendor;
  onView: (v: Vendor) => void;
  onEdit: (v: Vendor) => void;
  onDelete: (v: Vendor) => void;
  onToggleBlock: (v: Vendor) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const handleTrigger = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const r = window.innerWidth - rect.right;
      const menuW = 208;
      const safeR = Math.max(8, Math.min(r, window.innerWidth - menuW - 8));
      setMenuPos(
        spaceBelow < 200
          ? { bottom: window.innerHeight - rect.top + 5, right: safeR }
          : { top: rect.bottom + 5, right: safeR },
      );
    }
    setIsOpen(true);
  };

  return (
    <div className="relative flex items-center justify-center">
      <button
        ref={triggerRef}
        onClick={handleTrigger}
        className="p-2 hover:bg-gray-100 rounded-xl transition-all no-push group"
        title="Actions">
        <MoreVertical className="w-5 h-5 text-gray-500 group-hover:text-gray-700" />
      </button>
      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed w-52 bg-white rounded-2xl shadow-xl overflow-hidden z-50"
              style={{
                top: menuPos?.top,
                bottom: menuPos?.bottom,
                right: menuPos?.right,
                boxShadow:
                  "0 10px 40px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)",
              }}
              onClick={(e) => e.stopPropagation()}>
              <div className="py-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onView(vendor);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-all no-push">
                  <Eye className="w-4 h-4" />
                  View Details
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(vendor);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-green-50 hover:text-green-700 transition-all no-push">
                  <Pencil className="w-4 h-4" />
                  Edit Vendor
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleBlock(vendor);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all no-push ${vendor.isBlocked ? "text-green-700 hover:bg-green-50" : "text-orange-700 hover:bg-orange-50"}`}>
                  {vendor.isBlocked ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Unblock Vendor
                    </>
                  ) : (
                    <>
                      <Ban className="w-4 h-4" />
                      Block Vendor
                    </>
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(vendor);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-700 transition-all no-push">
                  <Trash2 className="w-4 h-4" />
                  Delete Vendor
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================
// MAIN COMPONENT
// =============================================

export function VendorsManagement() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const debouncedSearch = useDebounce(searchQuery, 300);
  const isMobile = useIsMobile();

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else {
        setSortKey(null);
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col)
      return (
        <ArrowUpDown className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-all no-push" />
      );
    return sortDir === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-blue-600" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
    );
  };

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [deleteVendor, setDeleteVendor] = useState<Vendor | null>(null);
  const [viewingVendor, setViewingVendor] = useState<Vendor | null>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);

  const fetchVendors = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dataService.getVendors();
      const safeVendors = Array.isArray(data) ? data : [];
      setVendors(safeVendors);
      window.dispatchEvent(new CustomEvent("VENDORS_UPDATED", { detail: safeVendors }));
    } catch (err: unknown) {
      toast.error("Failed to load vendors: " + getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const filtered = useMemo(() => {
    const list = (vendors || []).filter((v) => {
      if (!debouncedSearch) return true;
      const q = debouncedSearch.toLowerCase();
      return (
        v.vendorName?.toLowerCase().includes(q) ||
        v.id?.toLowerCase().includes(q)
      );
    });

    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      list.sort((a, b) => {
        let aVal: string | number = "";
        let bVal: string | number = "";
        switch (sortKey) {
          case "id":
            aVal = a.id || "";
            bVal = b.id || "";
            break;
          case "vendorName":
            aVal = (a.vendorName || "").toLowerCase();
            bVal = (b.vendorName || "").toLowerCase();
            break;
          case "createdAt":
            aVal = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            bVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            break;
          case "updatedAt":
            aVal = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            bVal = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            break;
        }
        if (aVal < bVal) return -1 * dir;
        if (aVal > bVal) return 1 * dir;
        return 0;
      });
    }
    return list;
  }, [vendors, debouncedSearch, sortKey, sortDir]);

  const totalRecords = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  const paginatedVendors = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filtered.slice(startIndex, startIndex + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleSaveVendor = async (data: VendorFormData, isEdit: boolean) => {
    if (isEdit) {
      await dataService.updateVendor(data.vendorId, data.vendorName);
      toast.success("Vendor updated successfully");
    } else {
      await dataService.createVendor({
        vendorId: data.vendorId,
        vendorName: data.vendorName,
      });
      toast.success("Vendor created successfully");
    }
    setShowForm(false);
    setEditingVendor(null);
    fetchVendors();
  };

  const handleDeleteVendor = async () => {
    if (!deleteVendor) return;
    try {
      await dataService.deleteVendor(deleteVendor.id);
      toast.success("Vendor deleted successfully");
      setDeleteVendor(null);
      fetchVendors();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to delete vendor");
    }
  };

  const handleToggleBlock = async (vendor: Vendor) => {
    try {
      const { isBlocked } = await dataService.toggleVendorBlock(vendor.id);
      toast.success(
        `Vendor ${isBlocked ? "blocked" : "unblocked"} successfully`
      );
      fetchVendors();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to toggle vendor status");
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Vendors
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Manage vendor records
            {vendors.length > 0 && (
              <span className="ml-1 text-gray-400">
                ({vendors.length} total)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchVendors}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowBulkImport(true)}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all">
            <Upload className="w-4 h-4" />
            Bulk Import
          </button>
          <button
            onClick={() => {
              setEditingVendor(null);
              setShowForm(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all shadow-sm">
            <Plus className="w-4 h-4" />
            Add Vendor
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by code or name..."
            className="w-full pl-9 pr-10 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Loading State */}
        {loading ? (
          <div className="animate-pulse">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex gap-4">
              {["w-20", "flex-1", "w-24", "w-24", "w-12"].map((w, i) => (
                <div key={i} className={`h-3 bg-gray-200 rounded ${w}`} />
              ))}
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="px-4 py-3.5 border-b border-gray-50 flex items-center gap-4">
                <div className="h-3 w-16 bg-gray-100 rounded" />
                <div className="h-3 flex-1 bg-gray-100 rounded" />
                <div className="h-3 w-20 bg-gray-100 rounded" />
                <div className="h-3 w-20 bg-gray-100 rounded" />
                <div className="h-6 w-6 bg-gray-100 rounded-lg" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <Store className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">
                {searchQuery ? "No vendors found" : "No vendors yet"}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            {!isMobile && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {[
                        { key: "id", label: "Code", width: "w-28" },
                        { key: "vendorName", label: "Vendor Name" },
                        { key: "status", label: "Status" },
                        { key: "createdAt", label: "Created" },
                        { key: "updatedAt", label: "Updated" },
                      ].map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none group transition-all hover:bg-gray-100 ${col.width || ""} ${sortKey === col.key
                            ? "text-blue-700 bg-blue-50/50"
                            : "text-gray-600"
                            }`}>
                          <span className="inline-flex items-center gap-1.5">
                            {col.label}
                            <SortIcon col={col.key} />
                          </span>
                        </th>
                      ))}
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-20">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedVendors.map((v) => (
                      <tr
                        key={v.id}
                        className="hover:bg-gray-50/50 transition-all cursor-pointer"
                        onClick={() => setViewingVendor(v)}>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 font-medium">
                          {v.id}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {v.vendorName}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {v.isBlocked ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                              <Ban className="w-3 h-3" />
                              Blocked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                              <CheckCircle2 className="w-3 h-3" />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {formatDisplayDate(v.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {formatDisplayDate(v.updatedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <VendorActionMenu
                            vendor={v}
                            onView={(v) => setViewingVendor(v)}
                            onEdit={(v) => {
                              setEditingVendor(v);
                              setShowForm(true);
                            }}
                            onDelete={(v) => setDeleteVendor(v)}
                            onToggleBlock={handleToggleBlock}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Mobile Card View */}
            {isMobile && (
              <div className="divide-y divide-gray-100">
                {paginatedVendors.map((v) => (
                  <div
                    key={v.id}
                    className="p-4 hover:bg-gray-50 transition-all cursor-pointer"
                    onClick={() => setViewingVendor(v)}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate flex items-center gap-2">
                          {v.vendorName}
                          {v.isBlocked && (
                            <span className="inline-flex items-center justify-center bg-red-100 text-red-800 rounded-full px-1.5 py-0.5 border border-red-200">
                              <Ban className="w-3 h-3" />
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-gray-500 font-mono mt-0.5">
                          {v.id}
                        </p>
                      </div>
                      <div className="ml-2 shrink-0">
                        <VendorActionMenu
                          vendor={v}
                          onView={(v) => setViewingVendor(v)}
                          onEdit={(v) => {
                            setEditingVendor(v);
                            setShowForm(true);
                          }}
                          onDelete={(v) => setDeleteVendor(v)}
                          onToggleBlock={handleToggleBlock}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {v.createdAt && (
                        <span className="text-xs text-gray-500">
                          Created {formatDisplayDate(v.createdAt)}
                        </span>
                      )}
                      {v.updatedAt && (
                        <>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-500">
                            Updated {formatDisplayDate(v.updatedAt)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        {!loading && filtered.length > 0 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalRecords}
            itemsPerPage={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {viewingVendor && (
          <VendorDetailModal
            vendor={viewingVendor}
            onClose={() => setViewingVendor(null)}
            onEdit={() => {
              setEditingVendor(viewingVendor);
              setViewingVendor(null);
              setShowForm(true);
            }}
          />
        )}
      </AnimatePresence>

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <VendorFormModal
            vendor={editingVendor}
            existingVendors={vendors}
            onSave={handleSaveVendor}
            onClose={() => {
              setShowForm(false);
              setEditingVendor(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Bulk Import Modal */}
      <AnimatePresence>
        {showBulkImport && (
          <BulkVendorImportModal
            existingVendors={vendors}
            onClose={() => setShowBulkImport(false)}
            onImported={() => {
              setShowBulkImport(false);
              fetchVendors();
            }}
          />
        )}
      </AnimatePresence>

      {/* Delete Modal */}
      <AnimatePresence>
        {deleteVendor && (
          <DeleteConfirmModal
            title="Delete Vendor"
            message={`Are you sure you want to delete "${deleteVendor.vendorName}" (${deleteVendor.id})? This action cannot be undone.`}
            onConfirm={handleDeleteVendor}
            onClose={() => setDeleteVendor(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
