/**
 * Unified Data Service - API ONLY
 * This service requires a running backend server
 */

const API_BASE_URL =
  typeof window !== "undefined"
    ? "/api"
    : process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";
import { isSoftwareLikeCategory } from '@/config/constants';
import {
  Asset,
  MaintenanceRecord,
  AssetHistory,
  LicenseAllocation,
  User,
  Vendor,
  Category,
  AuditLog,
} from '@/types';

export interface NotificationLog {
  id: number | string;
  category: "MAINTENANCE" | "LICENSE" | "ANOMALY" | "SYSTEM_AUDIT";
  type:
  | "REMINDER"
  | "OVERDUE"
  | "OVERDUE_CATCHUP"
  | "ACTION_TODAY"
  | "UPCOMING"
  | "LICENSE_EXPIRY"
  | "TROUBLESHOOT"
  | "HOARDER"
  | "LEMON"
  | "SOFTWARE_DUPLICATE"
  | "GHOST_ASSET"
  | "CREATE"
  | "DELETE"
  | "STATUS_CHANGE";
  assetId: string;
  maintenanceId?: number | string;
  assetCode?: string;
  assetName: string;
  targetDate?: string;
  sentAt: string;
  recipient: string;
  recipientType?: string;
  technicianEmail?: string;
  milestoneAction?:
  | "LICENSE_EXPIRY_30D"
  | "LICENSE_EXPIRY_7D"
  | "LICENSE_EXPIRY_1D"
  | null;
  milestoneLabel?: string | null;
  milestoneDays?: number | null;
  licenseExpiryDate?: string | null;
  anomalyMeta?: Record<string, unknown> | null;
}

export interface PendingAnomalyAlert {
  id: number;
  anomalyType:
  | "HOARDER"
  | "LEMON"
  | "SOFTWARE_DUPLICATE"
  | "GHOST_ASSET"
  | string
  | null;
  title: string;
  message?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt: string;
  scheduledFor: string;
  allocatedBy?: string | null;
}

export interface InAppNotification {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  linkPath?: string;
  assetId?: number | null;
  createdAt: string;
}

export interface NotificationControlSettings {
  enableEmailNotifications: boolean;
  enableManualDispatch: boolean;
  enableLocationAllocation: boolean;
  enableActiveTimeWindow: boolean;
  activeHoursStart: string;
  activeHoursEnd: string;
  activeHoursTimezone: string;
  enableMaintenanceAlerts: boolean;
  enableLicenseExpiryAlerts: boolean;
  enableAnomalyAlerts: boolean;
  enableHoarderAlerts: boolean;
  enableLemonAlerts: boolean;
  enableSoftwareDuplicateAlerts: boolean;
  enableGhostAssetAlerts: boolean;
  hoarderAlertStep: number;
  softwareDuplicateAlertStep: number;
  lemonAlertCount: number;
  lemonAlertWindowDays: number;
  ghostAssetDormantDays: number;
  enableUserCreationAlerts: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
}

export const DEFAULT_NOTIFICATION_CONTROL_SETTINGS: NotificationControlSettings =
{
  enableEmailNotifications: true,
  enableManualDispatch: true,
  enableLocationAllocation: true,
  enableActiveTimeWindow: false,
  activeHoursStart: "08:00",
  activeHoursEnd: "18:00",
  activeHoursTimezone: "",
  enableMaintenanceAlerts: true,
  enableLicenseExpiryAlerts: true,
  enableAnomalyAlerts: true,
  enableHoarderAlerts: true,
  enableLemonAlerts: true,
  enableSoftwareDuplicateAlerts: true,
  enableGhostAssetAlerts: true,
  enableUserCreationAlerts: true,
  hoarderAlertStep: 3,
  softwareDuplicateAlertStep: 2,
  lemonAlertCount: 3,
  lemonAlertWindowDays: 14,
  ghostAssetDormantDays: 365,
  smtpHost: "",
  smtpPort: "",
  smtpUser: "",
  smtpPassword: "",
};

const normalizeControlNumber = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) => {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
};

const normalizeControlTime = (value: unknown, fallback: string) => {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed) ? trimmed : fallback;
};

const normalizeControlTimezone = (value: unknown, fallback: string) => {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
};

const normalizeNotificationControlSettings = (
  value: Partial<NotificationControlSettings> | null | undefined,
): NotificationControlSettings => {
  const source = value && typeof value === "object" ? value : {};

  return {
    enableEmailNotifications:
      source.enableEmailNotifications !== undefined
        ? Boolean(source.enableEmailNotifications)
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableEmailNotifications,
    enableManualDispatch:
      source.enableManualDispatch !== undefined
        ? Boolean(source.enableManualDispatch)
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableManualDispatch,
    enableLocationAllocation:
      source.enableLocationAllocation !== undefined
        ? Boolean(source.enableLocationAllocation)
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableLocationAllocation,
    enableActiveTimeWindow:
      source.enableActiveTimeWindow !== undefined
        ? Boolean(source.enableActiveTimeWindow)
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableActiveTimeWindow,
    activeHoursStart: normalizeControlTime(
      source.activeHoursStart,
      DEFAULT_NOTIFICATION_CONTROL_SETTINGS.activeHoursStart,
    ),
    activeHoursEnd: normalizeControlTime(
      source.activeHoursEnd,
      DEFAULT_NOTIFICATION_CONTROL_SETTINGS.activeHoursEnd,
    ),
    activeHoursTimezone: normalizeControlTimezone(
      source.activeHoursTimezone,
      DEFAULT_NOTIFICATION_CONTROL_SETTINGS.activeHoursTimezone,
    ),
    enableMaintenanceAlerts:
      source.enableMaintenanceAlerts !== undefined
        ? Boolean(source.enableMaintenanceAlerts)
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableMaintenanceAlerts,
    enableLicenseExpiryAlerts:
      source.enableLicenseExpiryAlerts !== undefined
        ? Boolean(source.enableLicenseExpiryAlerts)
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableLicenseExpiryAlerts,
    enableAnomalyAlerts:
      source.enableAnomalyAlerts !== undefined
        ? Boolean(source.enableAnomalyAlerts)
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableAnomalyAlerts,
    enableHoarderAlerts:
      source.enableHoarderAlerts !== undefined
        ? Boolean(source.enableHoarderAlerts)
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableHoarderAlerts,
    enableLemonAlerts:
      source.enableLemonAlerts !== undefined
        ? Boolean(source.enableLemonAlerts)
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableLemonAlerts,
    enableSoftwareDuplicateAlerts:
      source.enableSoftwareDuplicateAlerts !== undefined
        ? Boolean(source.enableSoftwareDuplicateAlerts)
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableSoftwareDuplicateAlerts,
    enableGhostAssetAlerts:
      source.enableGhostAssetAlerts !== undefined
        ? Boolean(source.enableGhostAssetAlerts)
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableGhostAssetAlerts,
    enableUserCreationAlerts:
      source.enableUserCreationAlerts !== undefined
        ? Boolean(source.enableUserCreationAlerts)
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.enableUserCreationAlerts,
    hoarderAlertStep: normalizeControlNumber(
      source.hoarderAlertStep,
      DEFAULT_NOTIFICATION_CONTROL_SETTINGS.hoarderAlertStep,
      1,
      100,
    ),
    softwareDuplicateAlertStep: normalizeControlNumber(
      source.softwareDuplicateAlertStep,
      DEFAULT_NOTIFICATION_CONTROL_SETTINGS.softwareDuplicateAlertStep,
      2,
      100,
    ),
    lemonAlertCount: normalizeControlNumber(
      source.lemonAlertCount,
      DEFAULT_NOTIFICATION_CONTROL_SETTINGS.lemonAlertCount,
      2,
      100,
    ),
    lemonAlertWindowDays: normalizeControlNumber(
      source.lemonAlertWindowDays,
      DEFAULT_NOTIFICATION_CONTROL_SETTINGS.lemonAlertWindowDays,
      1,
      365,
    ),
    ghostAssetDormantDays: normalizeControlNumber(
      source.ghostAssetDormantDays,
      DEFAULT_NOTIFICATION_CONTROL_SETTINGS.ghostAssetDormantDays,
      30,
      3650,
    ),
    smtpHost:
      source.smtpHost !== undefined
        ? String(source.smtpHost)
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.smtpHost,
    smtpPort:
      source.smtpPort !== undefined
        ? String(source.smtpPort)
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.smtpPort,
    smtpUser:
      source.smtpUser !== undefined
        ? String(source.smtpUser)
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.smtpUser,
    smtpPassword:
      source.smtpPassword !== undefined
        ? String(source.smtpPassword)
        : DEFAULT_NOTIFICATION_CONTROL_SETTINGS.smtpPassword,
  };
};

// =============================================
// HELPERS
// =============================================

const getCurrentUserId = () => {
  if (typeof window !== "undefined") {
    const sessionData =
      sessionStorage.getItem("inventoryAuth") ||
      localStorage.getItem("inventoryAuth");
    if (sessionData) {
      try {
        const { employeeId } = JSON.parse(sessionData);
        return employeeId;
      } catch {
        // Invalid session data — ignore
      }
    }
  }
  return "SYSTEM"; // Default fallback
};

const getAuthToken = (): string | null => {
  if (typeof window !== "undefined") {
    return (
      sessionStorage.getItem("inventoryToken") ||
      localStorage.getItem("inventoryToken") ||
      null
    );
  }
  return null;
};

let isGlobalViewerMode = false;

export const setViewerMode = (enabled: boolean) => {
  isGlobalViewerMode = enabled;
};

const getHeaders = (includeContentType = true) => {
  const headers: Record<string, string> = {
    "X-User-ID": getCurrentUserId(),
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
  };
  if (isGlobalViewerMode) {
    headers["X-Viewer-Mode"] = "true";
  }
  if (includeContentType) headers["Content-Type"] = "application/json";
  const token = getAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
};

const handleResponse = async (response: Response, endpoint?: string) => {
  if (response.status === 401) {
    const isLoginEndpoint = endpoint?.includes("/auth/login");
    if (!isLoginEndpoint && typeof window !== "undefined") {
      localStorage.removeItem("inventoryAuth");
      localStorage.removeItem("inventoryToken");
      sessionStorage.removeItem("inventoryAuth");
      sessionStorage.removeItem("inventoryToken");
      window.location.href = "/auth/sign-in";
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const details = errorData.errors
      ? ": " + errorData.errors.map((e: any) => e.message).join(", ")
      : "";
    throw new Error(
      (errorData.message || `API Error: ${response.statusText}`) + details,
    );
  }
  return response.json();
};

const pendingRequests = new Map<string, Promise<any>>();

// API Circuit Breaker: Prevents massive console error spam when the API server goes down
let isApiOffline = false;
let apiOfflineSince = 0;
const OFFLINE_RETRY_INTERVAL = 10000; // 10 seconds
let activePingPromise: Promise<boolean> | null = null;

async function fetchWithCircuitBreaker(url: string, options: RequestInit): Promise<Response> {
  const optsWithCreds: RequestInit = {
    ...options,
    credentials: "include",
  };

  if (isApiOffline) {
    if (Date.now() - apiOfflineSince > OFFLINE_RETRY_INTERVAL) {
      if (!activePingPromise) {
        activePingPromise = fetch(`${API_BASE_URL}/health`, { method: "HEAD", credentials: "include" })
          .then(res => res.status < 500)
          .catch(() => false)
          .finally(() => {
            activePingPromise = null;
          });
      }
      const isOnline = await activePingPromise;
      if (isOnline) {
        isApiOffline = false;
      } else {
        apiOfflineSince = Date.now();
        throw new Error("API Error: Internal Server Error (Offline)");
      }
    } else {
      throw new Error("API Error: Internal Server Error (Offline)");
    }
  }

  try {
    const res = await fetch(url, optsWithCreds);
    if (res.status >= 500) {
      isApiOffline = true;
      apiOfflineSince = Date.now();
    } else {
      isApiOffline = false;
    }
    return res;
  } catch (err: any) {
    isApiOffline = true;
    apiOfflineSince = Date.now();
    throw err;
  }
}

// API Client - throws errors if backend is unavailable
const apiClient = {
  get: (endpoint: string) => {
    if (pendingRequests.has(endpoint)) {
      return pendingRequests.get(endpoint)!;
    }
    const req = fetchWithCircuitBreaker(`${API_BASE_URL}${endpoint}`, {
      headers: getHeaders(false),
    })
      .then((res) => handleResponse(res, endpoint))
      .finally(() => {
        pendingRequests.delete(endpoint);
      });
    pendingRequests.set(endpoint, req);
    return req;
  },
  post: (endpoint: string, data: any) =>
    fetchWithCircuitBreaker(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse(res, endpoint)),
  postForm: (endpoint: string, formData: FormData) =>
    fetchWithCircuitBreaker(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: getHeaders(false),
      body: formData,
    }).then((res) => handleResponse(res, endpoint)),
  putForm: (endpoint: string, formData: FormData) =>
    fetchWithCircuitBreaker(`${API_BASE_URL}${endpoint}`, {
      method: "PUT",
      headers: getHeaders(false),
      body: formData,
    }).then((res) => handleResponse(res, endpoint)),
  put: (endpoint: string, data: any) =>
    fetchWithCircuitBreaker(`${API_BASE_URL}${endpoint}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse(res, endpoint)),
  delete: (endpoint: string) =>
    fetchWithCircuitBreaker(`${API_BASE_URL}${endpoint}`, {
      method: "DELETE",
      headers: getHeaders(false),
    }).then((res) => handleResponse(res, endpoint)),
  patch: (endpoint: string, data: any) =>
    fetchWithCircuitBreaker(`${API_BASE_URL}${endpoint}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => handleResponse(res, endpoint)),
};

// Helper to normalize backend data to frontend types
const normalizeAsset = (asset: any): Asset => {
  if (!asset) return asset;

  // The API may return assetType as a nested { categoryName, typeName } object
  // (from Prisma include). Flatten it into the flat fields the frontend expects.
  const nestedType = asset.assetType && typeof asset.assetType === "object"
    ? asset.assetType as { categoryName?: string; typeName?: string }
    : null;

  // Vendor may be nested { vendorName } from Prisma include
  const nestedVendor = asset.vendor && typeof asset.vendor === "object"
    ? asset.vendor as { vendorName?: string }
    : null;

  // Active allocation may be nested from Prisma include (allocations array)
  const activeAlloc = Array.isArray(asset.allocations) ? asset.allocations[0] : null;
  const allocEmployee = activeAlloc?.employee;

  return {
    ...asset,
    id: String(asset.id),
    // Flatten assetType relation → flat string fields
    category: nestedType?.categoryName ?? asset.category ?? "",
    assetType: nestedType?.typeName ?? (typeof asset.assetType === "string" ? asset.assetType : ""),
    // Flatten vendor relation → vendorName string
    vendorName: nestedVendor?.vendorName ?? asset.vendorName ?? "",
    // Flatten allocation relation → employeeId / userName / installationLocation
    employeeId: activeAlloc?.employeeId
      ? String(activeAlloc.employeeId)
      : (asset.employeeId ? String(asset.employeeId) : null),
    userName: allocEmployee?.fullName ?? asset.userName ?? null,
    installationLocation: activeAlloc?.installationLocation ?? asset.installationLocation ?? null,
    // Existing normalisations
    vendorId: asset.vendorId ? String(asset.vendorId) : asset.vendorId,
    parentAssetId: asset.parentAssetId ? Number(asset.parentAssetId) : null,
    bulkOrderParentId: asset.bulkOrderParentId ? String(asset.bulkOrderParentId) : null,
  };
};


const normalizeMaintenance = (record: any): MaintenanceRecord => {
  if (!record) return record;
  return {
    ...record,
    id: String(record.id),
    assetId: String(record.assetId),
  };
};

const normalizeLicenseAllocation = (alloc: any): LicenseAllocation => {
  if (!alloc) return alloc;
  return {
    ...alloc,
    id: String(alloc.id),
    assetId: String(alloc.assetId),
    parentAssetId: alloc.parentAssetId ? Number(alloc.parentAssetId) : null,
    targetUnitId: alloc.targetUnitId ? String(alloc.targetUnitId) : null,
  };
};

const parseObjectValue = (value: unknown): Record<string, unknown> | null => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore malformed payloads and fallback to null.
    }
  }

  return null;
};

const normalizeAnomalyMeta = (
  value: unknown,
): Record<string, unknown> | null => {
  const parsed = parseObjectValue(value);
  if (!parsed) {
    return null;
  }

  const normalized: Record<string, unknown> = { ...parsed };

  if (
    normalized.daysSinceLast == null &&
    normalized.daysSinceLastRepair != null
  ) {
    normalized.daysSinceLast = normalized.daysSinceLastRepair;
  }

  if (normalized.daysDormant == null && normalized.dormantDays != null) {
    normalized.daysDormant = normalized.dormantDays;
  }

  return normalized;
};

// =============================================
// DATA SERVICE
// =============================================

let cachedControlSettings: NotificationControlSettings | null = null;
let controlSettingsFetchPromise: Promise<NotificationControlSettings> | null =
  null;
let lastControlSettingsFetchTime = 0;
const CONTROL_SETTINGS_CACHE_TTL = 30000;

export const dataService = {
  setViewerMode,

  // =============================================
  // SYNC
  // =============================================

  async getSyncStatus(): Promise<{
    assets: string | null;
    allocations: string | null;
    maintenance: string | null;
    history: string | null;
    users: string | null;
  }> {
    if ((this as any)._syncStatusPromise) return (this as any)._syncStatusPromise;
    const promise = apiClient.get("/sync/status").then((result) => {
      setTimeout(() => { (this as any)._syncStatusPromise = null; }, 500);
      return result.data;
    }).catch(err => {
      (this as any)._syncStatusPromise = null;
      throw err;
    });
    (this as any)._syncStatusPromise = promise;
    return promise;
  },

  // =============================================
  // AUTHENTICATION
  // =============================================

  async authenticateUser(
    employeeId: string,
    password: string,
  ): Promise<{
    success: boolean;
    user?: User;
    token?: string;
    message?: string;
  }> {
    try {
      const result = await apiClient.post("/auth/login", {
        employeeId,
        password,
      });
      return {
        success: true,
        user: result.data,
        token: result.data?.token,
      };
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Authentication failed";
      return {
        success: false,
        message: msg,
      };
    }
  },

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.message || "Failed to send reset email");
    return data;
  },

  async validateResetToken(
    token: string,
  ): Promise<{ employeeId: string; fullName: string }> {
    const response = await fetch(
      `${API_BASE_URL}/auth/reset-password/validate?token=${encodeURIComponent(token)}`,
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.message || "Invalid or expired reset link");
    return data.data;
  },

  async resetPassword(
    token: string,
    password: string,
  ): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.message || "Failed to reset password");
    return data;
  },

  // =============================================
  // ASSETS
  // =============================================

  async getAssets(filters?: {
    category?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    includePersonal?: boolean;
  }): Promise<{ data: Asset[]; pagination: any; userRole?: string; userCategories?: string[] }> {
    const params = new URLSearchParams();
    if (filters?.category) params.append("category", filters.category);
    if (filters?.status) params.append("status", filters.status);
    if (filters?.search) params.append("search", filters.search);
    if (filters?.page) params.append("page", filters.page.toString());
    if (filters?.limit) params.append("limit", filters.limit.toString());
    if (filters?.includePersonal) params.append("includePersonal", "true");

    const result = await apiClient.get(`/assets?${params.toString()}`);
    const rawList = Array.isArray(result) ? result : (result?.assets || result?.data || []);
    const dataList = Array.isArray(rawList) ? rawList.map(normalizeAsset) : [];
    if (result?.pagination) {
      return {
        data: dataList,
        pagination: result.pagination,
        userRole: result.userRole,
        userCategories: result.userCategories,
      };
    }
    return {
      data: dataList,
      pagination: {
        page: 1,
        limit: 10000,
        total: dataList.length,
        totalPages: 1,
      },
      userRole: result?.userRole,
      userCategories: result?.userCategories,
    };
  },

  async getAsset(id: string): Promise<Asset | null> {
    const result = await apiClient.get(`/assets/${id}`);
    return result.data ? normalizeAsset(result.data) : null;
  },

  async createAsset(asset: Partial<Asset>): Promise<Asset> {
    const quantity = asset.totalQuantity || 1;
    // When quantity > 1, use the bulk endpoint to create parent + individual child rows
    if (quantity > 1) {
      const result = await apiClient.post("/assets/bulk", asset);
      // Bulk endpoint returns { parentId, childIds } — refetch the parent for full data
      const parentId = result.parentId || result.data?.parentId;
      if (parentId) {
        const parent = await apiClient.get(`/assets/${parentId}`);
        return normalizeAsset(parent.data);
      }
      return normalizeAsset(result.data || result);
    }
    const result = await apiClient.post("/assets", asset);
    return normalizeAsset(result.data);
  },

  async bulkCreateAssets(
    assets: Array<{
      assetCode: string;
      assetName: string;
      category: string;
      assetType: string;
      totalQuantity: number;
      vendorCode?: string;
      vendorName?: string;
      invoiceNumber?: string;
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
    }>,
  ): Promise<{
    created: number;
    unitsCreated: number;
    skipped: number;
    errors: string[];
  }> {
    const result = await apiClient.post("/assets/bulk-import", { assets });
    // The bulk-import route returns the result directly (no .data wrapper)
    return result;
  },

  async updateAsset(id: string, updates: Partial<Asset>): Promise<Asset> {
    const result = await apiClient.put(`/assets/${id}`, updates);
    return normalizeAsset(result.data);
  },

  async uploadImportBill(
    file: File,
    documentId?: string,
  ): Promise<{ url: string; blobName?: string }> {
    const formData = new FormData();
    formData.append("file", file);
    if (documentId) {
      const result = await apiClient.putForm(
        `/documents/${documentId}`,
        formData,
      );
      return result;
    }
    const result = await apiClient.postForm("/documents", formData);
    return result;
  },

  async deleteAsset(
    id: string,
    reason?: string,
    condition?: string,
  ): Promise<void> {
    const params = new URLSearchParams();
    if (reason) params.append("reason", reason);
    if (condition) params.append("condition", condition);
    const queryStr = params.toString();
    const url = `/assets/${id}${queryStr ? `?${queryStr}` : ""}`;
    await apiClient.delete(url);
  },

  async updateAllocation(
    assetId: string,
    updates: {
      ipAddress?: string;
      operatingSystem?: string;
      installationLocation?: string;
    },
  ): Promise<void> {
    await apiClient.put(`/assets/${assetId}/allocation`, updates);
  },

  async disposeAsset(
    assetId: string,
    data: {
      disposalDate: string;
      reason: string;
      condition?: string;
      disposedBy?: string;
    },
  ): Promise<void> {
    await apiClient.post("/assets/dispose", {
      assetId: parseInt(assetId),
      disposalDate: data.disposalDate,
      reason: data.reason,
      condition: data.condition || "POOR",
      disposedBy: data.disposedBy || getCurrentUserId(),
    });
  },

  async bulkDisposeAssets(
    assetIds: string[],
    data: {
      disposalDate: string;
      reason: string;
      condition?: string;
      disposedBy?: string;
    },
  ): Promise<void> {
    await apiClient.post("/assets/bulk-dispose", {
      assetIds: assetIds.map((id) => parseInt(id)),
      disposalDate: data.disposalDate,
      reason: data.reason,
      condition: data.condition || "POOR",
      disposedBy: data.disposedBy || getCurrentUserId(),
    });
  },

  async bulkDeleteAssets(
    assetIds: string[],
    reason?: string,
    condition?: string,
  ): Promise<void> {
    await apiClient.post("/assets/bulk-delete", {
      assetIds: assetIds.map((id) => parseInt(id)),
      reason: reason || "",
      condition: condition || "POOR",
    });
  },

  async bulkUpdateAssets(
    assetIds: string[],
    updates: Partial<Asset>,
  ): Promise<void> {
    await apiClient.post("/assets/bulk-update", {
      assetIds: assetIds.map((id) => parseInt(id)),
      updates,
    });
  },

  async addUnitsToParent(
    parentId: string,
    count: number,
    unitPrice?: number,
  ): Promise<{ childIds: string[] }> {
    const result = await apiClient.post(`/assets/${parentId}/add-units`, {
      count,
      unitPrice,
    });
    return result.data;
  },

  // =============================================
  // MAINTENANCE
  // =============================================

  async getMaintenance(filters?: {
    status?: string;
    assetId?: string;
  }): Promise<MaintenanceRecord[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append("status", filters.status);
    if (filters?.assetId) params.append("assetId", filters.assetId);

    const result = await apiClient.get(`/maintenance?${params.toString()}`);
    const rawList = Array.isArray(result) ? result : (result?.maintenance || result?.records || result?.data || []);
    return Array.isArray(rawList) ? rawList.map(normalizeMaintenance) : [];
  },

  async getMaintenanceById(id: string): Promise<MaintenanceRecord> {
    const result = await apiClient.get(`/maintenance/${id}`);
    return normalizeMaintenance(result.data);
  },

  async createMaintenance(
    data: Partial<MaintenanceRecord>,
  ): Promise<MaintenanceRecord> {
    const result = await apiClient.post("/maintenance", data);
    return normalizeMaintenance(result.data);
  },

  async createBulkMaintenance(data: {
    bulkParentId: string | number;
    scheduledDate: string;
    description: string;
    status?: string;
    completionDate?: string | null;
    technician?: string | null;
    cost?: number | null;
    notes?: string | null;
    frequency?: string | null;
    skipAssetIds?: (string | number)[];
  }): Promise<MaintenanceRecord & { _backendMessage?: string }> {
    const result = await apiClient.post("/maintenance/bulk", {
      ...data,
      bulkParentId: parseInt(String(data.bulkParentId)),
      skipAssetIds: (data.skipAssetIds || []).map((id) => parseInt(String(id))),
    });
    const record = normalizeMaintenance(result.data);
    // Attach the backend message (contains skip count info) for the toast
    return { ...record, _backendMessage: result.message || undefined };
  },

  async updateMaintenance(
    id: string,
    updates: Partial<MaintenanceRecord>,
  ): Promise<MaintenanceRecord> {
    const result = await apiClient.put(`/maintenance/${id}`, updates);
    const updated = normalizeMaintenance(result.data);
    // If the backend auto-renewed a recurring maintenance, attach it
    if (result.renewed) {
      return { ...updated, renewed: normalizeMaintenance(result.renewed) };
    }
    return updated;
  },

  async deleteMaintenance(id: string): Promise<void> {
    await apiClient.delete(`/maintenance/${id}`);
  },

  async reportIssue(assetId: string, reason: string): Promise<void> {
    await apiClient.post("/troubleshoot", { assetId, reason });
  },

  // =============================================
  // USERS
  // =============================================

  async getUsers(): Promise<User[]> {
    const result = await apiClient.get("/users");
    const rawList = Array.isArray(result) ? result : (result?.users || result?.data || []);
    return Array.isArray(rawList) ? rawList : [];
  },

  async createUser(data: {
    employeeId: string;
    fullName: string;
    department?: string;
    email?: string;
    password?: string;
    role?: string;
    managedCategories?: string[];
  }): Promise<User> {
    const result = await apiClient.post("/users", data);
    return result.data;
  },

  async updateUser(
    employeeId: string,
    data: {
      fullName?: string;
      department?: string;
      email?: string;
      role?: string;
      managedCategories?: string[];
    },
  ): Promise<User> {
    const result = await apiClient.put(`/users/${employeeId}`, data);
    return result.data;
  },

  async deleteUser(employeeId: string): Promise<void> {
    await apiClient.delete(`/users/${employeeId}`);
  },

  async setUserPassword(employeeId: string, password: string): Promise<void> {
    await apiClient.put(`/users/${employeeId}/set-password`, { password });
  },

  async toggleUserBlock(employeeId: string): Promise<{ isBlocked: boolean }> {
    const result = await apiClient.patch(
      `/users/${employeeId}/toggle-block`,
      {},
    );
    return result.data;
  },

  async bulkCreateUsers(
    users: Array<{
      employeeId: string;
      fullName: string;
      department?: string;
      email?: string;
      password: string;
      role?: string;
    }>,
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    const result = await apiClient.post("/users/bulk", { users });
    return result.data;
  },

  // =============================================
  // VENDORS
  // =============================================

  async getVendors(): Promise<Vendor[]> {
    const result = await apiClient.get("/vendors");
    const rawList = Array.isArray(result) ? result : (result?.vendors || result?.data || []);
    return Array.isArray(rawList) ? rawList : [];
  },

  async createVendor(data: {
    vendorId: string;
    vendorName: string;
  }): Promise<Vendor> {
    const result = await apiClient.post("/vendors", data);
    return result.data;
  },

  async updateVendor(id: string, vendorName: string): Promise<Vendor> {
    const result = await apiClient.put(`/vendors/${id}`, { vendorName });
    return result.data;
  },

  async deleteVendor(id: string): Promise<void> {
    await apiClient.delete(`/vendors/${id}`);
  },

  async toggleVendorBlock(id: string): Promise<{ isBlocked: boolean }> {
    const result = await apiClient.patch(`/vendors/${id}/toggle-block`, {});
    return result.data;
  },

  async bulkCreateVendors(
    vendors: Array<{
      vendorId: string;
      vendorName: string;
    }>,
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    const result = await apiClient.post("/vendors/bulk", { vendors });
    return result.data;
  },

  // =============================================
  // CATEGORIES
  // =============================================

  async getCategories(): Promise<Category[]> {
    const result = await apiClient.get("/categories");
    const rawList = Array.isArray(result) ? result : (result?.categories || result?.data || []);
    return Array.isArray(rawList) ? rawList : [];
  },

  async getAssetTypes(
    categoryId: string,
  ): Promise<{ value: string; label: string }[]> {
    const result = await apiClient.get(`/asset-types/${categoryId}`);
    const rawList = Array.isArray(result) ? result : (result?.assetTypes || result?.data || []);
    return Array.isArray(rawList) ? rawList : [];
  },

  // =============================================
  // HISTORY
  // =============================================

  async getAssetHistory(
    assetId?: string,
    employeeId?: string,
    includeChain?: boolean,
    options?: { limit?: number; offset?: number },
  ): Promise<AssetHistory[]> {
    const params = new URLSearchParams();
    if (assetId) params.append("assetId", assetId);
    if (employeeId) params.append("employeeId", employeeId);
    if (includeChain) params.append("includeChain", "true");
    if (options?.limit !== undefined) {
      params.append("limit", String(options.limit));
    }
    if (options?.offset !== undefined) {
      params.append("offset", String(options.offset));
    }

    const result = await apiClient.get(`/history?${params.toString()}`);
    const rawList = Array.isArray(result) ? result : (result?.history || result?.data || []);
    return Array.isArray(rawList) ? rawList : [];
  },

  // =============================================
  // ALLOCATIONS
  // =============================================

  async getLicenseAllocations(assetId?: string): Promise<LicenseAllocation[]> {
    // Use limit=10000 to avoid the server's default 50-record cap cutting off
    // historical data for active assets when opening the unit detail modal
    const params = assetId ? `?assetId=${assetId}&limit=10000` : "?limit=10000";
    const result = await apiClient.get(`/licenses${params}`);
    const rawList = Array.isArray(result) ? result : (result?.licenses || result?.allocations || result?.data || []);
    return Array.isArray(rawList)
      ? rawList.map(normalizeLicenseAllocation)
      : [];
  },

  async allocate(
    assetId: string,
    category: string,
    params: {
      employeeId?: string | null;
      parentAssetId?: string | number | null;
      quantity?: number;
      notes?: string;
      conditionAtAllocation?: string;
      installationLocation?: string;
      serialNumber?: string;
      targetUnitId?: string;
      ipAddress?: string;
      macAddress?: string;
      operatingSystem?: string;
    },
  ): Promise<LicenseAllocation> {
    const isSoftware = isSoftwareLikeCategory(category);
    const endpoint = isSoftware
      ? "/assets/allocate-license"
      : "/assets/allocate";

    const result = await apiClient.post(endpoint, {
      assetId,
      employeeId: params.employeeId || null,
      parentAssetId: params.parentAssetId || null,
      [isSoftware ? "licenseCount" : "quantity"]: params.quantity || 1,
      assignedBy: getCurrentUserId(),
      notes: params.notes,
      condition: params.conditionAtAllocation || "GOOD",
      installationLocation: params.installationLocation,
      serialNumber: params.serialNumber,
      targetUnitId: params.targetUnitId,
      ipAddress: params.ipAddress,
      ...(isSoftware ? {} : { macAddress: params.macAddress }),
      ...(isSoftware ? {} : { operatingSystem: params.operatingSystem }),
    });

    return normalizeLicenseAllocation(
      result.data || { id: Date.now().toString() },
    );
  },

  async bulkAllocate(
    assetId: string,
    category: string,
    allocationsData: Array<{
      employeeId?: string | null;
      parentAssetId?: string | number | null;
      quantity?: number;
      notes?: string;
      conditionAtAllocation?: string;
      installationLocation?: string;
      serialNumber?: string;
      targetUnitId?: string;
      ipAddress?: string;
      macAddress?: string;
      operatingSystem?: string;
    }>,
  ): Promise<LicenseAllocation[]> {
    const isSoftware = isSoftwareLikeCategory(category);
    const assignedBy = getCurrentUserId();

    const allocations = allocationsData.map((params) => ({
      assetId,
      employeeId: params.employeeId || null,
      parentAssetId: params.parentAssetId || null,
      [isSoftware ? "licenseCount" : "quantity"]: params.quantity || 1,
      assignedBy,
      notes: params.notes,
      condition: params.conditionAtAllocation || "GOOD",
      installationLocation: params.installationLocation,
      serialNumber: params.serialNumber,
      targetUnitId: params.targetUnitId,
      ipAddress: params.ipAddress,
      isLicense: isSoftware,
      ...(isSoftware ? {} : { macAddress: params.macAddress }),
      ...(isSoftware ? {} : { operatingSystem: params.operatingSystem }),
    }));

    const result = await apiClient.post("/assets/bulk-allocate", {
      allocations,
    });
    const arr = Array.isArray(result.data)
      ? result.data.map((d: any) => normalizeLicenseAllocation(d))
      : [];
    if (result.message) {
      (arr as any)._backendMessage = result.message;
    }
    return arr;
  },

  async revokeAllocation(
    allocationId: string,
    notes?: string,
    conditionAtReturn?: string,
  ): Promise<void> {
    await apiClient.post("/assets/return", {
      allocationId,
      conditionAtReturn: conditionAtReturn || "GOOD",
      returnedBy: getCurrentUserId(),
      notes: notes || "Allocation revoked",
    });
  },

  async bulkRevokeAllocation(
    allocations: Array<{
      allocationId: string | number;
      notes?: string;
      conditionAtReturn: string;
    }>,
  ): Promise<void> {
    await apiClient.post("/assets/bulk-return", {
      allocations,
    });
  },

  // =============================================
  // AUDIT LOGS
  // =============================================

  async getAuditLogs(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    tableName?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{
    data: AuditLog[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
    filters: {
      tableNames: string[];
      actions: string[];
    };
  }> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set("page", String(params.page));
    if (params?.pageSize) queryParams.set("pageSize", String(params.pageSize));
    if (params?.search) queryParams.set("search", params.search);
    if (params?.tableName) queryParams.set("tableName", params.tableName);
    if (params?.action) queryParams.set("action", params.action);
    if (params?.startDate) queryParams.set("startDate", params.startDate);
    if (params?.endDate) queryParams.set("endDate", params.endDate);

    const qs = queryParams.toString();
    const result = await apiClient.get(`/audit-logs${qs ? `?${qs}` : ""}`);
    return {
      data: Array.isArray(result.data)
        ? result.data.map((log: any) => ({
          id: String(log.id),
          table: log.tableName,
          recordId: log.recordId,
          action: log.action,
          oldValue: log.oldValue,
          newValue: log.newValue,
          performedBy: log.performedBy,
          performedByName: log.performedByName || null,
          date: log.date,
          additionalInfo: log.additionalInfo,
          assetName: log.assetName || null,
          assetCode: log.assetCode || null,
          targetUserName: log.targetUserName || null,
          targetVendorName: log.targetVendorName || null,
        }))
        : [],
      pagination: result.pagination || {
        page: 1,
        pageSize: 50,
        total: 0,
        totalPages: 0,
      },
      filters: result.filters || { tableNames: [], actions: [] },
    };
  },

  async clearAuditLogs(months: number): Promise<{ message: string }> {
    const result = await apiClient.delete(`/audit-logs/clear?months=${months}`);
    return result;
  },

  async getAuditLogExports(): Promise<
    {
      filename: string;
      originalName: string;
      createdAt: string;
      size: number;
    }[]
  > {
    const result = await apiClient.get("/audit-logs/exports");
    const payload = result.data;
    return Array.isArray(payload)
      ? payload.map((item: any) => ({
        filename: item.filename,
        originalName: item.originalName || item.filename,
        createdAt: item.createdAt,
        size: item.size,
      }))
      : [];
  },

  async getAuditLogExportCsv(filename: string): Promise<string> {
    const response = await fetch(
      `${API_BASE_URL}/audit-logs/exports/${encodeURIComponent(filename)}`,
      {
        method: "GET",
        headers: getHeaders(false),
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(
        `Failed to fetch audit export file: ${errorText || response.statusText}`,
      );
    }

    return response.text();
  },

  async testSmtp(config: {
    host: string;
    port: string;
    user: string;
    pass: string;
  }): Promise<{ message: string }> {
    const result = await apiClient.post("/audit-logs/test-smtp", config);
    return result;
  },

  // ==========================================
  // Notifications & Settings
  // ==========================================
  async getNotificationLogs(): Promise<{
    logs: NotificationLog[];
    adminEmails: string;
    managerEmails: string;
    adminNames: string;
  }> {
    const result = await apiClient.get("/notifications");
    const logs = Array.isArray(result.data)
      ? result.data.map((log: any) => {
        const anomalyMeta = normalizeAnomalyMeta(log?.anomalyMeta);
        const recipientType =
          typeof log?.recipientType === "string" && log.recipientType.trim()
            ? log.recipientType.trim()
            : "Admin";
        const rawRecipient =
          typeof log?.recipient === "string" && log.recipient.trim()
            ? log.recipient.trim()
            : recipientType;

        // Consider an anomaly suppressed if suppression metadata exists in the anomaly payload
        const isSuppressed = Boolean(
          anomalyMeta?.suppressedBy ||
          (log as any).SuppressedBy ||
          (log as any).suppressedBy,
        );
        const isMerged = Boolean(
          anomalyMeta?.mergedBy || (log as any).mergedBy,
        );
        const finalRecipientType = isSuppressed
          ? "Suppressed"
          : isMerged
            ? "Merged"
            : recipientType;
        const finalRecipient = isSuppressed
          ? anomalyMeta?.suppressedBy || (log as any).SuppressedBy
          : isMerged
            ? anomalyMeta?.mergedBy || (log as any).mergedBy
            : rawRecipient;

        const metaAssetCode =
          typeof anomalyMeta?.assetCode === "string"
            ? anomalyMeta.assetCode
            : undefined;
        const metaAssetName =
          typeof anomalyMeta?.assetName === "string"
            ? anomalyMeta.assetName
            : undefined;

        return {
          ...log,
          assetCode: log?.assetCode || metaAssetCode,
          assetName: log?.assetName || metaAssetName || "Unknown asset",
          recipientType: finalRecipientType,
          recipient: finalRecipient,
          anomalyMeta,
        } as NotificationLog;
      })
      : [];

    return {
      logs,
      adminEmails:
        typeof result.adminEmails === "string" ? result.adminEmails : "",
      managerEmails:
        typeof result.managerEmails === "string" ? result.managerEmails : "",
      adminNames:
        typeof result.adminNames === "string" ? result.adminNames : "",
    };
  },

  async updateAdminEmails(
    adminEmails: string,
    managerEmails: string,
  ): Promise<{ emails: string; names: string }> {
    const result = await apiClient.put("/notifications", {
      adminEmails,
      managerEmails,
    });
    return {
      emails: result.data?.adminEmails || "",
      names: result.names || "",
    };
  },

  async getNotificationControlSettings(
    forceRefresh = false,
  ): Promise<NotificationControlSettings> {
    const now = Date.now();
    if (
      !forceRefresh &&
      cachedControlSettings &&
      now - lastControlSettingsFetchTime < CONTROL_SETTINGS_CACHE_TTL
    ) {
      return cachedControlSettings;
    }
    if (controlSettingsFetchPromise && !forceRefresh) {
      return controlSettingsFetchPromise;
    }

    controlSettingsFetchPromise = apiClient
      .get("/notifications/control-settings")
      .then((result) => {
        cachedControlSettings = normalizeNotificationControlSettings(
          result.data,
        );
        lastControlSettingsFetchTime = Date.now();
        controlSettingsFetchPromise = null;
        return cachedControlSettings;
      })
      .catch((err) => {
        controlSettingsFetchPromise = null;
        throw err;
      });

    return controlSettingsFetchPromise;
  },

  async updateNotificationControlSettings(
    settings: NotificationControlSettings,
  ): Promise<NotificationControlSettings> {
    const result = await apiClient.put(
      "/notifications/control-settings",
      settings,
    );
    const updated = normalizeNotificationControlSettings(
      result.data || settings,
    );
    cachedControlSettings = updated;
    lastControlSettingsFetchTime = Date.now();
    return updated;
  },

  async getUpcomingNotifications(): Promise<NotificationLog[]> {
    const result = await apiClient.get("/notifications/upcoming");
    return result.data || [];
  },

  async getPendingAnomalyApprovals(): Promise<PendingAnomalyAlert[]> {
    if ((this as any)._pendingAnomalyPromise) return (this as any)._pendingAnomalyPromise;
    const promise = apiClient.get("/notifications/anomaly-pending").then((result) => {
      setTimeout(() => { (this as any)._pendingAnomalyPromise = null; }, 500);
      return result.data || [];
    }).catch(err => {
      (this as any)._pendingAnomalyPromise = null;
      throw err;
    });
    (this as any)._pendingAnomalyPromise = promise;
    return promise;
  },
  async approveAnomalyAlert(queueId: number): Promise<void> {
    await apiClient.post(`/notifications/anomaly/${queueId}/approve`, {});
  },

  async dismissAnomalyAlert(queueId: number): Promise<void> {
    await apiClient.post(`/notifications/anomaly/${queueId}/ignore`, {});
  },

  async ignoreAnomalyAlert(
    queueId: number,
    reason?: string | null,
  ): Promise<void> {
    await apiClient.post(`/notifications/anomaly/${queueId}/ignore`, {
      reason: reason || null,
    });
  },

  async sendNotificationNow(
    notification: Pick<
      NotificationLog,
      | "id"
      | "category"
      | "milestoneAction"
      | "milestoneDays"
      | "licenseExpiryDate"
    >,
  ): Promise<void> {
    const licenseExpiryDateKey = (() => {
      if (!notification.licenseExpiryDate) return null;

      const parsed = new Date(notification.licenseExpiryDate);
      if (Number.isNaN(parsed.getTime())) {
        const raw = String(notification.licenseExpiryDate).trim();
        return raw.length >= 10 ? raw.slice(0, 10) : null;
      }

      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    })();

    await apiClient.post(`/notifications/send/${notification.id}`, {
      category: notification.category,
      milestoneAction: notification.milestoneAction || null,
      milestoneDays:
        notification.milestoneDays != null
          ? Number(notification.milestoneDays)
          : null,
      licenseExpiryDate: notification.licenseExpiryDate || null,
      licenseExpiryDateKey,
    });
  },

  async cancelNotification(
    notification: Pick<
      NotificationLog,
      "id" | "category" | "type" | "milestoneAction" | "licenseExpiryDate"
    >,
  ): Promise<void> {
    await apiClient.post(`/notifications/cancel/${notification.id}`, {
      category: notification.category,
      type: notification.type,
      milestoneAction: notification.milestoneAction,
      licenseExpiryDate: notification.licenseExpiryDate,
    });
  },

  async getAnomalies(): Promise<any> {
    const result = await apiClient.get("/notifications/anomalies");
    return result.data || null;
  },

  // =============================================
  // IN-APP NOTIFICATIONS
  // =============================================

  async getInAppNotifications(forceRefresh = false): Promise<InAppNotification[]> {
    // Deduplicate simultaneous calls (e.g. from multiple mounted bell components)
    // Always deduplicate in-flight requests, even if forceRefresh is true.
    if ((this as any)._inAppNotificationsPromise) {
      return (this as any)._inAppNotificationsPromise;
    }
    const promise = apiClient.get("/inapp-notifications").then((result) => {
      setTimeout(() => {
        (this as any)._inAppNotificationsPromise = null;
      }, 500);
      return result.data || [];
    }).catch((err) => {
      (this as any)._inAppNotificationsPromise = null;
      throw err;
    });
    (this as any)._inAppNotificationsPromise = promise;
    return promise;
  },

  async readInAppNotification(id: number | string): Promise<void> {
    await apiClient.put(`/inapp-notifications/${id}/read`, {});
    (this as any)._inAppNotificationsPromise = null;
  },

  async clearInAppNotification(id: number | string): Promise<void> {
    await apiClient.delete(`/inapp-notifications/${id}`);
    (this as any)._inAppNotificationsPromise = null;
  },

  async clearAllInAppNotifications(): Promise<void> {
    await apiClient.delete("/inapp-notifications/clean-all");
    (this as any)._inAppNotificationsPromise = null;
  },

  // =============================================
  // AUTH (Logout)
  // =============================================

  async logoutUser(employeeId: string): Promise<void> {
    await apiClient.post("/auth/logout", { employeeId });
  },
};

export default dataService;
