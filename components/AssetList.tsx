'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Download,
  Search,
  Filter,
  X,
  Check,
  ChevronDown,
  Plus,
  Upload,
  FileText,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Pagination } from '@/components/ui/pagination';
import { Asset, User, LicenseAllocation, MaintenanceRecord } from '@/types';
import {
  ASSET_STATUS,
  ASSET_CONDITIONS,
  DEFAULT_CONDITION,
  ASSET_STATUS_ARRAY,
  ALLOCATION_STATUS_DISPLAY,
  MAINTENANCE_STATUS,
  canCreate as canRoleCreate,
  type UserRole,
  isSoftwareLikeCategory,
  RECORDS_PER_PAGE,
  HIDE_DELETE_UI,
} from '@/config/constants';
import { useDebounce } from '@/hooks/useDebounce';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSmartDropdownPosition } from '@/hooks/useSmartDropdownPosition';
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { ConfirmationModal } from "./ConfirmationModal";
import { DisposalModal } from "./DisposalModal";
import {
  getAllocatedQuantity,
  getTotalQuantity,
  getQuantityLabel,
} from '@/types';
import { formatCSVDate, formatCSVDateTime } from '@/lib/utils/csvHelpers';
import { openDataView } from '@/lib/utils/dataViewHelpers';
import { generateAssetsExport, generateAllocationsExport } from '@/lib/utils/exportHelpers';
import { downloadXlsx } from '@/lib/utils/xlsxHelpers';
import {
  getAllocationDisplay,
  STATUS_DOT_HL,
} from '@/lib/utils/assetDisplayHelpers';
import dataService from '@/lib/dataService';
import { getErrorMessage } from '@/lib/utils/errorHelpers';

// =============================================
// HELPERS
// =============================================
const CONDITION_DOT: Record<string, string> = {
  all: "bg-gray-400",
  EXCELLENT: "bg-green-500",
  GOOD: "bg-blue-500",
  FAIR: "bg-amber-500",
  POOR: "bg-red-500",
};

// =============================================
// FILTER DROPDOWN (reusable)
// =============================================
function FilterDropdown({
  id,
  label,
  value,
  options,
  activeDropdown,
  setActiveDropdown,
  onChange,
  dot,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string; dot?: string }[];
  activeDropdown: string | null;
  setActiveDropdown: (v: string | null) => void;
  onChange: (v: string) => void;
  dot?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOpen = activeDropdown === id;
  const selected = options.find((o) => o.value === value);

  const { openUpward, maxHeight } = useSmartDropdownPosition({
    isOpen,
    anchorRef: triggerRef,
    menuRef,
    preferredMaxHeight: Math.min(240, options.length * 36 + 8),
  });

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setActiveDropdown(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, setActiveDropdown]);

  return (
    <div className="relative flex-1 min-w-0" ref={ref}>
      <label className="ui-filter-label">{label}</label>
      <button
        ref={triggerRef}
        onClick={() => setActiveDropdown(isOpen ? null : id)}
        className={`mt-1 w-full flex items-center justify-between pl-3.5 pr-3 py-2 border rounded-lg transition-all text-sm font-medium shadow-sm bg-white hover:border-gray-400 group border-gray-300`}>
        <span
          className={`flex items-center gap-2 truncate ${value === "all" ? "text-gray-400" : "text-gray-900"}`}>
          {dot && selected?.dot && (
            <span className={`w-2 h-2 rounded-full shrink-0 ${selected.dot}`} />
          )}
          {selected?.label ?? value}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setActiveDropdown(null)}
            />
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.98, y: 2 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 2 }}
              className={`absolute z-50 w-full bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden py-1 overflow-y-auto custom-scrollbar ${openUpward ? "bottom-full mb-1" : "top-full mt-1"
                }`}
              style={{ maxHeight: `${maxHeight}px` }}>
              {options.map((opt) => {
                const isSelected = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      setActiveDropdown(null);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium transition-all duration-150 ${isSelected
                      ? dot
                        ? STATUS_DOT_HL[opt.value]?.hl ||
                        "bg-blue-50 text-blue-700"
                        : "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-50"
                      }`}>
                    {dot && opt.dot && (
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`}
                      />
                    )}
                    <span className="truncate flex-1 text-left">
                      {opt.label}
                    </span>
                    {isSelected && (
                      <div className="ml-auto bg-blue-600 rounded-full p-0.5 shrink-0">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================
// STATIC DATA - HOISTED OUTSIDE COMPONENT
// =============================================

const getStatusOptions = (userRole?: UserRole) => [
  { value: "all", label: "All Statuses" },
  ...ASSET_STATUS_ARRAY.map((s) => ({
    ...s,
    label:
      s.value === "Available" && userRole === "Viewer" ? "Return" : s.label,
  })),
];

// =============================================
// BULK ASSET IMPORT (CSV)
// =============================================

// Simplified headers - only mandatory fields for bulk import
// Optional fields (metadata) can be edited individually after creation
const ASSET_IMPORT_HEADERS = [
  "Asset Code",
  "Asset Name",
  "Category",
  "Asset Type",
  "Total Quantity",
  "Vendor Code",
  "License Type",
  "Purchase Price",
];

const ASSET_IMPORT_SAMPLE_ROWS = [
  [
    "HW-LTP-001",
    "Lenovo ThinkPad T14",
    "Hardware",
    "Laptop",
    "1",
    "VEND001",
    "",
    "55000",
  ],
  [
    "SW-CRM-001",
    "Salesforce CRM",
    "Software",
    "SaaS",
    "25",
    "VEND002",
    "SUBSCRIPTION",
    "12500",
  ],
  [
    "HW-MON-001",
    "Dell U2720Q Monitor",
    "Hardware",
    "Monitor",
    "5",
    "VEND001",
    "",
    "22000",
  ],
  [
    "NET-SWITCH-001",
    "Cisco Catalyst 2960",
    "Networking",
    "Switch",
    "2",
    "VEND003",
    "",
    "45000",
  ],
];

// Full headers reference (for documentation purposes)
const ASSET_IMPORT_HEADERS_FULL = [
  "Asset Code",
  "Asset Name",
  "Category",
  "Asset Type",
  "Total Quantity",
  "Vendor Code",
  "Vendor Name",
  "Invoice Number",
  "Invoice Date",
  "Purchase Price",
  "Purchase Number",
  "PR Number",
  "Import Bill URL",
  "Serial Number",
  "Model",
  "RAM",
  "Storage",
  "Processor",
  "MAC Address",
  "Port Count",
  "Port Speed",
  "License Type",
  "License Expiry Date",
  "Status",
  "Condition",
];

const ASSET_IMPORT_REQUIRED = [
  "assetCode",
  "assetName",
  "category",
  "assetType",
  "totalQuantity",
  "vendorCode",
] as const;

// Category-specific mandatory fields (in addition to base required fields)
const CATEGORY_SPECIFIC_MANDATORY: Record<string, string[]> = {
  Software: ["licenseType"],
  Hardware: [],
  Networking: [],
};

const ASSET_IMPORT_LABELS: Record<string, string> = {
  assetCode: "Asset Code",
  assetName: "Asset Name",
  category: "Category",
  assetType: "Asset Type",
  totalQuantity: "Total Quantity",
  vendorCode: "Vendor Code",
  licenseType: "License Type",
};

const ASSET_IMPORT_HEADER_MAP: Record<string, string> = {
  assetcode: "assetCode",
  assetname: "assetName",
  category: "category",
  assettype: "assetType",
  totalquantity: "totalQuantity",
  totalqty: "totalQuantity",
  qty: "totalQuantity",
  quantity: "totalQuantity",
  vendorcode: "vendorCode",
  vendorid: "vendorCode",
  vendorname: "vendorName",
  invoicenumber: "invoiceNumber",
  invoicedate: "invoiceDate",
  purchaseprice: "purchasePrice",
  purchasenumber: "purchaseNumber",
  prnumber: "prNumber",
  importbillurl: "importBillUrl",
  serialnumber: "serialNumber",
  model: "model",
  ram: "ram",
  storage: "storage",
  processor: "processor",
  macaddress: "macAddress",
  portcount: "portCount",
  portspeed: "portSpeed",
  licensetype: "licenseType",
  licenseexpirydate: "licenseExpiryDate",
  status: "status",
  condition: "condition",
};

const normalizeHeader = (value: string) =>
  value
    .trim()
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const detectDelimiter = (line: string) =>
  line.includes("\t") && !line.includes(",") ? "\t" : ",";

const splitCsvLine = (line: string, delimiter: string) => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
};

const mapAssetRows = (
  headerCells: (string | number | null | undefined)[],
  dataRows: (string | number | null | undefined)[][],
) => {
  const normalizedHeaders = headerCells.map((cell) =>
    normalizeHeader(String(cell ?? "")),
  );
  const mappedHeaders = normalizedHeaders.map(
    (h) => ASSET_IMPORT_HEADER_MAP[h] || "",
  );

  const rows = dataRows
    .filter((cells) => cells.some((cell) => String(cell ?? "").trim()))
    .map((cells) => {
      const row: Record<string, string> = {};
      mappedHeaders.forEach((key, idx) => {
        if (!key) return;
        row[key] = String(cells[idx] ?? "").trim();
      });
      return row;
    });

  return { rows, headers: mappedHeaders };
};

const parseAssetCsv = (text: string) => {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim());
  if (lines.length === 0) return { rows: [], headers: [] };

  const delimiter = detectDelimiter(lines[0]);
  const headerCells = splitCsvLine(lines[0], delimiter);
  const dataRows = lines.slice(1).map((line) => splitCsvLine(line, delimiter));
  return mapAssetRows(headerCells, dataRows);
};

const parseAssetXlsx = (data: ArrayBuffer) => {
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: [], headers: [] };

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(
    sheet,
    {
      header: 1,
      raw: false,
      defval: "",
    },
  ) as (string | number | null | undefined)[][];

  if (rows.length === 0) return { rows: [], headers: [] };
  const [headerCells, ...dataRows] = rows;
  return mapAssetRows(headerCells, dataRows);
};

type BulkAssetRow = {
  assetCode: string;
  assetName: string;
  category: string;
  assetType: string;
  totalQuantity: number | null;
  vendorCode?: string | null;
  vendorName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  purchasePrice?: number | null;
  purchaseNumber?: string | null;
  prNumber?: string | null;
  importBillUrl?: string | null;
  serialNumber?: string | null;
  model?: string | null;
  ram?: string | null;
  storage?: string | null;
  processor?: string | null;
  macAddress?: string | null;
  portCount?: number | null;
  portSpeed?: string | null;
  licenseType?: string | null;
  licenseExpiryDate?: string | null;
  status?: string | null;
  condition?: string | null;
  _error?: string;
};

function BulkAssetImportModal({
  assets,
  vendors,
  onClose,
  onDone,
  userRole = "Viewer" as UserRole,
  managedCategories = [] as string[],
}: {
  assets: Asset[];
  vendors: Array<{ id: string; vendorName: string; isBlocked?: boolean }>;
  onClose: () => void;
  onDone: () => void;
  userRole?: UserRole;
  managedCategories?: string[];
}) {
  const [rows, setRows] = useState<BulkAssetRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    unitsCreated: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingCodes = useMemo(
    () => new Set(assets.map((a) => (a.assetCode || "").toLowerCase())),
    [assets],
  );
  const existingSerials = useMemo(
    () =>
      new Set(
        assets
          .map((a) => (a.serialNumber || "").toLowerCase())
          .filter((v) => v),
      ),
    [assets],
  );
  const existingMacs = useMemo(
    () =>
      new Set(
        assets.map((a) => (a.macAddress || "").toLowerCase()).filter((v) => v),
      ),
    [assets],
  );

  const vendorByCode = useMemo(() => {
    const map = new Map<
      string,
      { id: string; vendorName: string; isBlocked?: boolean }
    >();
    vendors.forEach((v) => map.set(String(v.id).toLowerCase(), v));
    return map;
  }, [vendors]);

  const vendorNameIndex = useMemo(() => {
    const map = new Map<
      string,
      Array<{ id: string; vendorName: string; isBlocked?: boolean }>
    >();
    vendors.forEach((v) => {
      const key = String(v.vendorName || "")
        .trim()
        .toLowerCase();
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    });
    return map;
  }, [vendors]);

  const downloadTemplate = () => {
    const assetsSheet = [ASSET_IMPORT_HEADERS, ...ASSET_IMPORT_SAMPLE_ROWS];
    const activeVendors = (vendors || []).filter((v) => !v.isBlocked);
    const vendorsSorted = [...activeVendors].sort((a, b) => {
      const nameA = String(a.vendorName || "").toLowerCase();
      const nameB = String(b.vendorName || "").toLowerCase();
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      return String(a.id ?? "").localeCompare(String(b.id ?? ""));
    });
    const vendorsSheet = [
      ["Vendor Code", "Vendor Name"],
      ...vendorsSorted.map((v) => [
        String(v.id ?? ""),
        String(v.vendorName || ""),
      ]),
    ];

    downloadXlsx(
      [
        { name: "Assets", rows: assetsSheet },
        { name: "Vendors", rows: vendorsSheet },
      ],
      "assets_bulk_template.xlsx",
    );
  };

  const normalizeOptional = (value: string | undefined) => {
    const trimmed = String(value || "").trim();
    return trimmed ? trimmed : null;
  };

  const normalizeCategory = (value: string) => {
    const trimmed = value.trim();
    const lower = trimmed.toLowerCase();
    if (lower === "software") return "Software";
    if (lower === "hardware") return "Hardware";
    if (lower === "networking") return "Networking";
    return trimmed;
  };

  const parseOptionalNumber = (value: string | undefined) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return null;
    const num = Number(trimmed.replace(/,/g, ""));
    return Number.isFinite(num) ? num : NaN;
  };

  const parseOptionalInt = (value: string | undefined) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return null;
    const num = Number.parseInt(trimmed, 10);
    return Number.isFinite(num) ? num : NaN;
  };

  const parseOptionalDate = (value: string | undefined) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return { value: null };
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return { error: true };
    return { value: parsed.toISOString() };
  };

  const statusValues = useMemo(
    () => ASSET_STATUS_ARRAY.map((s) => s.value),
    [],
  );
  const conditionValues = useMemo(
    () => new Set(Object.values(ASSET_CONDITIONS) as string[]),
    [],
  );

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setHeaderError(null);
    const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      const parsed =
        isXlsx && result instanceof ArrayBuffer
          ? parseAssetXlsx(result)
          : parseAssetCsv(String(result || ""));
      const headerKeys = new Set(parsed.headers.filter(Boolean));
      const missing = ASSET_IMPORT_REQUIRED.filter(
        (field) => !headerKeys.has(field),
      );

      if (missing.length > 0) {
        setRows([]);
        setHeaderError(
          `Missing required columns: ${missing
            .map((f) => ASSET_IMPORT_LABELS[f] || f)
            .join(", ")}`,
        );
        return;
      }

      const seenCodes = new Set<string>();
      const seenSerials = new Set<string>();
      const seenMacs = new Set<string>();

      const validated: BulkAssetRow[] = parsed.rows.map((r) => {
        const errors: string[] = [];
        const assetCode = String(r.assetCode || "").trim();
        const assetName = String(r.assetName || "").trim();
        const category = normalizeCategory(String(r.category || "").trim());
        const assetType = String(r.assetType || "").trim();
        const totalQuantityRaw = String(r.totalQuantity || "").trim();
        const totalQuantity = Number.parseInt(totalQuantityRaw, 10);
        const vendorCode = normalizeOptional(r.vendorCode);
        const vendorName = normalizeOptional(r.vendorName);
        const invoiceNumber = normalizeOptional(r.invoiceNumber);
        const invoiceDateResult = parseOptionalDate(r.invoiceDate);
        const purchasePrice = parseOptionalNumber(r.purchasePrice);
        const purchaseNumber = normalizeOptional(r.purchaseNumber);
        const prNumber = normalizeOptional(r.prNumber);
        const importBillUrl = normalizeOptional(r.importBillUrl);
        const serialNumber = normalizeOptional(r.serialNumber);
        const model = normalizeOptional(r.model);
        const ram = normalizeOptional(r.ram);
        const storage = normalizeOptional(r.storage);
        const processor = normalizeOptional(r.processor);
        const macAddress = normalizeOptional(r.macAddress);
        const portCount = parseOptionalInt(r.portCount);
        const portSpeed = normalizeOptional(r.portSpeed);
        const licenseType = normalizeOptional(r.licenseType);
        const licenseExpiryResult = parseOptionalDate(r.licenseExpiryDate);
        const statusRaw = normalizeOptional(r.status);
        const statusValue = statusRaw
          ? statusValues.find(
            (value) => value.toLowerCase() === statusRaw.toLowerCase(),
          ) || null
          : null;
        const conditionRaw = normalizeOptional(r.condition);
        const conditionValue = conditionRaw ? conditionRaw.toUpperCase() : null;

        if (!assetCode) {
          errors.push("Asset Code required");
        } else if (!/^[a-zA-Z0-9\-_]+$/.test(assetCode)) {
          errors.push("Asset Code format invalid");
        } else {
          const codeKey = assetCode.toLowerCase();
          if (seenCodes.has(codeKey))
            errors.push("Duplicate Asset Code in file");
          if (existingCodes.has(codeKey))
            errors.push("Asset Code already exists in system");
          seenCodes.add(codeKey);
        }

        if (!assetName) errors.push("Asset Name required");
        if (!category) {
          errors.push("Category required");
        } else if (
          userRole === "Manager" &&
          managedCategories &&
          managedCategories.length > 0
        ) {
          const normalizedManagedCategories = managedCategories.map((cat) =>
            cat.trim().toLowerCase(),
          );
          if (!normalizedManagedCategories.includes("all")) {
            const assetCategory = category.trim().toLowerCase();
            if (!normalizedManagedCategories.includes(assetCategory)) {
              errors.push("Category not authorized for your role");
            }
          }
        }
        if (!assetType) errors.push("Asset Type required");
        if (!vendorCode) errors.push("Vendor Code required");

        if (!Number.isInteger(totalQuantity) || totalQuantity < 1) {
          errors.push("Total Quantity must be at least 1");
        }

        if (serialNumber) {
          const serialKey = serialNumber.toLowerCase();
          if (seenSerials.has(serialKey))
            errors.push("Duplicate Serial Number in file");
          if (existingSerials.has(serialKey))
            errors.push("Serial Number already exists in system");
          seenSerials.add(serialKey);
        }

        if (macAddress) {
          const macKey = macAddress.toLowerCase();
          if (seenMacs.has(macKey))
            errors.push("Duplicate MAC Address in file");
          if (existingMacs.has(macKey))
            errors.push("MAC Address already exists in system");
          seenMacs.add(macKey);
        }

        if (totalQuantity > 1 && (serialNumber || macAddress)) {
          errors.push("Serial/MAC must be empty when Total Quantity > 1");
        }

        const isSoftware = category.trim().toLowerCase() === "software";
        if (isSoftware && !licenseType) {
          errors.push("License Type required for Software");
        }

        if (invoiceDateResult.error) errors.push("Invalid Invoice Date");
        if (licenseExpiryResult.error)
          errors.push("Invalid License Expiry Date");

        if (purchasePrice !== null && Number.isNaN(purchasePrice)) {
          errors.push("Purchase Price must be numeric");
        }

        if (portCount !== null && Number.isNaN(portCount)) {
          errors.push("Port Count must be numeric");
        }

        if (statusRaw && !statusValue) errors.push("Status is invalid");

        if (
          conditionRaw &&
          (!conditionValue || !conditionValues.has(conditionValue))
        ) {
          errors.push("Condition is invalid");
        }

        if (vendorCode) {
          const codeMatch = vendorByCode.get(vendorCode.toLowerCase());
          if (!codeMatch) {
            errors.push("Vendor Code not found");
          } else if (codeMatch.isBlocked) {
            errors.push("Vendor is blocked and cannot be used");
          }
        }

        if (vendorName && !vendorCode) {
          const matches = vendorNameIndex.get(vendorName.toLowerCase()) || [];
          if (matches.length === 0) errors.push("Vendor Name not found");
          else if (matches.length > 1) errors.push("Vendor Name is ambiguous");
          else if (matches[0].isBlocked) {
            errors.push("Vendor is blocked and cannot be used");
          }
        }

        if (vendorCode && vendorName) {
          const codeMatch = vendorByCode.get(vendorCode.toLowerCase());
          const matches = vendorNameIndex.get(vendorName.toLowerCase()) || [];
          if (!codeMatch) {
            errors.push("Vendor Code not found");
          } else if (codeMatch.isBlocked) {
            errors.push("Vendor is blocked and cannot be used");
          } else if (matches.length === 0) {
            errors.push("Vendor Name not found");
          } else if (matches.length > 1) {
            errors.push("Vendor Name is ambiguous");
          } else if (codeMatch.id !== matches[0].id) {
            errors.push("Vendor Code and Vendor Name mismatch");
          }
        }

        return {
          assetCode,
          assetName,
          category,
          assetType,
          totalQuantity: Number.isInteger(totalQuantity) ? totalQuantity : null,
          vendorCode,
          vendorName,
          invoiceNumber,
          invoiceDate: invoiceDateResult.value,
          purchasePrice:
            purchasePrice !== null && !Number.isNaN(purchasePrice)
              ? purchasePrice
              : null,
          purchaseNumber,
          prNumber,
          importBillUrl,
          serialNumber,
          model,
          ram,
          storage,
          processor,
          macAddress,
          portCount:
            portCount !== null && !Number.isNaN(portCount) ? portCount : null,
          portSpeed,
          licenseType,
          licenseExpiryDate: licenseExpiryResult.value,
          status: statusValue || ASSET_STATUS.AVAILABLE,
          condition: conditionValue || DEFAULT_CONDITION,
          _error: errors.join("; ") || undefined,
        };
      });

      setRows(validated);
    };
    if (isXlsx) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const validRows = rows.filter((r) => !r._error);
  const errorRows = rows.filter((r) => !!r._error);

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const payload = validRows.map(({ _error, ...row }) => ({
        ...row,
        totalQuantity: row.totalQuantity || 1,
        vendorCode: row.vendorCode || undefined,
        vendorName: row.vendorName || undefined,
        invoiceNumber: row.invoiceNumber || undefined,
        invoiceDate: row.invoiceDate || undefined,
        purchasePrice: row.purchasePrice ?? undefined,
        purchaseNumber: row.purchaseNumber || undefined,
        prNumber: row.prNumber || undefined,
        importBillUrl: row.importBillUrl || undefined,
        serialNumber: row.serialNumber || undefined,
        model: row.model || undefined,
        ram: row.ram || undefined,
        storage: row.storage || undefined,
        processor: row.processor || undefined,
        macAddress: row.macAddress || undefined,
        portCount: row.portCount ?? undefined,
        portSpeed: row.portSpeed || undefined,
        licenseType: row.licenseType || undefined,
        licenseExpiryDate: row.licenseExpiryDate || undefined,
        status: row.status || undefined,
        condition: row.condition || undefined,
      }));
      const res = await dataService.bulkCreateAssets(payload);
      setResult(res);
      toast.success(
        `Successfully imported ${res.created} asset(s) and ${res.unitsCreated} unit(s).`,
      );
      onDone();
      onClose();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Bulk import failed");
    } finally {
      setImporting(false);
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
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95dvh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Bulk Import Assets
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Upload a CSV or XLSX file to create multiple assets at once
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-900 mb-3">
                  Step 1 — Download the template
                </p>

                {/* Base mandatory fields */}
                <div className="mb-3">
                  <p className="text-xs font-semibold text-blue-800 mb-1.5">
                    Required columns (all assets):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <code className="bg-blue-100 px-2 py-1 rounded text-xs font-medium">
                      Asset Code
                    </code>
                    <code className="bg-blue-100 px-2 py-1 rounded text-xs font-medium">
                      Asset Name
                    </code>
                    <code className="bg-blue-100 px-2 py-1 rounded text-xs font-medium">
                      Category
                    </code>
                    <code className="bg-blue-100 px-2 py-1 rounded text-xs font-medium">
                      Asset Type
                    </code>
                    <code className="bg-blue-100 px-2 py-1 rounded text-xs font-medium">
                      Total Quantity
                    </code>
                    <code className="bg-blue-100 px-2 py-1 rounded text-xs font-medium">
                      Vendor Code
                    </code>
                  </div>
                </div>

                {/* Category-specific mandatory fields */}
                <div className="mb-3">
                  <p className="text-xs font-semibold text-blue-800 mb-1.5">
                    Category-specific required columns:
                  </p>
                  <div className="space-y-1.5 text-xs text-blue-700">
                    <div>
                      <span className="font-medium text-blue-900">
                        Software:
                      </span>
                      <code className="bg-blue-100 px-2 py-0.5 rounded ml-1">
                        License Type
                      </code>
                      <span className="text-[11px] text-blue-700 ml-1.5">
                        (Supported: <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[10px]">PERPETUAL</code>, <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[10px]">SUBSCRIPTION</code>, <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[10px]">SAAS</code>, <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[10px]">VOLUME</code>, <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[10px]">ENTERPRISE</code>, <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[10px]">TRIAL</code>)
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-blue-900">
                        Hardware:
                      </span>{" "}
                      No additional required
                    </div>
                    <div>
                      <span className="font-medium text-blue-900">
                        Networking:
                      </span>{" "}
                      No additional required
                    </div>
                  </div>
                </div>

                {/* Optional metadata note */}
                <div className="mb-3 p-2 rounded bg-blue-100/50 border border-blue-200">
                  <p className="text-xs text-blue-800 mt-1">
                    <span className="font-medium">Note:</span> The Vendors sheet
                    lists valid Vendor Code and Vendor Name values for
                    reference.
                  </p>
                  <p className="text-xs text-blue-800 mt-1">
                    <span className="font-medium">Import:</span> Only the first
                    sheet is processed on upload.
                  </p>
                </div>

                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 transition-all">
                  <Download className="w-4 h-4" />
                  Download assets_bulk_template.xlsx
                </button>
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">
              Step 2 — Upload your CSV or XLSX
            </p>
            <label
              htmlFor="bulk-assets-csv"
              className={`flex flex-col items-center justify-center w-full border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all ${fileName
                ? "border-blue-400 bg-blue-50/40"
                : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/20"
                }`}>
              <Upload
                className={`w-8 h-8 mb-2 ${fileName ? "text-blue-500" : "text-gray-400"}`}
              />
              <p className="text-sm font-medium text-gray-700">
                {fileName || "Click to upload CSV or XLSX file"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Max 200 assets per import
              </p>
              <input
                id="bulk-assets-csv"
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={handleFile}
              />
            </label>
          </div>

          {headerError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {headerError}
            </div>
          )}

          {rows.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-700">
                  Preview — {rows.length} row{rows.length !== 1 ? "s" : ""}
                  {errorRows.length > 0 && (
                    <span className="ml-2 text-red-600 font-normal">
                      ({errorRows.length} invalid)
                    </span>
                  )}
                </p>
                <span className="text-xs text-green-700 font-medium">
                  {validRows.length} ready to import
                </span>
              </div>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto max-h-56">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {[
                          "Asset Code",
                          "Asset Name",
                          "Category",
                          "Type",
                          "Qty",
                          "Status",
                        ].map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((r, i) => (
                        <tr
                          key={i}
                          className={
                            r._error ? "bg-red-50" : "hover:bg-gray-50"
                          }>
                          <td className="px-3 py-2 font-mono text-gray-800">
                            {r.assetCode || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-800">
                            {r.assetName || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {r.category || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {r.assetType || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {r.totalQuantity ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            {r._error ? (
                              <span
                                className="flex items-center gap-1 text-red-600"
                                title={r._error}>
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate max-w-32">
                                  {r._error}
                                </span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-green-600">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {result && (
            <div
              className={`rounded-lg p-4 border ${result.skipped > 0
                ? "bg-yellow-50 border-yellow-200"
                : "bg-green-50 border-green-200"
                }`}>
              <p className="text-sm font-semibold text-gray-800 mb-1">
                Import complete:{" "}
                <span className="text-green-700">
                  {result.created} row(s) created
                </span>
                {result.unitsCreated > 0 && (
                  <span className="text-blue-700">
                    , {result.unitsCreated} units created
                  </span>
                )}
                {result.skipped > 0 && (
                  <span className="text-yellow-700">
                    , {result.skipped} skipped
                  </span>
                )}
              </p>
              {result.errors?.length > 0 && (
                <ul className="mt-2 text-xs text-yellow-800 list-disc list-inside space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.slice(0, 10).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {result.errors.length > 10 && (
                    <li>+{result.errors.length - 10} more</li>
                  )}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-all">
              Close
            </button>
            <button
              onClick={handleImport}
              disabled={importing || validRows.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2">
              {importing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Import Assets
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function AssetList({
  assets,
  licenseAllocations,
  users,
  onAddAsset,
  onEditAsset,
  onViewAsset,
  onDeleteAsset,
  onDisposeAsset,
  onBulkImportComplete,
  maintenanceRecords = [],
  hideBulkChildUnits = false,
  userRole = "Viewer" as UserRole,
  vendors = [],
  managedCategories = [],
}: AssetListProps) {
  const [showIndividualUnits, setShowIndividualUnits] = useState(!hideBulkChildUnits);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [assetTypeFilter, setAssetTypeFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [conditionFilter, setConditionFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    assetId: string | null;
    assetName: string;
  }>({
    isOpen: false,
    assetId: null,
    assetName: "",
  });
  const [disposeModal, setDisposeModal] = useState<{
    isOpen: boolean;
    assetId: string | null;
  }>({
    isOpen: false,
    assetId: null,
  });

  const selectedAssetForDispose = useMemo(() => {
    if (!disposeModal.assetId) return null;
    return (
      assets.find((a) => String(a.id) === String(disposeModal.assetId)) || null
    );
  }, [assets, disposeModal.assetId]);

  const childUnitsCountForDispose = useMemo(() => {
    if (!selectedAssetForDispose?.isBulkOrder) return 0;
    return assets.filter(
      (a) =>
        String(a.bulkOrderParentId) === String(selectedAssetForDispose.id) &&
        !a.isBulkOrder &&
        a.status !== ASSET_STATUS.DISPOSED,
    ).length;
  }, [assets, selectedAssetForDispose]);
  const isMobile = useIsMobile();
  const statusDropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const statusDropdownMenuRef = useRef<HTMLDivElement>(null);
  const categoryDropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const categoryDropdownMenuRef = useRef<HTMLDivElement>(null);

  const { openUpward: openStatusUpward, maxHeight: statusDropdownMaxHeight } =
    useSmartDropdownPosition({
      isOpen: activeDropdown === "status",
      anchorRef: statusDropdownTriggerRef,
      menuRef: statusDropdownMenuRef,
      preferredMaxHeight: 240,
    });

  const {
    openUpward: openCategoryUpward,
    maxHeight: categoryDropdownMaxHeight,
  } = useSmartDropdownPosition({
    isOpen: activeDropdown === "category",
    anchorRef: categoryDropdownTriggerRef,
    menuRef: categoryDropdownMenuRef,
    preferredMaxHeight: 240,
  });

  useEffect(() => {
    if (!showFilters) return;
    const handler = (e: MouseEvent) => {
      if (
        filterPanelRef.current &&
        !filterPanelRef.current.contains(e.target as Node)
      ) {
        setShowFilters(false);
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFilters]);

  // Role-aware unit visibility: viewers must see assigned child units.
  const shouldHideBulkChildUnits = !showIndividualUnits;

  // Total count of assets visible in the list (excludes hidden bulk child units)
  const totalListableAssets = useMemo(
    () =>
      assets.filter((a) => {
        if (!shouldHideBulkChildUnits) return true;
        return !(a.bulkOrderParentId && !a.isBulkOrder);
      }).length,
    [assets, shouldHideBulkChildUnits],
  );

  const childUnitsByParentId = useMemo(() => {
    const map = new Map<string, Asset[]>();

    for (const asset of assets) {
      if (asset.bulkOrderParentId && !asset.isBulkOrder) {
        const parentId = String(asset.bulkOrderParentId);
        const existing = map.get(parentId);
        if (existing) {
          existing.push(asset);
        } else {
          map.set(parentId, [asset]);
        }
      }
    }

    return map;
  }, [assets]);

  const activeAllocationsByAssetId = useMemo(() => {
    const map = new Map<string, LicenseAllocation[]>();

    for (const allocation of licenseAllocations) {
      if (allocation.status !== ALLOCATION_STATUS_DISPLAY.ACTIVE) continue;
      const key = String(allocation.assetId);
      const existing = map.get(key);
      if (existing) {
        existing.push(allocation);
      } else {
        map.set(key, [allocation]);
      }
    }

    return map;
  }, [licenseAllocations]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    assets.forEach((a) => {
      if (a.category) cats.add(a.category);
    });
    return Array.from(cats).sort();
  }, [assets]);

  const assetTypes = useMemo(() => {
    const types = new Set<string>();
    assets.forEach((a) => {
      if (a.assetType) types.add(a.assetType);
    });
    return Array.from(types).sort();
  }, [assets]);

  const activeAllocationsByParentAssetId = useMemo(() => {
    const map = new Map<string, LicenseAllocation[]>();

    for (const allocation of licenseAllocations) {
      if (allocation.status !== ALLOCATION_STATUS_DISPLAY.ACTIVE) continue;
      if (!allocation.parentAssetId) continue;

      const key = String(allocation.parentAssetId);
      const existing = map.get(key);
      if (existing) {
        existing.push(allocation);
      } else {
        map.set(key, [allocation]);
      }
    }

    return map;
  }, [licenseAllocations]);

  const filteredAssets = useMemo(() => {
    const searchLower = debouncedSearch.trim().toLowerCase();
    const hasSearch = searchLower.length > 0;

    return assets
      .filter((asset) => {
        // CRITICAL: Hide individual units from bulk orders - they're managed inside the parent asset detail
        if (
          shouldHideBulkChildUnits &&
          asset.bulkOrderParentId &&
          !asset.isBulkOrder
        ) {
          return false;
        }

        // Filter by managedCategories for Manager role: only show assets in managed categories
        if (
          userRole === "Manager" &&
          managedCategories &&
          managedCategories.length > 0
        ) {
          const normalizedManagedCategories = managedCategories.map((cat) =>
            cat.trim().toLowerCase(),
          );
          const assetCategory = String(asset.category || "")
            .trim()
            .toLowerCase();
          if (!normalizedManagedCategories.includes(assetCategory)) {
            return false;
          }
        }

        const assetId = String(asset.id);
        const childUnits = asset.isBulkOrder
          ? childUnitsByParentId.get(assetId) || []
          : [];

        let matchesSearch = true;
        if (hasSearch) {
          const assetLicenseAllocations =
            activeAllocationsByAssetId.get(assetId) || [];
          const matchesLicenseAllocation = assetLicenseAllocations.some(
            (la) =>
              (la.userName || "").toLowerCase().includes(searchLower) ||
              (la.employeeId || "").toLowerCase().includes(searchLower) ||
              (la.parentAssetName || "").toLowerCase().includes(searchLower) ||
              String(la.parentAssetId || "")
                .toLowerCase()
                .includes(searchLower) ||
              (la.installationLocation || "")
                .toLowerCase()
                .includes(searchLower) ||
              (la.department || "").toLowerCase().includes(searchLower),
          );

          const childAssets =
            activeAllocationsByParentAssetId.get(assetId) || [];
          const matchesChildAssets = childAssets.some(
            (la) =>
              (la.assetName || "").toLowerCase().includes(searchLower) ||
              (la.assetCode || "").toLowerCase().includes(searchLower),
          );

          // For bulk parents, also match if any child unit's code/name or allocation matches the search
          const matchesChildDetails =
            childUnits.length > 0 &&
            childUnits.some(
              (child) =>
                (child.assetCode || "").toLowerCase().includes(searchLower) ||
                (child.assetName || "").toLowerCase().includes(searchLower) ||
                (child.installationLocation || "")
                  .toLowerCase()
                  .includes(searchLower),
            );

          const matchesChildAllocation =
            childUnits.length > 0 &&
            childUnits.some((child) => {
              const childAllocations =
                activeAllocationsByAssetId.get(String(child.id)) || [];
              return childAllocations.some(
                (la) =>
                  (la.userName || "").toLowerCase().includes(searchLower) ||
                  (la.employeeId || "").toLowerCase().includes(searchLower) ||
                  (la.installationLocation || "")
                    .toLowerCase()
                    .includes(searchLower) ||
                  (la.department || "").toLowerCase().includes(searchLower),
              );
            });

          matchesSearch =
            asset.assetCode?.toLowerCase().includes(searchLower) ||
            asset.assetName?.toLowerCase().includes(searchLower) ||
            asset.category?.toLowerCase().includes(searchLower) ||
            asset.assetType?.toLowerCase().includes(searchLower) ||
            asset.installationLocation?.toLowerCase().includes(searchLower) ||
            asset.vendorName?.toLowerCase().includes(searchLower) ||
            asset.vendorId?.toLowerCase().includes(searchLower) ||
            asset.invoiceNumber?.toLowerCase().includes(searchLower) ||
            asset.status?.toLowerCase().includes(searchLower) ||
            asset.ram?.toLowerCase().includes(searchLower) ||
            asset.storage?.toLowerCase().includes(searchLower) ||
            asset.portCount?.toString()?.toLowerCase().includes(searchLower) ||
            asset.licenseExpiryDate?.toLowerCase().includes(searchLower) ||
            asset.totalQuantity
              ?.toString()
              ?.toLowerCase()
              .includes(searchLower) ||
            matchesLicenseAllocation ||
            matchesChildAssets ||
            matchesChildDetails ||
            matchesChildAllocation;
        }

        // For bulk parents, also match if ANY child unit has the filtered status
        const matchesStatus =
          statusFilter === "all" ||
          asset.status === statusFilter ||
          childUnits.some((c) => c.status === statusFilter);

        const normalizedCategory = String(asset.category || "")
          .trim()
          .toLowerCase();
        const normalizedCategoryFilter = categoryFilter.trim().toLowerCase();
        const matchesCategory =
          normalizedCategoryFilter === "all" ||
          normalizedCategory === normalizedCategoryFilter;

        const normalizedAssetType = String(asset.assetType || "")
          .trim()
          .toLowerCase();
        const normalizedAssetTypeFilter = assetTypeFilter.trim().toLowerCase();
        const matchesAssetType =
          normalizedAssetTypeFilter === "all" ||
          normalizedAssetType === normalizedAssetTypeFilter;

        const normalizedVendorId = String(asset.vendorId || "").trim();
        const normalizedVendorFilter = vendorFilter.trim();
        const matchesVendor =
          normalizedVendorFilter === "all" ||
          normalizedVendorId === normalizedVendorFilter;

        const normalizedCondition = String(asset.condition || "").trim();
        const normalizedConditionFilter = conditionFilter.trim();
        const matchesCondition =
          normalizedConditionFilter === "all" ||
          normalizedCondition === normalizedConditionFilter;

        return (
          matchesSearch &&
          matchesStatus &&
          matchesCategory &&
          matchesAssetType &&
          matchesVendor &&
          matchesCondition
        );
      })
      .sort((a, b) => {
        // For viewers, always show assets they currently hold (Allocated/Partially Allocated/Under Maintenance) at the top
        if (userRole === "Viewer") {
          const isAActive =
            a.status === ASSET_STATUS.ALLOCATED ||
            a.status === ASSET_STATUS.PARTIALLY_ALLOCATED ||
            a.status === ASSET_STATUS.UNDER_MAINTENANCE;
          const isBActive =
            b.status === ASSET_STATUS.ALLOCATED ||
            b.status === ASSET_STATUS.PARTIALLY_ALLOCATED ||
            b.status === ASSET_STATUS.UNDER_MAINTENANCE;

          if (isAActive && !isBActive) return -1;
          if (!isAActive && isBActive) return 1;
        }

        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
  }, [
    assets,
    childUnitsByParentId,
    activeAllocationsByAssetId,
    activeAllocationsByParentAssetId,
    debouncedSearch,
    statusFilter,
    categoryFilter,
    assetTypeFilter,
    vendorFilter,
    conditionFilter,
    shouldHideBulkChildUnits,
    userRole,
    managedCategories,
  ]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== "all") count++;
    if (categoryFilter !== "all") count++;
    if (assetTypeFilter !== "all") count++;
    if (vendorFilter !== "all") count++;
    if (conditionFilter !== "all") count++;
    return count;
  }, [
    statusFilter,
    categoryFilter,
    assetTypeFilter,
    vendorFilter,
    conditionFilter,
  ]);

  const hasActiveFilters = activeFilterCount > 0;

  const clearFilters = useCallback(() => {
    setStatusFilter("all");
    setCategoryFilter("all");
    setAssetTypeFilter("all");
    setVendorFilter("all");
    setConditionFilter("all");
    setCurrentPage(1);
  }, []);

  const handleFilterChange = (setter: (v: string) => void) => (val: string) => {
    setter(val);
    setCurrentPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(filteredAssets.length / RECORDS_PER_PAGE);

  const paginatedAssets = useMemo(() => {
    const start = (currentPage - 1) * RECORDS_PER_PAGE;
    return filteredAssets.slice(start, start + RECORDS_PER_PAGE);
  }, [filteredAssets, currentPage]);

  const exportToCSV = useCallback(() => {
    generateAssetsExport(
      filteredAssets,
      assets,
      licenseAllocations,
      users,
      userRole,
      shouldHideBulkChildUnits,
      maintenanceRecords || [],
    );
  }, [
    filteredAssets,
    assets,
    licenseAllocations,
    users,
    userRole,
    shouldHideBulkChildUnits,
    maintenanceRecords,
  ]);

  const exportAllocationsToCSV = useCallback(() => {
    generateAllocationsExport(
      filteredAssets,
      assets,
      licenseAllocations,
    );
  }, [filteredAssets, assets, licenseAllocations]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Asset Management
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Manage and track all organizational assets
          </p>
        </div>
        {canRoleCreate(userRole) && (
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button
              onClick={onAddAsset}
              className="bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-sm w-full sm:w-auto">
              <Plus className="w-5 h-5" />
              <span className="font-medium">Add Asset</span>
            </button>
            <button
              onClick={() => setShowBulkImport(true)}
              className="bg-white text-blue-700 px-4 py-2.5 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 shadow-sm border border-blue-200 w-full sm:w-auto">
              <Upload className="w-5 h-5" />
              <span className="font-medium">Bulk Import</span>
            </button>
          </div>
        )}
      </div>

      <div
        ref={filterPanelRef}
        className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
        <div className="flex flex-row items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search assets..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-10 h-9 sm:h-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm text-sm"
            />
            {searchTerm && (
              <button
                onClick={() => handleSearchChange("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
                title="Clear search">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center justify-center gap-2 px-2.5 sm:px-4 h-9 sm:h-10 border border-gray-300 rounded-lg bg-white cursor-pointer hover:border-gray-400 hover:shadow-sm transition-all shadow-sm font-semibold text-gray-700 text-sm whitespace-nowrap ${showFilters ? "border-gray-300" : ""
              }`}
            title="Filters">
            <Filter className="w-4 h-4 text-gray-500 sm:hidden" />
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && (
              <span className="min-w-5 h-5 flex items-center justify-center bg-blue-600 text-white text-[10px] font-bold rounded-full">
                {activeFilterCount}
              </span>
            )}
            <motion.div
              animate={{ rotate: showFilters ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="hidden sm:block">
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </motion.div>
          </button>

          <button
            type="button"
            onClick={() => setShowIndividualUnits((prev) => !prev)}
            className={`flex items-center justify-center gap-1.5 px-3 h-9 sm:h-10 border rounded-lg transition-all shadow-sm font-medium text-xs sm:text-sm whitespace-nowrap ${
              showIndividualUnits
                ? "bg-blue-50 border-blue-300 text-blue-700 font-semibold"
                : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
            title="Toggle whether individual asset units or grouped parents are shown in table">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: showIndividualUnits ? "#2563eb" : "#9ca3af" }} />
            <span>{showIndividualUnits ? "Showing All Units" : "Grouped Parents"}</span>
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-all border border-transparent whitespace-nowrap">
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>

        {/* ── Expanded Filters ── */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-visible pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                <FilterDropdown
                  id="status"
                  label="Status"
                  value={statusFilter}
                  activeDropdown={activeDropdown}
                  setActiveDropdown={setActiveDropdown}
                  onChange={handleFilterChange(setStatusFilter)}
                  dot
                  options={getStatusOptions(userRole).map((opt) => ({
                    ...opt,
                    dot: STATUS_DOT_HL[opt.value]?.dot || "bg-gray-400",
                  }))}
                />
                <FilterDropdown
                  id="category"
                  label="Category"
                  value={categoryFilter}
                  activeDropdown={activeDropdown}
                  setActiveDropdown={setActiveDropdown}
                  onChange={handleFilterChange(setCategoryFilter)}
                  options={[
                    { value: "all", label: "All Categories" },
                    ...categories.map((c) => ({ value: c, label: c })),
                  ]}
                />
                <FilterDropdown
                  id="assetType"
                  label="Asset Type"
                  value={assetTypeFilter}
                  activeDropdown={activeDropdown}
                  setActiveDropdown={setActiveDropdown}
                  onChange={handleFilterChange(setAssetTypeFilter)}
                  options={[
                    { value: "all", label: "All Types" },
                    ...assetTypes.map((t) => ({ value: t, label: t })),
                  ]}
                />
                <FilterDropdown
                  id="vendor"
                  label="Vendor"
                  value={vendorFilter}
                  activeDropdown={activeDropdown}
                  setActiveDropdown={setActiveDropdown}
                  onChange={handleFilterChange(setVendorFilter)}
                  options={[
                    { value: "all", label: "All Vendors" },
                    ...vendors.map((v) => ({
                      value: String(v.id),
                      label: v.vendorName,
                    })),
                  ]}
                />
                <FilterDropdown
                  id="condition"
                  label="Condition"
                  value={conditionFilter}
                  activeDropdown={activeDropdown}
                  setActiveDropdown={setActiveDropdown}
                  onChange={handleFilterChange(setConditionFilter)}
                  dot
                  options={[
                    {
                      value: "all",
                      label: "All Conditions",
                      dot: CONDITION_DOT.all,
                    },
                    ...["EXCELLENT", "GOOD", "FAIR", "POOR"].map((c) => ({
                      value: c,
                      label: c.charAt(0) + c.slice(1).toLowerCase(),
                      dot: CONDITION_DOT[c],
                    })),
                  ]}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Desktop Table View */}
        {!isMobile && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="ui-table-head-compact">Asset Code</th>
                  <th className="ui-table-head-compact">Asset Name</th>
                  <th className="ui-table-head-compact">Category</th>
                  <th className="ui-table-head-compact">Status</th>
                  <th className="ui-table-head-compact">Assigned</th>
                  {userRole !== "Viewer" && (
                    <th className="ui-table-head-compact">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedAssets.map((asset) => (
                  <DesktopAssetRow
                    key={asset.id}
                    asset={asset}
                    onView={onViewAsset}
                    onEdit={onEditAsset}
                    onDelete={(asset) =>
                      setDeleteModal({
                        isOpen: true,
                        assetId: asset.id,
                        assetName: asset.assetName,
                      })
                    }
                    onDispose={(asset) =>
                      setDisposeModal({
                        isOpen: true,
                        assetId: asset.id,
                      })
                    }
                    userRole={userRole}
                    allAssets={assets}
                    allMaintenanceRecords={maintenanceRecords}
                    allLicenseAllocations={licenseAllocations}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile Card View */}
        {isMobile && (
          <div className="divide-y divide-gray-200">
            {paginatedAssets.map((asset) => {
              const isBulkParent = asset.isBulkOrder;
              const isIndividualUnit =
                asset.bulkOrderParentId && !asset.isBulkOrder;
              // For bulk parents, calculate counts matching desktop view logic
              const bulkUnits = isBulkParent
                ? (() => {
                  const units = assets.filter(
                    (a) =>
                      String(a.bulkOrderParentId) === String(asset.id) &&
                      !a.isBulkOrder,
                  );
                  const nonDisposedUnits = units.filter(
                    (u) => u.status !== ASSET_STATUS.DISPOSED,
                  );
                  const total =
                    nonDisposedUnits.length || asset.totalQuantity || 0;
                  return { total, allUnitsCount: units.length };
                })()
                : null;

              const bulkTotal =
                isBulkParent && bulkUnits
                  ? asset.status === ASSET_STATUS.DISPOSED
                    ? bulkUnits.allUnitsCount
                    : bulkUnits.total
                  : 0;
              const bulkAllocated = isBulkParent
                ? asset.allocatedQuantity || 0
                : 0;

              return (
                <div
                  key={asset.id}
                  className="p-4 hover:bg-gray-50 transition-colors"
                  onClick={() => onViewAsset(asset)}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {asset.assetName}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm text-gray-600">
                          {asset.assetCode}
                        </p>

                        {/* Bulk Parent Badge */}
                        {isBulkParent && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            {bulkTotal} Bulk
                          </span>
                        )}

                        {/* Individual Unit Badge */}
                        {isIndividualUnit && asset.unitNumber && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-700 border border-gray-300">
                            #{String(asset.unitNumber).padStart(2, "0")}
                          </span>
                        )}
                      </div>
                      {asset.model && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {asset.model}
                        </p>
                      )}
                    </div>
                    <div className="relative ml-2 shrink-0">
                      {userRole !== "Viewer" && (
                        <ActionMenu
                          asset={asset}
                          onView={onViewAsset}
                          onEdit={onEditAsset}
                          onDelete={(asset) =>
                            setDeleteModal({
                              isOpen: true,
                              assetId: asset.id,
                              assetName: asset.assetName,
                            })
                          }
                          onDispose={(asset) =>
                            setDisposeModal({
                              isOpen: true,
                              assetId: asset.id,
                            })
                          }
                          stopPropagation={true}
                          triggerClassName="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                          userRole={userRole}
                          allAssets={assets}
                          allMaintenanceRecords={maintenanceRecords}
                          allLicenseAllocations={licenseAllocations}
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {asset.status === ASSET_STATUS.LICENSE_EXPIRED ? (
                      <span className="inline-flex items-center rounded-full border font-semibold leading-none px-1.5 py-0.5 text-[10px] mobile-micro bg-red-100 text-red-800 border-red-200">
                        License Expired
                      </span>
                    ) : (
                      <StatusBadge
                        status={asset.status}
                        size="xs"
                        userRole={userRole}
                      />
                    )}
                    <span className="text-xs text-gray-500">
                      {asset.category}
                    </span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-500">
                      {asset.assetType}
                    </span>
                  </div>

                  {asset.status === ASSET_STATUS.DISPOSED ? (
                    <div className="mt-2 text-sm text-red-600 font-medium">
                      Decommissioned
                    </div>
                  ) : isBulkParent ? (
                    <div className="mt-2 text-sm text-gray-600">
                      <span className="font-medium">
                        {bulkAllocated}/{bulkTotal}
                      </span>{" "}
                      units allocated
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-gray-600">
                      <span className="font-medium">
                        {getAllocatedQuantity(asset)}/{getTotalQuantity(asset)}
                      </span>{" "}
                      {getQuantityLabel(asset.category).toLowerCase()} allocated
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {filteredAssets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Search className="w-6 h-6 text-gray-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">
              {debouncedSearch ||
                statusFilter !== "all" ||
                categoryFilter !== "all"
                ? "No matching assets found"
                : "No assets yet"}
            </h3>
            <p className="text-sm text-gray-500 max-w-xs">
              {debouncedSearch ||
                statusFilter !== "all" ||
                categoryFilter !== "all"
                ? "Try adjusting your search or filters to find what you're looking for."
                : "Get started by adding your first asset using the button above."}
            </p>
            {(debouncedSearch || hasActiveFilters) && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  clearFilters();
                }}
                className="mt-4 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                Clear filters
              </button>
            )}
          </div>
        )}

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredAssets.length}
          itemsPerPage={RECORDS_PER_PAGE}
          onPageChange={setCurrentPage}
          className="px-6 py-4 border-t border-gray-200 bg-gray-50/50"
        />
      </div>

      <div className="flex flex-row justify-end py-4 px-2 gap-3">
        {userRole === "Viewer" && (
          <button
            onClick={exportAllocationsToCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all shadow-sm">
            <Download className="w-4 h-4" />
            <span>Export Allocations</span>
          </button>
        )}
        <button
          onClick={exportToCSV}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all shadow-sm">
          <Download className="w-4 h-4" />
          <span>Export Assets</span>
        </button>
      </div>

      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ ...deleteModal, isOpen: false })}
        onConfirm={(reason: string, condition?: string) => {
          if (deleteModal.assetId) {
            onDeleteAsset(deleteModal.assetId, reason, condition);
            setDeleteModal({
              isOpen: false,
              assetId: null,
              assetName: "",
            });
          }
        }}
        title="Delete Asset"
        message={
          HIDE_DELETE_UI
            ? `Are you sure you want to permanently delete "${deleteModal.assetName}"? This is only allowed for assets with no prior history and cannot be undone.`
            : `Are you sure you want to permanently delete "${deleteModal.assetName}"? This action cannot be undone.`
        }
        confirmText="Confirm Deletion"
        requireReason={true}
        showCondition={true}
      />

      <DisposalModal
        isOpen={disposeModal.isOpen}
        onClose={() => setDisposeModal({ ...disposeModal, isOpen: false })}
        onConfirm={(reason: string, condition?: string) => {
          if (disposeModal.assetId) {
            onDisposeAsset?.(disposeModal.assetId, reason, condition);
            setDisposeModal({
              isOpen: false,
              assetId: null,
            });
          }
        }}
        asset={selectedAssetForDispose}
        warnings={(() => {
          const items: string[] = [];
          if (!selectedAssetForDispose) return items;

          const targetAsset = selectedAssetForDispose as Asset;
          const childUnitsCountForDispose = targetAsset.isBulkOrder
            ? assets.filter(
              (a) => String(a.bulkOrderParentId) === String(targetAsset.id),
            ).length
            : 0;

          if (targetAsset.isBulkOrder) {
            items.push(
              `This is a Bulk Order Parent. Confirming disposal will permanently dispose of the whole asset record as well as all ${childUnitsCountForDispose} associated individual units. This action cannot be undone.`,
            );
          }

          // Check for active maintenance records
          const targetAssetIds = new Set<string>();
          targetAssetIds.add(String(targetAsset.id));
          if (targetAsset.isBulkOrder) {
            assets
              .filter(
                (a) => String(a.bulkOrderParentId) === String(targetAsset.id),
              )
              .forEach((u) => targetAssetIds.add(String(u.id)));
          }

          const activeMaintCount = (maintenanceRecords || []).filter(
            (m) =>
              targetAssetIds.has(String(m.assetId)) &&
              (m.status === MAINTENANCE_STATUS.SCHEDULED ||
                m.status === MAINTENANCE_STATUS.IN_PROGRESS),
          ).length;

          if (activeMaintCount > 0) {
            items.push(
              `This asset has ${activeMaintCount} active maintenance record(s) that will be automatically cancelled upon disposal.`,
            );
          }

          return items;
        })()}
      />

      {showBulkImport && (
        <BulkAssetImportModal
          assets={assets}
          vendors={vendors}
          userRole={userRole}
          managedCategories={managedCategories}
          onClose={() => setShowBulkImport(false)}
          onDone={() => {
            onBulkImportComplete?.();
          }}
        />
      )}
    </div>
  );
}

interface AssetListProps {
  assets: Asset[];
  licenseAllocations: LicenseAllocation[];
  maintenanceRecords?: MaintenanceRecord[];
  users: User[];
  onAddAsset: () => void;
  onEditAsset: (asset: Asset) => void;
  onViewAsset: (asset: Asset) => void;
  onDeleteAsset: (id: string, reason: string, condition?: string) => void;
  onDisposeAsset?: (id: string, reason: string, condition?: string) => void;
  onBulkImportComplete?: () => void;
  hideBulkChildUnits?: boolean;
  userRole?: UserRole;
  vendors?: any[];
  managedCategories?: string[];
}

const DesktopAssetRow = ({
  asset,
  onView,
  onEdit,
  onDelete,
  onDispose,
  userRole,
  allAssets,
  allMaintenanceRecords = [],
  allLicenseAllocations = [],
}: {
  asset: Asset & { _allUnits?: Asset[] };
  onView: (asset: Asset) => void;
  onEdit: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
  onDispose?: (asset: Asset) => void;
  userRole: UserRole;
  allAssets: Asset[];
  allMaintenanceRecords?: MaintenanceRecord[];
  allLicenseAllocations?: LicenseAllocation[];
}) => {
  const isBulkParent = asset.isBulkOrder;
  const isSoftware = isSoftwareLikeCategory(asset.category || "");

  // Calculate bulk order unit counts
  const bulkUnits = useMemo(() => {
    if (!isBulkParent) return { total: 0, allocated: 0, allUnitsCount: 0 };

    const units = allAssets.filter(
      (a) => String(a.bulkOrderParentId) === String(asset.id) && !a.isBulkOrder,
    );
    const nonDisposedUnits = units.filter(
      (u) => u.status !== ASSET_STATUS.DISPOSED,
    );
    const activeUnits = nonDisposedUnits.filter(
      (u) => u.status !== ASSET_STATUS.UNDER_MAINTENANCE,
    );

    const total = nonDisposedUnits.length || asset.totalQuantity || 0;
    const activeTotal = activeUnits.length || asset.totalQuantity || 0;

    // Use the parent's allocatedQuantity from computeAssetViewData — it correctly
    // aggregates active allocation records for parent + all children, avoiding
    // stale child-status checks that miss allocations made against the parent asset.
    const allocated = asset.allocatedQuantity || 0;

    return { total, activeTotal, allocated, allUnitsCount: units.length };
  }, [
    isBulkParent,
    asset.id,
    asset.allocatedQuantity,
    asset.totalQuantity,
    allAssets,
  ]);

  const allocation = getAllocationDisplay(asset);

  return (
    <tr
      className="hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-100 last:border-b-0"
      onClick={() => onView(asset)}>
      {/* Asset Code */}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">
            {asset.assetCode}
          </span>

          {/* Badge Logic: Show ONLY ONE badge based on priority */}
          {isBulkParent &&
            (bulkUnits.total > 0 || bulkUnits.allUnitsCount > 0) ? (
            // Bulk Order (software or hardware): Show unit count badge
            // For disposed parents, show total including disposed children
            <span className="inline-flex items-center justify-center min-w-6 h-5 px-1.5 rounded bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
              {asset.status === ASSET_STATUS.DISPOSED
                ? bulkUnits.allUnitsCount
                : bulkUnits.total}{" "}
              Bulk
            </span>
          ) : isSoftware && asset.totalQuantity && asset.totalQuantity > 1 ? (
            // Software (non-bulk): Show license count badge
            <span className="inline-flex items-center justify-center min-w-6 h-5 px-1.5 rounded bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
              {asset.totalQuantity} Bulk
            </span>
          ) : null}
        </div>
      </td>

      {/* Asset Name */}
      <td className="px-6 py-4">
        <div>
          <p className="text-sm font-medium text-gray-900">{asset.assetName}</p>
          {asset.model && (
            <p className="text-xs text-gray-500 mt-0.5">{asset.model}</p>
          )}
        </div>
      </td>

      {/* Category */}
      <td className="px-6 py-4">
        <div>
          <p className="text-sm font-medium text-gray-900">{asset.category}</p>
          <p className="text-xs text-gray-500 mt-0.5">{asset.assetType}</p>
        </div>
      </td>

      {/* Status */}
      <td className="px-6 py-4 whitespace-nowrap">
        {asset.status === ASSET_STATUS.LICENSE_EXPIRED ? (
          <span className="inline-flex items-center rounded-full border font-semibold leading-none px-2 py-0.5 text-xs bg-red-100 text-red-800 border-red-200">
            License Expired
          </span>
        ) : (
          <StatusBadge status={asset.status} userRole={userRole} />
        )}
      </td>

      {/* Assigned To */}
      <td className="px-6 py-4">
        {asset.status === ASSET_STATUS.DISPOSED ? (
          <span className="text-sm font-medium text-red-600">
            Decommissioned
          </span>
        ) : isBulkParent && bulkUnits.total > 0 ? (
          <div>
            <p className="text-sm font-medium text-gray-900">
              {bulkUnits.allocated} / {bulkUnits.activeTotal}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Units Allocated</p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-gray-900">
              {getAllocatedQuantity(asset)} / {getTotalQuantity(asset)}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {getQuantityLabel(asset.category)} Allocated
            </p>
          </div>
        )}
      </td>

      {/* Actions */}
      {userRole !== "Viewer" && (
        <td className="px-6 py-4 whitespace-nowrap">
          <ActionMenu
            asset={asset}
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
            onDispose={onDispose}
            userRole={userRole}
            stopPropagation={true}
            allAssets={allAssets}
            allMaintenanceRecords={allMaintenanceRecords}
            allLicenseAllocations={allLicenseAllocations}
          />
        </td>
      )}
    </tr>
  );
};
