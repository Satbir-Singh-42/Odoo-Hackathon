/**
 * Centralized date formatting utilities.
 * Uses Indian English locale (en-IN) with consistent formatting across the app.
 */

const DATE_LOCALE = "en-IN";

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
};

const DATETIME_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * Format a date string/Date to display format: "01 Jan 2024"
 */
export function formatDisplayDate(
  date: string | Date | null | undefined,
): string {
  if (!date) return "—";
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(DATE_LOCALE, DATE_OPTIONS);
  } catch {
    return "—";
  }
}

/**
 * Format a date string/Date to display format with time: "01 Jan 2024, 02:30 pm"
 */
export function formatDisplayDateTime(
  date: string | Date | null | undefined,
): string {
  if (!date) return "—";
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(DATE_LOCALE, DATETIME_OPTIONS);
  } catch {
    return "—";
  }
}

/**
 * Format a date with full weekday and month: "Monday, 1 January 2024"
 * Used in notification detail modals where full context is needed.
 */
export function formatDisplayDateFull(
  date: string | Date | null | undefined,
): string {
  if (!date) return "—";
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(DATE_LOCALE, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

/**
 * Format a date with abbreviated weekday: "Mon, 1 Jan 2024"
 * Used in compact notification date labels.
 */
export function formatDisplayDateWithWeekday(
  date: string | Date | null | undefined,
): string {
  if (!date) return "—";
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(DATE_LOCALE, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

/**
 * Normalize a date value for native <input type="date"> controls.
 * Returns YYYY-MM-DD or an empty string when value is invalid.
 */
export function toDateInputValue(
  date: string | Date | null | undefined,
): string {
  if (!date) return "";

  if (date instanceof Date) {
    if (isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const trimmed = date.trim();

  // If the string is exactly YYYY-MM-DD, return it directly to avoid timezone shift
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
