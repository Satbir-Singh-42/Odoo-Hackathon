/**
 * CSV Export Utilities
 * Professional CSV generation with Excel UTF-8 compatibility
 */

/** Unicode BOM — required for Excel to recognize UTF-8 encoding (₹, accented chars, etc.) */
const CSV_BOM = "\uFEFF";

/**
 * Escape a cell value for CSV format.
 * Quotes cells containing commas, double-quotes, newlines, or leading/trailing whitespace.
 */
function escapeCSVCell(value: unknown): string {
  const str = String(value ?? "");
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r") ||
    str !== str.trim()
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of cell values into a single CSV row string.
 */
function toCSVRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCSVCell).join(",");
}

/**
 * Format a date string for CSV display → DD/MM/YYYY
 * Returns empty string for null/undefined/invalid dates.
 */
export function formatCSVDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * Format a date string with time for CSV display → DD/MM/YYYY hh:mm:ss AM/PM
 * Returns empty string for null/undefined/invalid dates.
 */
export function formatCSVDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

/**
 * Download a CSV string as a file with UTF-8 BOM for Excel compatibility.
 * Automatically handles Blob creation, download link, and cleanup.
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([CSV_BOM + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Build a complete CSV string from metadata lines, column headers, and data rows.
 *
 * @param metadata - Title/subtitle lines shown above the data table
 * @param headers  - Column header names
 * @param rows     - 2D array of cell values
 * @returns Fully escaped CSV string (without BOM — use downloadCSV to add it)
 */
export function buildCSV(
  metadata: string[],
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const lines: string[] = [];

  // Metadata lines (each escaped as a single cell to avoid comma issues)
  metadata.forEach((line) => lines.push(escapeCSVCell(line)));

  // Blank separator
  if (metadata.length > 0) lines.push("");

  // Column headers
  lines.push(toCSVRow(headers));

  // Data rows
  rows.forEach((row) => lines.push(toCSVRow(row)));

  return lines.join("\n");
}

/**
 * Parse CSV text into a two-dimensional array of values.
 * Supports quoted fields, escaped quotes, and CRLF/LF line endings.
 */
export function parseCSV(csvText: string): string[][] {
  const normalized = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let idx = 0; idx < normalized.length; idx += 1) {
    const char = normalized[idx];
    const next = normalized[idx + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          currentCell += '"';
          idx += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (char === "\n") {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  if (currentCell !== "" || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  if (rows.length > 0 && rows[0].length > 0) {
    rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  }

  return rows;
}
