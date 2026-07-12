'use client';

import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export const DEFAULT_PAGE_SIZES = [25, 50, 100, 200];
export const DEFAULT_PAGE_SIZE = DEFAULT_PAGE_SIZES[0];

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  pageSizes?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  activeDropdown?: string | null;
  setActiveDropdown?: (val: "pageSize" | null) => void;
  compact?: boolean;
  itemLabel?: string;
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  pageSizes = DEFAULT_PAGE_SIZES,
  onPageChange,
  onPageSizeChange,
  activeDropdown,
  setActiveDropdown,
  compact,
  itemLabel = "records",
  className = "",
}: PaginationProps) {
  const [internalDropdown, setInternalDropdown] = useState<"pageSize" | null>(null);

  const resolvedActiveDropdown = activeDropdown ?? internalDropdown;
  const resolvedSetActiveDropdown = setActiveDropdown ?? setInternalDropdown;

  const handlePageSizeChange = (size: number) => {
    if (onPageSizeChange) {
      onPageSizeChange(size);
    }
    resolvedSetActiveDropdown(null);
  };

  const paginationRange = useMemo(() => {
    const range: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) range.push(i);
    return range;
  }, [currentPage, totalPages]);

  if (totalItems <= 0) return null;

  const btnCls = "p-1.5 text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
  const flCls = `${compact ? "hidden sm:inline-flex " : ""}px-2 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`;

  return (
    <div className={`${compact ? "px-3 sm:px-4" : "px-4"} py-3 border-t border-gray-200 bg-gray-50 flex ${compact ? "flex-wrap" : "flex-col sm:flex-row"} items-center justify-between ${compact ? "gap-2" : "gap-3"} ${className}`}>
      <div className={`flex ${compact ? "flex-wrap" : ""} items-center ${compact ? "gap-2 sm:gap-3 text-xs sm:text-sm" : "gap-3 text-sm"} text-gray-600`}>
        <span>
          Showing{" "}
          <strong>
            {Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)}–
            {Math.min(currentPage * itemsPerPage, totalItems)}
          </strong>{" "}
          of <strong>{totalItems.toLocaleString()}</strong> {itemLabel}
        </span>
        
        {onPageSizeChange && (
          <>
            <span className="text-gray-300">|</span>
            <div className="relative inline-flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Per page:</span>
              <button
                onClick={() => resolvedSetActiveDropdown(resolvedActiveDropdown === "pageSize" ? null : "pageSize")}
                className={`inline-flex items-center gap-1 text-xs font-medium border rounded-lg px-2 py-1 transition-all bg-white hover:border-gray-400 ${resolvedActiveDropdown === "pageSize" ? "border-gray-300" : "border-gray-300"}`}>
                {itemsPerPage}
                <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${resolvedActiveDropdown === "pageSize" ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {resolvedActiveDropdown === "pageSize" && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => resolvedSetActiveDropdown(null)} />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 2 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 2 }}
                      className="absolute z-50 bottom-full mb-1 right-0 min-w-20 bg-white rounded-xl shadow-xl overflow-hidden py-1">
                      {pageSizes.map((s) => (
                        <button
                          key={s}
                          onClick={() => handlePageSizeChange(s)}
                          className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors ${itemsPerPage === s ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-700 hover:bg-gray-50"}`}>
                          {s}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      <div className={`flex items-center gap-1${compact ? " flex-wrap" : ""}`}>
        <button onClick={() => onPageChange(1)} disabled={currentPage <= 1} className={flCls}>First</button>
        <button onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} className={btnCls}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        {paginationRange.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`min-w-8 py-1.5 text-xs font-medium rounded-lg border transition-colors ${p === currentPage ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
            {p}
          </button>
        ))}
        <button onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages} className={btnCls}>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => onPageChange(totalPages)} disabled={currentPage >= totalPages} className={flCls}>Last</button>
      </div>
    </div>
  );
}
