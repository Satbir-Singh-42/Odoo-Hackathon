'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ArrowLeft,
  Filter,
  Columns3,
  ChevronDown,
  ChevronsUpDown,
  RotateCcw,
  FileSpreadsheet,
} from "lucide-react";
import {
  consumeDataViewPayload,
  type DataViewPayload,
} from '@/lib/utils/dataViewHelpers';
import { buildCSV, downloadCSV } from '@/lib/utils/csvHelpers';
import { useSmartDropdownPosition } from '@/hooks/useSmartDropdownPosition';
import { formatDisplayDate } from '@/lib/utils/dateHelpers';

type CellValue = string | number | null | undefined;
type SortRule = { col: number; dir: "asc" | "desc" };
type ColumnFilter = { col: number; values: Set<string> };

const PAGE_SIZES = [25, 50, 100, 250, 500, 1000];
const JSON_PREVIEW_MAX_LENGTH = 120;
const MAX_DETAIL_ITEMS = 12;

// Headers that should appear as quick-filter dropdowns (case-insensitive match)
// Covers assets, maintenance, allocations, audit log, reports, licenses etc.
const QUICK_FILTER_KEYWORDS = [
  "category", "type", "status", "vendor", "department",
  "condition", "allocation", "role", "performed", "assigned", "priority", "mode", "source",
];

// Headers that are JSON payloads — never useful as quick-filter dropdowns
const EXCLUDED_FILTER_KEYWORDS = [
  // JSON payload columns — meaningless as categorical filters
  "old values", "new values", "additional info", "json", "payload",
  // Verbose detail columns that clutter the filter bar
  "condition at",
];

function isExcludedFilterHeader(h: string): boolean {
  const lower = h.toLowerCase();
  return EXCLUDED_FILTER_KEYWORDS.some((kw) => lower.includes(kw));
}

function isQuickFilterHeader(h: string): boolean {
  if (isExcludedFilterHeader(h)) return false;
  const lower = h.toLowerCase();
  return QUICK_FILTER_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Parse a DD/MM/YYYY or ISO date string to Date (returns null on failure) */
function parseFlexDate(v: string): Date | null {
  const s = v.trim();
  if (!s) return null;
  // DD/MM/YYYY optionally followed by time
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:,\s*(.*))?/);
  if (dmy) {
    const year = parseInt(dmy[3], 10);
    const month = parseInt(dmy[2], 10) - 1;
    const day = parseInt(dmy[1], 10);
    let hours = 0, minutes = 0, seconds = 0;
    
    if (dmy[4]) {
      const timeMatch = dmy[4].match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
      if (timeMatch) {
        hours = parseInt(timeMatch[1], 10);
        minutes = parseInt(timeMatch[2], 10);
        seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
        const period = timeMatch[4]?.toLowerCase();
        if (period === "pm" && hours < 12) hours += 12;
        if (period === "am" && hours === 12) hours = 0;
      }
    }
    const d = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Detect if most non-empty values in a column parse as dates */
function isDateColumn(rows: CellValue[][], colIdx: number): boolean {
  let dateCount = 0;
  let nonEmpty = 0;
  const sample = rows.slice(0, Math.min(rows.length, 50));
  for (const row of sample) {
    const v = String(row[colIdx] ?? "").trim();
    if (!v) continue;
    nonEmpty++;
    // Use parseFlexDate so DD/MM/YYYY and ISO formats both count
    if (parseFlexDate(v) !== null && v.length > 5) dateCount++;
  }
  return nonEmpty > 0 && dateCount / nonEmpty > 0.7;
}

/** Detect if most non-empty values parse as numbers */
function isNumericColumn(rows: CellValue[][], colIdx: number): boolean {
  let numCount = 0;
  let nonEmpty = 0;
  const sample = rows.slice(0, Math.min(rows.length, 50));
  for (const row of sample) {
    const v = String(row[colIdx] ?? "").trim();
    if (!v) continue;
    nonEmpty++;
    if (!isNaN(Number(v))) numCount++;
  }
  return nonEmpty > 0 && numCount / nonEmpty > 0.7;
}

/** Get unique values for a column (sorted, max 200) */
function getUniqueValues(rows: CellValue[][], colIdx: number): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const v = String(row[colIdx] ?? "").trim();
    if (v) set.add(v);
    if (set.size > 200) break;
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function hasMeaningfulCellValue(value: CellValue): boolean {
  const normalized = String(value ?? "").trim();
  if (!normalized) return false;
  if (normalized === "-" || normalized === "—") return false;

  const lower = normalized.toLowerCase();
  return (
    lower !== "n/a" &&
    lower !== "na" &&
    lower !== "null" &&
    lower !== "undefined"
  );
}

function isLikelyJsonHeader(header: string): boolean {
  return /(old values|new values|additional info|json|payload)/i.test(header);
}

function humanizeKey(key: string): string {
  const label = key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim();

  return label.replace(/\b\w+/g, (word) => {
    const lower = word.toLowerCase();
    if (lower === "id") return "ID";
    if (lower === "ip") return "IP";
    if (lower === "url") return "URL";
    if (lower === "api") return "API";
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

function formatPrimitiveValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatInlineValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    return value.map((item) => formatInlineValue(item)).join(", ");
  }

  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "-";
    return entries
      .map(([key, nestedVal]) => `${humanizeKey(key)}: ${formatInlineValue(nestedVal)}`)
      .join(", ");
  }

  return formatPrimitiveValue(value);
}

function buildJsonDetails(parsed: unknown): Array<{ key: string; value: string }> {
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return [{ key: "Value", value: "-" }];
    }

    const rows = parsed.slice(0, MAX_DETAIL_ITEMS).map((item, idx) => ({
      key: `Item ${idx + 1}`,
      value: formatInlineValue(item),
    }));

    if (parsed.length > MAX_DETAIL_ITEMS) {
      rows.push({
        key: "More",
        value: `${parsed.length - MAX_DETAIL_ITEMS} more item(s)`,
      });
    }

    return rows;
  }

  if (typeof parsed === "object" && parsed !== null) {
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 0) {
      return [{ key: "Value", value: "-" }];
    }

    const rows = entries.slice(0, MAX_DETAIL_ITEMS).map(([key, value]) => ({
      key: humanizeKey(key),
      value: formatInlineValue(value),
    }));

    if (entries.length > MAX_DETAIL_ITEMS) {
      rows.push({
        key: "More",
        value: `${entries.length - MAX_DETAIL_ITEMS} more field(s)`,
      });
    }

    return rows;
  }

  return [{ key: "Value", value: formatPrimitiveValue(parsed) }];
}

function parseJsonCell(value: string, header: string): {
  preview: string;
  details: Array<{ key: string; value: string }>;
} | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Parse aggressively for known JSON-heavy columns, conservatively elsewhere.
  const canAttemptParse =
    isLikelyJsonHeader(header) ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");
  if (!canAttemptParse) return null;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (
      parsed === null ||
      (typeof parsed !== "object" && !Array.isArray(parsed))
    ) {
      return null;
    }

    // Empty object {} or array [] — show as dash, not a parsed pill
    if (
      (typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed as object).length === 0) ||
      (Array.isArray(parsed) && parsed.length === 0)
    ) {
      return null;
    }

    const details = buildJsonDetails(parsed);
    const plain = details
      .map((item) => `${item.key}: ${item.value}`)
      .join(" | ");

    return {
      preview: plain || "-",
      details,
    };
  } catch {
    return null;
  }
}

function formatCellForCsvExport(value: CellValue, header: string): string {
  if (value === null || value === undefined) return "";

  const raw = String(value);
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const canAttemptParse =
    isLikelyJsonHeader(header) ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  if (!canAttemptParse) return raw;

  try {
    const parsed: unknown = JSON.parse(trimmed);

    if (parsed === null) return "";

    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return "";
      return parsed.map((item) => formatInlineValue(item)).join(" | ");
    }

    if (typeof parsed === "object") {
      const entries = Object.entries(parsed as Record<string, unknown>);
      if (entries.length === 0) return "";
      return entries
        .map(([key, val]) => `${humanizeKey(key)}: ${formatInlineValue(val)}`)
        .join(" | ");
    }

    return formatPrimitiveValue(parsed);
  } catch {
    return raw;
  }
}

function toPreviewText(text: string, maxLength = JSON_PREVIEW_MAX_LENGTH): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function TableCellValue({
  value,
  header,
}: {
  value: CellValue;
  header: string;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{
    left: number;
    // Exactly one of top/bottom is set — determines whether popup opens above or below
    top?: number;
    bottom?: number;
    width: number;
  } | null>(null);

  const POPUP_HEIGHT = 220; // max expected height of the detail popup (px)
  const POPUP_OFFSET = 6;   // gap between trigger and popup

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const updatePopoverPosition = useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(280, Math.max(180, rect.width));

    // ── Horizontal: clamp so popup never clips off either edge ──
    let left = rect.left;
    const maxLeft = viewportWidth - width - 12;
    if (left > maxLeft) left = maxLeft;
    if (left < 12) left = 12;

    // ── Vertical: open below if enough room, otherwise above ──
    const spaceBelow = viewportHeight - rect.bottom - POPUP_OFFSET;
    const spaceAbove = rect.top - POPUP_OFFSET;
    const openBelow = spaceBelow >= POPUP_HEIGHT || spaceBelow >= spaceAbove;

    if (openBelow) {
      setPopoverPos({ left, width, top: rect.bottom + POPUP_OFFSET });
    } else {
      setPopoverPos({ left, width, bottom: viewportHeight - rect.top + POPUP_OFFSET });
    }
  }, []);

  const openDetails = useCallback(() => {
    clearHideTimer();
    updatePopoverPosition();
    setIsDetailsOpen(true);
  }, [clearHideTimer, updatePopoverPosition]);

  const closeDetails = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setIsDetailsOpen(false);
    }, 90);
  }, [clearHideTimer]);

  useEffect(() => {
    if (!isDetailsOpen) return;

    const reposition = () => updatePopoverPosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);

    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isDetailsOpen, updatePopoverPosition]);

  useEffect(() => {
    return () => {
      clearHideTimer();
    };
  }, [clearHideTimer]);

  const isEmpty = value == null || value === "";
  if (isEmpty) {
    return <span className="text-gray-300">-</span>;
  }

  const raw = String(value);
  const parsedJson = parseJsonCell(raw, header);

  if (parsedJson) {
    const preview = toPreviewText(parsedJson.preview);

    return (
      <div className="relative z-10 max-w-72">
        <div
          ref={triggerRef}
          className="inline-flex max-w-full items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-900"
          onMouseEnter={openDetails}
          onMouseLeave={closeDetails}>
          <span className="truncate">{preview}</span>
        </div>

        {isDetailsOpen &&
          popoverPos &&
          createPortal(
            <div
              className="fixed"
              style={{
                left: popoverPos.left,
                top: popoverPos.top,
                bottom: popoverPos.bottom,
                width: popoverPos.width,
                zIndex: 9999,
              }}
              onMouseEnter={openDetails}
              onMouseLeave={closeDetails}>
              <div className="overflow-visible rounded-md border border-gray-200 bg-white shadow-lg">
                <div className="border-b border-gray-100 bg-gray-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                  Details
                </div>
                <div className="max-h-48 overflow-auto bg-white p-1.5">
                  <div className="space-y-1">
                    {parsedJson.details.map((item, idx) => (
                      <div
                        key={`${item.key}-${idx}`}
                        className="rounded bg-gray-50 px-1.5 py-1 text-[10px] leading-4">
                        <span className="font-semibold text-gray-600 wrap-break-word">
                          {item.key}:
                        </span>{" "}
                        <span className="text-gray-800 wrap-break-word">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            ,
            document.body,
          )}
      </div>
    );
  }

  return (
    <span className="block max-w-64 truncate" title={raw}>
      {raw}
    </span>
  );
}

// ─────────────────────────────────────────────────────────
// DROPDOWN HOOK — click-outside close
// ─────────────────────────────────────────────────────────
function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  handler: () => void,
) {
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) handler();
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [ref, handler]);
}

// ─────────────────────────────────────────────────────────
// COLUMN FILTER DROPDOWN
// ─────────────────────────────────────────────────────────
function ColumnFilterDropdown({
  colIdx,
  header,
  uniqueValues,
  selectedValues,
  onApply,
}: {
  colIdx: number;
  header: string;
  uniqueValues: string[];
  selectedValues: Set<string>;
  onApply: (colIdx: number, values: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [localSelected, setLocalSelected] = useState<Set<string>>(
    new Set(selectedValues),
  );
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { openUpward, maxHeight } = useSmartDropdownPosition({
    isOpen: open,
    anchorRef: triggerRef,
    menuRef,
    preferredMaxHeight: 260,
  });
  useClickOutside(ref, () => {
    if (open) {
      setOpen(false);
      setFilterSearch("");
    }
  });

  useEffect(() => {
    setLocalSelected(new Set(selectedValues));
  }, [selectedValues]);

  const filtered = useMemo(() => {
    if (!filterSearch) return uniqueValues;
    const q = filterSearch.toLowerCase();
    return uniqueValues.filter((v) => v.toLowerCase().includes(q));
  }, [uniqueValues, filterSearch]);

  const isActive = selectedValues.size > 0;

  const handleToggle = (val: string) => {
    const next = new Set(localSelected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setLocalSelected(next);
  };

  const handleApply = () => {
    onApply(colIdx, localSelected);
    setOpen(false);
    setFilterSearch("");
  };

  const handleClear = () => {
    setLocalSelected(new Set());
    onApply(colIdx, new Set());
    setOpen(false);
    setFilterSearch("");
  };

  const handleSelectAll = () => setLocalSelected(new Set(filtered));
  const isHighlighted = isActive || open;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center justify-center rounded p-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${isHighlighted
          ? "text-blue-700"
          : "text-gray-400 hover:text-gray-600"
          }`}
        title={`Filter ${header}`}>
        <Filter className="h-3 w-3" />
      </button>
      {open && (
        <div
          ref={menuRef}
          className={`absolute left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-xl min-w-56 max-w-72 overflow-y-auto ${openUpward ? "bottom-full mb-1" : "top-full mt-1"
            }`}
          style={{ maxHeight: `${maxHeight}px` }}>
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder={`Search ${header}...`}
                className="w-full h-7 pl-7 pr-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 bg-gray-50"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <p className="text-[11px] text-gray-400 text-center py-3">
                No values match
              </p>
            ) : (
              filtered.map((val) => (
                <label
                  key={val}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={localSelected.has(val)}
                    onChange={() => handleToggle(val)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 accent-blue-600"
                  />
                  <span className="text-xs text-gray-700 truncate flex-1">
                    {val}
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="flex items-center justify-between p-2 border-t border-gray-100 bg-gray-50/50 rounded-b-lg">
            <div className="flex gap-1">
              <button
                onClick={handleSelectAll}
                className="text-[10px] text-blue-600 hover:text-blue-800 font-medium px-1.5 py-0.5 rounded hover:bg-blue-50">
                All
              </button>
              <button
                onClick={handleClear}
                className="text-[10px] text-red-600 hover:text-red-800 font-medium px-1.5 py-0.5 rounded hover:bg-red-50">
                Clear
              </button>
            </div>
            <button
              onClick={handleApply}
              className="text-[10px] font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded transition-colors">
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// QUICK FILTER SELECT — single-value custom dropdown
// ─────────────────────────────────────────────────────────
function QuickFilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { openUpward, maxHeight } = useSmartDropdownPosition({
    isOpen: open,
    anchorRef: triggerRef,
    menuRef,
    preferredMaxHeight: 240,
  });
  useClickOutside(ref, () => { if (open) { setOpen(false); setSearch(""); } });

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((v) => v.toLowerCase().includes(q));
  }, [options, search]);

  const isActive = !!value;

  const select = (val: string) => {
    onChange(val);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`h-8 inline-flex items-center gap-1.5 pl-2.5 pr-2 rounded-lg border text-[11px] font-medium transition-all whitespace-nowrap max-w-[160px] ${isActive
          ? "border-blue-400 bg-blue-50 text-blue-700"
          : "border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:bg-gray-50"
          }`}>
        <span className="truncate flex-1 text-left">
          {value || `All ${label}`}
        </span>
        {isActive ? (
          <span
            onClick={(e) => { e.stopPropagation(); select(""); }}
            className="shrink-0 p-0.5 rounded hover:bg-blue-200 transition-colors cursor-pointer">
            <X className="w-3 h-3" />
          </span>
        ) : (
          <ChevronDown className={`w-3 h-3 shrink-0 transition-transform text-gray-400 ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ maxHeight: `${maxHeight}px` }}
          className={`absolute left-0 z-[60] w-48 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden flex flex-col ${openUpward ? "bottom-full mb-1" : "top-full mt-1"
            }`}>
          {options.length > 6 && (
            <div className="p-1.5 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${label}...`}
                  className="w-full h-7 pl-7 pr-2 border border-gray-200 rounded text-[11px] focus:ring-1 focus:ring-blue-500 bg-gray-50"
                  autoFocus
                />
              </div>
            </div>
          )}
          <div className="overflow-y-auto">
            <button
              type="button"
              onClick={() => select("")}
              className={`w-full text-left px-3 py-2 text-[11px] transition-colors ${!value
                ? "bg-blue-50 text-blue-700 font-semibold"
                : "text-gray-500 hover:bg-gray-50"
                }`}>
              All {label}
            </button>
            {filtered.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => select(opt)}
                className={`w-full text-left px-3 py-2 text-[11px] transition-colors flex items-center gap-2 ${value === opt
                  ? "bg-blue-50 text-blue-700 font-semibold"
                  : "text-gray-700 hover:bg-gray-50"
                  }`}>
                {value === opt && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                <span className="truncate">{opt}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-3 text-[11px] text-gray-400 text-center">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// QUICK DATE INPUT — uses showPicker() for reliable cross-browser support
// ─────────────────────────────────────────────────────────
function QuickDateInput({
  value,
  onChange,
  active = false,
}: {
  value: string;
  onChange: (val: string) => void;
  active?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Convert stored YYYY-MM-DD → display as DD/MM/YYYY
  const display = value ? value.split("-").reverse().join("/") : null;

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    // showPicker() is supported in Chrome 99+, Firefox 101+, Safari 16+
    if (typeof (el as HTMLInputElement & { showPicker?: () => void }).showPicker === "function") {
      (el as HTMLInputElement & { showPicker: () => void }).showPicker();
    } else {
      el.click();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openPicker}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openPicker()}
      className={`relative h-8 w-36 flex items-center justify-between gap-1.5 pl-2.5 pr-2 rounded-lg border text-[11px] font-medium transition-all cursor-pointer select-none ${active
        ? "border-blue-400 bg-blue-50 text-blue-700"
        : "border-gray-300 bg-white hover:border-gray-400"
        }`}>
      <span className={display ? (active ? "" : "text-gray-700") : "text-gray-400 font-normal"}>
        {display ?? "DD/MM/YYYY"}
      </span>
      <ChevronDown className="w-3.5 h-3.5 shrink-0 text-gray-400" />
      {/* Hidden input — pointer-events-none so the div handles all clicks */}
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
        style={{ colorScheme: "light" }}
      />
    </div>
  );
}


// ─────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────
export default function DataViewPage({
  inlinePayload,
  onClose,
}: {
  inlinePayload?: DataViewPayload | null;
  onClose?: () => void;
} = {}) {
  const [payload, setPayload] = useState<DataViewPayload | null>(inlinePayload || null);
  const [search, setSearch] = useState("");
  const [sortRules, setSortRules] = useState<SortRule[]>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFilter[]>([]);
  const [hiddenCols, setHiddenCols] = useState<Set<number>>(new Set());
  const [forceVisibleCols, setForceVisibleCols] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [showColPicker, setShowColPicker] = useState(false);
  const [highlightRow, setHighlightRow] = useState<number | null>(null);
  const lastAutoHiddenSignatureRef = useRef("");
  // Quick filters
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [quickFilterValues, setQuickFilterValues] = useState<Record<number, string>>({});

  const colPickerRef = useRef<HTMLDivElement>(null);
  const colPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const colPickerMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(colPickerRef, () => showColPicker && setShowColPicker(false));

  const {
    openUpward: openColPickerUpward,
    maxHeight: colPickerMaxHeight,
  } = useSmartDropdownPosition({
    isOpen: showColPicker,
    anchorRef: colPickerTriggerRef,
    menuRef: colPickerMenuRef,
    preferredMaxHeight: 320,
  });

  useEffect(() => {
    if (inlinePayload) {
      setPayload(inlinePayload);
    } else {
      const data = consumeDataViewPayload();
      if (data) setPayload(data);
    }
  }, [inlinePayload]);

  // Auto-hide columns where EVERY row is empty/meaningless.
  // This covers "Unit #" and any other blank columns that clutter wide tables.
  useEffect(() => {
    if (!payload) return;

    const signature = `${payload.title}::${payload.headers.join("|")}::${payload.rows.length}`;
    if (lastAutoHiddenSignatureRef.current === signature) return;
    lastAutoHiddenSignatureRef.current = signature;

    const columnsToHide = payload.headers
      .map((header, index) => ({ header, index }))
      .filter(({ index }) => {
        // Keep a column if at least ONE row has a meaningful value
        return !payload.rows.some((row) => hasMeaningfulCellValue(row[index]));
      })
      .map(({ index }) => index);

    if (columnsToHide.length === 0) return;

    setHiddenCols((prev) => {
      const next = new Set(prev);
      columnsToHide.forEach((colIndex) => next.add(colIndex));
      return next;
    });
  }, [payload]);

  // Column metadata (memoized once)
  const colMeta = useMemo(() => {
    if (!payload) return [];
    return payload.headers.map((h, i) => ({
      index: i,
      header: h,
      isDate: isDateColumn(payload.rows, i),
      isNumeric: isNumericColumn(payload.rows, i),
      uniqueValues: getUniqueValues(payload.rows, i),
    }));
  }, [payload]);

  // Auto-detect the primary date column index (for range filtering)
  const primaryDateColIdx = useMemo(() => {
    if (!payload) return -1;
    // Prefer columns with 'date' in name
    const byName = colMeta.findIndex((c) => /date/i.test(c.header) && c.isDate);
    if (byName >= 0) return byName;
    return colMeta.findIndex((c) => c.isDate);
  }, [colMeta, payload]);

  // Quick-filter eligible columns:
  // 1. Header keyword match (category, status, vendor, action, table, etc.), OR
  // 2. Low cardinality (≤25 unique values) non-date, non-numeric, non-ID column
  // This ensures every report type (audit log, allocations, reports) gets dropdowns.
  const quickFilterCols = useMemo(() => {
    return colMeta
      .filter((c) => {
        if (c.uniqueValues.length === 0) return false;
        // Skip identifier columns: anything with "code" or "id" as a whole word
        // e.g. ASSET CODE, VENDOR CODE, ASSET ID, ALLOCATED TO (ID)
        if (/\b(code|id)\b/i.test(c.header) || /^(s\.?no|sr\.?no?|#)$/i.test(c.header.trim())) return false;
        // Skip JSON payload columns & other excluded columns
        if (isExcludedFilterHeader(c.header)) return false;
        // Skip columns whose values look like raw JSON objects/arrays
        const jsonCount = c.uniqueValues.filter((v) => /^[{\[]/.test(v.trim())).length;
        if (jsonCount > c.uniqueValues.length * 0.5) return false;
        const byKeyword = isQuickFilterHeader(c.header) && !c.isDate && c.uniqueValues.length <= 100;
        const byCardinality = !c.isDate && !c.isNumeric && c.uniqueValues.length <= 25;
        return byKeyword || byCardinality;
      })
      .slice(0, 8);
  }, [colMeta]);

  // Whether there is anything useful to show in the quick-filter bar
  const hasQuickFiltersAvailable = quickFilterCols.length > 0 || primaryDateColIdx >= 0;



  // ── FILTERING ──
  const filtered = useMemo(() => {
    if (!payload) return [];
    let rows = payload.rows;

    // Global search
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((row) =>
        row.some((cell) =>
          String(cell ?? "").toLowerCase().includes(q),
        ),
      );
    }

    // Column-level filters
    for (const cf of columnFilters) {
      if (cf.values.size === 0) continue;
      rows = rows.filter((row) => {
        const v = String(row[cf.col] ?? "").trim();
        return cf.values.has(v);
      });
    }

    // Quick categorical filters
    for (const [colIdxStr, val] of Object.entries(quickFilterValues)) {
      if (!val) continue;
      const ci = Number(colIdxStr);
      rows = rows.filter((row) => String(row[ci] ?? "").trim() === val);
    }

    // Date range filter
    if ((dateStart || dateEnd) && primaryDateColIdx >= 0) {
      const start = dateStart ? new Date(dateStart) : null;
      const end = dateEnd ? new Date(dateEnd + "T23:59:59") : null;
      rows = rows.filter((row) => {
        const raw = String(row[primaryDateColIdx] ?? "");
        const d = parseFlexDate(raw);
        if (!d) return false;
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
    }

    return rows;
  }, [payload, search, columnFilters, quickFilterValues, dateStart, dateEnd, primaryDateColIdx]);

  // Auto-hide columns that are completely empty in the current filtered view
  const emptyFilteredCols = useMemo(() => {
    if (!payload || filtered.length === 0) return new Set<number>();
    const emptySet = new Set<number>();
    for (let i = 0; i < payload.headers.length; i++) {
      let hasValue = false;
      for (const row of filtered) {
        if (hasMeaningfulCellValue(row[i])) {
          hasValue = true;
          break;
        }
      }
      if (!hasValue) emptySet.add(i);
    }
    return emptySet;
  }, [filtered, payload]);

  // Visible column indices
  const visibleCols = useMemo(
    () => colMeta
      .filter((c) => {
        if (hiddenCols.has(c.index)) return false;
        if (emptyFilteredCols.has(c.index) && !forceVisibleCols.has(c.index)) return false;
        return true;
      })
      .map((c) => c.index),
    [colMeta, hiddenCols, emptyFilteredCols, forceVisibleCols],
  );

  // ── SORTING (multi-column) ──
  const sorted = useMemo(() => {
    if (sortRules.length === 0) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      for (const rule of sortRules) {
        const aVal = a[rule.col] ?? "";
        const bVal = b[rule.col] ?? "";
        const meta = colMeta[rule.col];

        let cmp = 0;
        if (meta?.isDate) {
          const aD = parseFlexDate(String(aVal))?.getTime() ?? NaN;
          const bD = parseFlexDate(String(bVal))?.getTime() ?? NaN;
          if (!isNaN(aD) && !isNaN(bD)) cmp = aD - bD;
          else cmp = String(aVal).localeCompare(String(bVal));
        } else if (meta?.isNumeric) {
          const aNum = Number(aVal);
          const bNum = Number(bVal);
          if (!isNaN(aNum) && !isNaN(bNum)) cmp = aNum - bNum;
          else cmp = String(aVal).localeCompare(String(bVal));
        } else {
          cmp = String(aVal).localeCompare(String(bVal));
        }

        if (cmp !== 0) return rule.dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
    return arr;
  }, [filtered, sortRules, colMeta]);

  // ── PAGINATION ──
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  );

  // ── SORT HANDLER (click = single sort, Shift+click = multi) ──
  const handleSort = useCallback((colIndex: number, multi: boolean) => {
    setSortRules((prev) => {
      const existing = prev.findIndex((r) => r.col === colIndex);
      if (existing >= 0) {
        const rule = prev[existing];
        if (rule.dir === "asc") {
          const next = [...prev];
          next[existing] = { col: colIndex, dir: "desc" };
          return next;
        }
        // Remove sort on third click
        return prev.filter((_, i) => i !== existing);
      }
      const newRule: SortRule = { col: colIndex, dir: "asc" };
      return multi ? [...prev, newRule] : [newRule];
    });
    setPage(1);
  }, []);

  // ── COLUMN FILTER HANDLER ──
  const handleColumnFilter = useCallback(
    (colIdx: number, values: Set<string>) => {
      setColumnFilters((prev) => {
        const without = prev.filter((cf) => cf.col !== colIdx);
        if (values.size === 0) return without;
        return [...without, { col: colIdx, values }];
      });
      setPage(1);
    },
    [],
  );

  // ── CLEAR ALL ──
  const clearAllFilters = useCallback(() => {
    setSearch("");
    setColumnFilters([]);
    setSortRules([]);
    setDateStart("");
    setDateEnd("");
    setQuickFilterValues({});
    setPage(1);
  }, []);

  const hasQuickFilter =
    dateStart !== "" ||
    dateEnd !== "" ||
    Object.values(quickFilterValues).some(Boolean);
  const hasAnyFilter =
    search !== "" || columnFilters.length > 0 || hasQuickFilter;
  const activeFilterCount =
    columnFilters.filter((cf) => cf.values.size > 0).length +
    (search ? 1 : 0) +
    Object.values(quickFilterValues).filter(Boolean).length +
    (dateStart ? 1 : 0) +
    (dateEnd ? 1 : 0);

  // ── DOWNLOAD ──
  const handleDownload = useCallback(() => {
    if (!payload) return;
    const now = formatDisplayDate(new Date());
    const visibleHeaders = visibleCols.map((i) => payload.headers[i]);
    const visibleRows = filtered.map((row) =>
      visibleCols.map((i) =>
        formatCellForCsvExport(row[i], payload.headers[i] || ""),
      ),
    );
    const csv = buildCSV(
      [
        `${payload.title} — Exported ${now}`,
        `Total Records: ${payload.rows.length}`,
        ...(hasAnyFilter ? [`Filtered Records: ${filtered.length}`] : []),
      ],
      visibleHeaders,
      visibleRows,
    );
    downloadCSV(csv, payload.filename);
  }, [payload, filtered, visibleCols, hasAnyFilter]);

  // ── DOWNLOAD ALL (unfiltered) ──
  const handleDownloadAll = useCallback(() => {
    if (!payload) return;
    const now = formatDisplayDate(new Date());
    const normalizedRows = payload.rows.map((row) =>
      payload.headers.map((header, colIdx) =>
        formatCellForCsvExport(row[colIdx], header),
      ),
    );
    const csv = buildCSV(
      [
        `${payload.title} — Exported ${now}`,
        `Total Records: ${payload.rows.length}`,
      ],
      payload.headers,
      normalizedRows,
    );
    downloadCSV(csv, payload.filename);
  }, [payload]);

  // ── ROW CLICK highlight ──
  const toggleHighlight = useCallback((rowIdx: number) => {
    setHighlightRow((prev) => (prev === rowIdx ? null : rowIdx));
  }, []);

  // ── SORT INDICATOR ──
  const getSortInfo = (colIdx: number) => {
    const idx = sortRules.findIndex((r) => r.col === colIdx);
    if (idx < 0) return null;
    return {
      dir: sortRules[idx].dir,
      rank: sortRules.length > 1 ? idx + 1 : null,
    };
  };

  // ── EMPTY STATE ──
  if (!payload) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto">
            <FileSpreadsheet className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">No Report Data</h1>
          <p className="text-gray-500 max-w-md">
            Click an <strong>Export</strong> button from any page to preview the
            data here before downloading.
          </p>
          <button
            onClick={() => {
              if (onClose) onClose();
              else window.location.href = "/";
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold">
            <ArrowLeft className="w-4 h-4" />
            {onClose ? "Close Data View" : "Go to Dashboard"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── STICKY HEADER ── */}
      <header className="bg-white sticky top-0 z-40 shadow-sm border-b border-gray-200">
        <div className="ui-page-shell flex items-center justify-between h-14 sm:h-16 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              onClick={() => {
                if (onClose) onClose();
                else window.close();
              }}
              className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
              title="Close">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-bold text-gray-900 truncate">
                {payload.title}
              </h1>
              <p className="text-[10px] sm:text-[11px] text-gray-500 flex items-center gap-1 sm:gap-1.5">
                <span className="font-semibold text-gray-700">
                  {sorted.length.toLocaleString()}
                </span>
                {hasAnyFilter && (
                  <span className="text-gray-400">
                    of {payload.rows.length.toLocaleString()}
                  </span>
                )}
                <span>records</span>
                <span className="text-gray-300 hidden sm:inline">&middot;</span>
                <span className="hidden sm:inline">
                  {visibleCols.length} of {payload.headers.length} columns
                </span>
              </p>
            </div>
          </div>

          {/* Right-side actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {hasAnyFilter ? (
              <>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-[11px] sm:text-xs font-semibold shadow-sm"
                  title="Download filtered/visible data only">
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Filtered</span> (
                  {filtered.length})
                </button>
                <button
                  onClick={handleDownloadAll}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-xs font-medium"
                  title="Download all data unfiltered">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  All ({payload.rows.length})
                </button>
              </>
            ) : (
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs sm:text-sm font-semibold shadow-sm">
                <Download className="w-4 h-4" />
                <span className="hidden xs:inline">Download</span> CSV
              </button>
            )}
          </div>
        </div>
      </header>


      {/* ── TOOLBAR ── */}
      <div className="ui-page-shell py-2 sm:py-3">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Global Search */}
          <div className="relative flex-1 min-w-0 sm:min-w-48 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search all columns..."
              className="w-full h-9 pl-9 pr-9 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            )}
          </div>

          {/* Filter Toggle — only shown when there are quick filters or a date column */}
          {hasQuickFiltersAvailable && (
            <button
              onClick={() => setShowFilterBar(!showFilterBar)}
              className={`inline-flex items-center gap-1 sm:gap-1.5 h-8 sm:h-9 px-2 sm:px-3 text-[11px] sm:text-xs font-medium rounded-lg border transition-all ${showFilterBar || activeFilterCount > 0
                ? "bg-blue-50 text-blue-700 border-blue-300"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}>
              <Filter className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold min-w-4 text-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}

          {/* Column Visibility */}
          <div className="relative" ref={colPickerRef}>
            <button
              ref={colPickerTriggerRef}
              onClick={() => setShowColPicker(!showColPicker)}
              className={`inline-flex items-center gap-1 sm:gap-1.5 h-8 sm:h-9 px-2 sm:px-3 text-[11px] sm:text-xs font-medium rounded-lg border transition-all ${hiddenCols.size > 0
                ? "bg-amber-50 text-amber-700 border-amber-300"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}>
              <Columns3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Columns</span>
              {payload && visibleCols.length > 0 && (
                <span className="bg-amber-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold min-w-4 text-center">
                  {visibleCols.length}
                </span>
              )}
              <ChevronDown
                className={`w-3 h-3 transition-transform ${showColPicker ? "rotate-180" : ""}`}
              />
            </button>

            {showColPicker && (
              <div
                ref={colPickerMenuRef}
                className={`absolute right-0 sm:right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-xl w-[min(16rem,calc(100vw-2rem))] sm:min-w-56 overflow-y-auto ${openColPickerUpward ? "bottom-full mb-1" : "top-full mt-1"
                  }`}
                style={{ maxHeight: `${colPickerMaxHeight}px` }}>
                <div className="p-2 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-600">
                    Toggle Columns
                  </span>
                  <button
                    onClick={() => {
                      setHiddenCols(new Set());
                      setForceVisibleCols((prev) => {
                        const next = new Set(prev);
                        emptyFilteredCols.forEach((col) => next.add(col));
                        return next;
                      });
                    }}
                    className="text-[10px] text-blue-600 hover:text-blue-800 font-medium px-1.5 py-0.5 rounded hover:bg-blue-50">
                    Show All
                  </button>
                </div>
                <div className="p-1.5">
                  {payload.headers.map((h, i) => (
                    <label
                      key={i}
                      title={emptyFilteredCols.has(i) && !forceVisibleCols.has(i) ? "Auto-hidden because it has no data. Click to show anyway." : ""}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer ${emptyFilteredCols.has(i) && !forceVisibleCols.has(i) ? "text-gray-400" : ""}`}>
                      <input
                        type="checkbox"
                        checked={visibleCols.includes(i)}
                        onChange={() => {
                          const isVisible = visibleCols.includes(i);
                          if (isVisible) {
                            // User wants to hide it
                            setHiddenCols((prev) => new Set(prev).add(i));
                            setForceVisibleCols((prev) => {
                              const next = new Set(prev);
                              next.delete(i);
                              return next;
                            });
                          } else {
                            // User wants to show it
                            setHiddenCols((prev) => {
                              const next = new Set(prev);
                              next.delete(i);
                              return next;
                            });
                            if (emptyFilteredCols.has(i)) {
                              setForceVisibleCols((prev) => new Set(prev).add(i));
                            }
                          }
                        }}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 accent-blue-600"
                      />
                      <span className="text-xs text-gray-700 truncate">{h}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sort info */}
          {sortRules.length > 0 && (
            <div className="inline-flex items-center gap-1 h-8 sm:h-9 px-2 sm:px-3 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-[11px] sm:text-xs font-medium">
              <ChevronsUpDown className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[120px]">
                {sortRules.map((r) => payload?.headers[r.col] ?? "").join(", ")}
              </span>
              <button
                onClick={() => setSortRules([])}
                className="ml-0.5 p-0.5 rounded hover:bg-purple-100 transition-colors shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

        </div>

        {/* ── QUICK FILTERS (shown when Filters button is active) ── */}
        {showFilterBar && hasQuickFiltersAvailable && (
          <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap items-end gap-2">
            {/* Date range */}
            {primaryDateColIdx >= 0 && (
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-bold uppercase tracking-wider text-gray-400 px-0.5">
                  Date Range
                </label>
                <div className="flex items-center gap-1">
                  <QuickDateInput
                    value={dateStart}
                    onChange={(v) => { setDateStart(v); setPage(1); }}
                    active={!!dateStart}
                  />
                  <span className="text-gray-400 text-xs font-medium select-none">–</span>
                  <QuickDateInput
                    value={dateEnd}
                    onChange={(v) => { setDateEnd(v); setPage(1); }}
                    active={!!dateEnd}
                  />
                </div>
              </div>
            )}
            {quickFilterCols.map((col) => (
              <div key={col.index} className="flex flex-col gap-0.5">
                <label className="text-[9px] font-bold uppercase tracking-wider text-gray-400 px-0.5">
                  {col.header}
                </label>
                <QuickFilterSelect
                  label={col.header}
                  value={quickFilterValues[col.index] ?? ""}
                  options={col.uniqueValues}
                  onChange={(val) => {
                    setQuickFilterValues((prev) => {
                      const next = { ...prev };
                      if (val) next[col.index] = val;
                      else delete next[col.index];
                      return next;
                    });
                    setPage(1);
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* ── ACTIVE FILTER CHIPS ── */}
        {(columnFilters.length > 0 || showFilterBar) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {columnFilters
              .filter((cf) => cf.values.size > 0)
              .map((cf) => {
                const label = payload.headers[cf.col];
                const vals = [...cf.values];
                const display =
                  vals.length <= 2
                    ? vals.join(", ")
                    : `${vals.length} selected`;
                return (
                  <span
                    key={cf.col}
                    className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-[11px] font-medium">
                    <span className="font-semibold">{label}:</span> {display}
                    <button
                      onClick={() => handleColumnFilter(cf.col, new Set())}
                      className="p-0.5 rounded-full hover:bg-blue-200 transition-colors ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
          </div>
        )}
      </div>

      {/* ── TABLE ── */}
      <div className="ui-page-shell pb-6">
        <div className="bg-white border border-gray-200 rounded-lg sm:rounded-xl overflow-visible shadow-sm">
          <div className="overflow-x-auto overflow-y-visible relative z-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200">
                  {visibleCols.map((colIdx, i) => {
                    const meta = colMeta[colIdx];
                    const sortInfo = getSortInfo(colIdx);
                    return (
                      <th
                        key={colIdx}
                        className={`px-8 py-3 text-left select-none group whitespace-nowrap ${i === 0 ? "min-w-[80px]" : "min-w-[200px]"}`}>
                        <div className="flex items-center gap-1">
                          {/* Sort button */}
                          <button
                            onClick={(e) => handleSort(colIdx, e.shiftKey)}
                            className="text-[10px] font-bold text-gray-500 uppercase tracking-wider hover:text-gray-800 transition-colors whitespace-nowrap flex items-center gap-1"
                            title={`Sort by ${meta.header}${sortRules.length > 0 ? " (hold Shift for multi-sort)" : ""}`}>
                            {meta.header}
                            {sortInfo && (
                              <span className="inline-flex items-center text-blue-500">
                                {sortInfo.dir === "asc"
                                  ? <ChevronUp className="w-3 h-3" />
                                  : <ChevronDown className="w-3 h-3" />}
                                {sortInfo.rank && (
                                  <span className="text-[8px] font-bold leading-none">{sortInfo.rank}</span>
                                )}
                              </span>
                            )}
                          </button>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paged.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleCols.length}
                      className="px-3 py-14 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                          <Search className="w-5 h-5 text-gray-400" />
                        </div>
                        <p className="text-sm font-medium text-gray-600">
                          No records match
                        </p>
                        <p className="text-xs text-gray-400">
                          Try adjusting your search or filters
                        </p>
                        {hasAnyFilter && (
                          <button
                            onClick={clearAllFilters}
                            className="mt-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                            Clear all filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paged.map((row, rowIdx) => {
                    const globalIdx = (safePage - 1) * pageSize + rowIdx;
                    const isHighlighted = highlightRow === globalIdx;
                    return (
                      <tr
                        key={rowIdx}
                        onClick={() => toggleHighlight(globalIdx)}
                        className={`transition-colors cursor-pointer ${isHighlighted
                          ? "bg-blue-50 hover:bg-blue-100/70"
                          : "hover:bg-gray-50/70"
                          }`}>
                        {visibleCols.map((colIdx, i) => {
                          const cell = row[colIdx];
                          return (
                            <td key={colIdx} className={`px-8 py-3 text-gray-700 align-top whitespace-nowrap ${i === 0 ? "min-w-[80px]" : "min-w-[200px]"}`}>
                              <TableCellValue
                                value={cell}
                                header={payload.headers[colIdx]}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── PAGINATION ── */}
          {sorted.length > 0 && (
            <div className="border-t border-gray-200 px-2.5 sm:px-4 py-2 sm:py-3 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3 bg-gray-50/50">
              <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-gray-500">
                <span>Show</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-7 px-2 border-[0.5px] border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500">
                  {PAGE_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <span>per page</span>
                <span className="text-gray-300">|</span>
                <span className="font-medium text-gray-700">
                  {(safePage - 1) * pageSize + 1}–
                  {Math.min(safePage * pageSize, sorted.length)}
                </span>
                <span>of</span>
                <span className="font-medium text-gray-700">
                  {sorted.length.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center gap-1">
                {/* First page */}
                {totalPages > 5 && safePage > 3 && (
                  <button
                    onClick={() => setPage(1)}
                    className="px-1.5 h-7 rounded text-[10px] font-medium hover:bg-gray-200 text-gray-500 transition-colors"
                    title="First page">
                    1
                  </button>
                )}
                {totalPages > 5 && safePage > 4 && (
                  <span className="text-xs text-gray-400 px-0.5">…</span>
                )}

                <button
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (safePage <= 3) {
                    pageNum = i + 1;
                  } else if (safePage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = safePage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-7 h-7 rounded text-xs font-semibold transition-colors ${pageNum === safePage
                        ? "bg-blue-600 text-white shadow-sm"
                        : "hover:bg-gray-200 text-gray-600"
                        }`}>
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>

                {totalPages > 5 && safePage < totalPages - 3 && (
                  <span className="text-xs text-gray-400 px-0.5">…</span>
                )}
                {totalPages > 5 && safePage < totalPages - 2 && (
                  <button
                    onClick={() => setPage(totalPages)}
                    className="px-1.5 h-7 rounded text-[10px] font-medium hover:bg-gray-200 text-gray-500 transition-colors"
                    title="Last page">
                    {totalPages}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
