/**
 * Data View Helpers
 *
 * Opens DataViewPage in a new browser tab.
 * Data is passed via localStorage so the new tab can read it on mount.
 */

export interface DataViewPayload {
  title: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  filename: string;
}

/** CustomEvent name — kept for any in-page overlay consumers */
export const OPEN_DATA_VIEW_EVENT = "openDataView";

const STORAGE_KEY = "dataViewPayload";

/**
 * Open DataViewPage in a new tab, passing data via localStorage.
 */
export function openDataView(payload: DataViewPayload): void {
  // Write payload to localStorage so the new tab can pick it up
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage blocked — fall back to in-page overlay
    window.dispatchEvent(
      new CustomEvent(OPEN_DATA_VIEW_EVENT, { detail: payload }),
    );
    return;
  }

  // Open the standalone DataView tab
  const tab = window.open("/dataview", "_blank");

  // If the browser blocked the popup (e.g. AdGuard), fall back to overlay
  if (!tab) {
    window.dispatchEvent(
      new CustomEvent(OPEN_DATA_VIEW_EVENT, { detail: payload }),
    );
  }
}

/**
 * Read the stored payload (called by the standalone /dataview tab on mount).
 * Data stays in localStorage so refreshing the tab still works.
 * It is overwritten the next time the user exports a different report.
 */
export function consumeDataViewPayload(): DataViewPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DataViewPayload;
  } catch {
    return null;
  }
}
