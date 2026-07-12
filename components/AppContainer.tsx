'use client';

import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { getErrorMessage } from '@/lib/utils/errorHelpers';
import { formatDisplayDate } from '@/lib/utils/dateHelpers';
import { formatCurrencyValue } from '@/lib/utils/formatCurrency';
import {
  // Package,
  Menu,
  X,
  LogOut,
  ShieldAlert,
  Clock,
  Send,
  EyeOff,
  Eye,
  Shield,
  ChevronDown,
  User as UserIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Toaster } from '@/components/ui/sonner';
// Static imports — always needed immediately (nav, toasts, tiny utils)
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { InAppNotificationBell } from '@/components/InAppNotificationBell';

// Type-only import — erased at build time, no runtime cost
import type { MaintenanceSavePayload } from '@/components/MaintenanceForm';
import {
  OPEN_DATA_VIEW_EVENT,
  type DataViewPayload,
} from '@/lib/utils/dataViewHelpers';

// ==================== LAZY-LOADED COMPONENTS ====================
// Downloaded on-demand, reducing initial bundle to a small shell.

// Auth screens
const Login = lazy<React.ComponentType<any>>(() =>
  import("@/components/login").then((m) => ({ default: m.Login }))
);
const ResetPassword = lazy<React.ComponentType<any>>(() =>
  import("@/components/ResetPassword").then((m) => ({ default: m.ResetPassword }))
);

// Main page views
const Dashboard = lazy<React.ComponentType<any>>(() =>
  import("@/components/Dashboard").then((m) => ({ default: m.Dashboard }))
);
const AssetList = lazy<React.ComponentType<any>>(() =>
  import("@/components/AssetList").then((m) => ({ default: m.AssetList }))
);
const AllocationsPage = lazy<React.ComponentType<any>>(() =>
  import("@/components/AllocationsPage").then((m) => ({ default: m.AllocationsPage }))
);
const MaintenanceSchedule = lazy<React.ComponentType<any>>(() =>
  import("@/components/MaintenanceSchedule").then((m) => ({ default: m.MaintenanceSchedule }))
);
const Reports = lazy<React.ComponentType<any>>(() =>
  import("@/components/Reports").then((m) => ({ default: m.Reports }))
);
const SettingsPage = lazy<React.ComponentType<any>>(() =>
  import("@/components/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
const BookingsPage = lazy<React.ComponentType<any>>(() =>
  import("@/components/BookingsPage").then((m) => ({ default: m.BookingsPage }))
);
const AuditsPage = lazy<React.ComponentType<any>>(() =>
  import("@/components/AuditsPage").then((m) => ({ default: m.AuditsPage }))
);

const GuidePage = lazy<React.ComponentType<any>>(() =>
  import("@/components/GuidePage").then((m) => ({ default: m.GuidePage }))
);

const DataViewPage = lazy<React.ComponentType<any>>(() => import("@/components/DataViewPage"));

// Modals — lazily loaded so their code only ships when the user opens them
const AssetForm = lazy<React.ComponentType<any>>(() =>
  import("@/components/AssetForm").then((m) => ({ default: m.AssetForm }))
);
const AssetDetail = lazy<React.ComponentType<any>>(() =>
  import("@/components/AssetDetail").then((m) => ({ default: m.AssetDetail }))
);
const UnitDetailModal = lazy<React.ComponentType<any>>(() =>
  import("@/components/UnitDetailModal").then((m) => ({ default: m.UnitDetailModal }))
);
const MaintenanceDetail = lazy<React.ComponentType<any>>(() =>
  import("@/components/MaintenanceDetail").then((m) => ({ default: m.MaintenanceDetail }))
);
const MaintenanceForm = lazy<React.ComponentType<any>>(() =>
  import("@/components/MaintenanceForm").then((m) => ({ default: m.MaintenanceForm }))
);

import {
  Asset,
  MaintenanceRecord,
  LicenseAllocation,
  AssetHistory as AssetHistoryType,
  User,
  Vendor,
  Category,
} from '@/types';
import dataService, {
  DEFAULT_NOTIFICATION_CONTROL_SETTINGS,
  type NotificationControlSettings,
  type PendingAnomalyAlert,
  normalizeAsset,
  normalizeMaintenance,
  normalizeLicenseAllocation,
  normalizeUser,
} from '@/lib/dataService';
import { computeAssetViewData } from '@/lib/utils/assetHelpers';
import {
  ASSET_STATUS,
  MAINTENANCE_STATUS,
  type UserRole,
  ALLOCATION_STATUS_DISPLAY,
  isSoftwareLikeCategory,
  DEFAULT_ASSET_CONDITION,
  HIDE_DELETE_UI,
} from '@/config/constants';

import { LoadingScreen } from '@/components/ui/LoadingScreen';

type View =
  | "dashboard"
  | "assets"
  | "allocations"
  | "maintenance"
  | "reports"
  | "settings"
  | "guide"
  | "bookings"
  | "audits";

// ==================== URL ROUTING HELPERS ====================
const viewToPath: Record<View, string> = {
  dashboard: "/dashboard",
  assets: "/assets",
  allocations: "/allocations",
  maintenance: "/maintenance",
  reports: "/reports",
  settings: "/settings",
  bookings: "/bookings",
  audits: "/audits",
  guide: "/guide",
};

const getViewFromPath = (): View => {
  const path = window.location.pathname.toLowerCase();

  if (path === "/" || path === "/dashboard") return "dashboard";
  if (path.startsWith("/asset")) return "assets";
  if (path.startsWith("/allocation")) return "allocations";
  if (path.startsWith("/maintenance")) return "maintenance";
  if (path.startsWith("/report")) return "reports";
  if (path.startsWith("/setting") || path.startsWith("/notification")) return "settings";
  if (path.startsWith("/booking")) return "bookings";
  if (path.startsWith("/audit")) return "audits";
  if (path.startsWith("/guide")) return "guide";   // ← add this line

  return "dashboard";
};

// ==================== STATIC DATA (Outside Component) ====================
const navItems = [
  { id: "dashboard" as View, label: "Dashboard" },
  { id: "assets" as View, label: "Assets" },
  { id: "allocations" as View, label: "Allocations" },
  { id: "maintenance" as View, label: "Maintenance" },
  { id: "bookings" as View, label: "Bookings" },
  { id: "audits" as View, label: "Audits" },
  { id: "reports" as View, label: "Reports" },
  { id: "guide" as View, label: "Guide" },   // ← add this
];

const settingsNavItem = {
  id: "settings" as View,
  label: "Settings",
};

const ANOMALY_POLL_INTERVAL_MS = 60000; // 60s — balanced for 100+ users

export interface AppContainerProps {
  initialView?: View;
  serverData?: {
    assets?: Asset[];
    maintenanceRecords?: MaintenanceRecord[];
    licenseAllocations?: LicenseAllocation[];
    users?: User[];
    categories?: Category[];
    vendors?: Vendor[];
    assetHistory?: AssetHistoryType[];
  };
}

export default function AppContainer({ initialView, serverData }: AppContainerProps = {}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<{
    employeeId: string;
    userName: string;
    role?: string;
    managedCategories?: string[];
  } | null>(null);

  // DataView overlay state
  const [dataViewPayload, setDataViewPayload] =
    useState<DataViewPayload | null>(null);

  // Listen for the CustomEvent dispatched by openDataView()
  useEffect(() => {
    const handleOpenDataView = (e: Event) => {
      const customEvent = e as CustomEvent<DataViewPayload>;
      setDataViewPayload(customEvent.detail);
    };
    window.addEventListener(OPEN_DATA_VIEW_EVENT, handleOpenDataView);
    return () =>
      window.removeEventListener(OPEN_DATA_VIEW_EVENT, handleOpenDataView);
  }, []);

  const [currentView, setCurrentViewState] = useState<View>(
    initialView || (typeof window !== "undefined" ? getViewFromPath() : "dashboard")
  );
  const [isViewerViewEnabled, setIsViewerViewEnabled] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    };
    if (isUserMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isUserMenuOpen]);

  // Navigate to a view and update the URL cleanly using Next.js router
  const setCurrentView = useCallback((view: View) => {
    setCurrentViewState(view);
    const path = viewToPath[view];
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      router.push(path);
    }
  }, [router]);

  // Sync view when pathname changes or popstate fires
  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentViewState(getViewFromPath());
    } else if (initialView) {
      setCurrentViewState(initialView);
    }
  }, [pathname, initialView]);

  const [assets, setAssets] = useState<Asset[]>(() =>
    (serverData?.assets || []).map(normalizeAsset)
  );
  const [maintenanceRecords, setMaintenanceRecords] = useState<
    MaintenanceRecord[]
  >(() => (serverData?.maintenanceRecords || []).map(normalizeMaintenance));
  const [licenseAllocations, setLicenseAllocations] = useState<
    LicenseAllocation[]
  >(() => (serverData?.licenseAllocations || []).map(normalizeLicenseAllocation));
  const [users, setUsers] = useState<User[]>(() =>
    (serverData?.users || []).map(normalizeUser)
  );
  const [vendors, setVendors] = useState<Vendor[]>(serverData?.vendors || []);
  const [assetHistory, setAssetHistory] = useState<AssetHistoryType[]>(serverData?.assetHistory || []);
  const [categories, setCategories] = useState<Category[]>(serverData?.categories || []);
  const [loading, setLoading] = useState(!serverData);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [showAssetDetail, setShowAssetDetail] = useState(false);
  const [showMaintenanceDetail, setShowMaintenanceDetail] = useState(false);
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedMaintenance, setSelectedMaintenance] =
    useState<MaintenanceRecord | null>(null);
  const [selectedMaintenanceForView, setSelectedMaintenanceForView] =
    useState<MaintenanceRecord | null>(null);
  // Standalone UnitDetailModal — opened when navigating from maintenance to a child unit
  const [standaloneUnitAsset, setStandaloneUnitAsset] = useState<Asset | null>(
    null,
  );
  const [showDeleteConfirmInApp, setShowDeleteConfirmInApp] = useState(false);
  const [unitToDeleteInApp, setUnitToDeleteInApp] = useState<Asset | null>(
    null,
  );
  const [pendingAnomalies, setPendingAnomalies] = useState<
    PendingAnomalyAlert[]
  >([]);
  const [isAnomalyOverlayOpen, setIsAnomalyOverlayOpen] = useState(false);
  const [forceViewerModeForDetail, setForceViewerModeForDetail] = useState(false);
  const [notificationControl, setNotificationControl] =
    useState<NotificationControlSettings | null>(null);
  const [anomalyActionIds, setAnomalyActionIds] = useState<Set<number>>(
    new Set(),
  );

  const refreshInFlightRef = useRef<Promise<{
    assets: Asset[] | null;
    assetHistory: AssetHistoryType[] | null;
    licenseAllocations: LicenseAllocation[] | null;
    maintenanceRecords: MaintenanceRecord[] | null;
  } | null> | null>(null);
  const refreshQueuedRef = useRef(false);
  const anomalyFetchInFlightRef = useRef(false);
  const anomalyRefreshTimerRef = useRef<number | null>(null);
  const anomalyActionInFlightRef = useRef<Set<number>>(new Set());
  const prevPendingAnomaliesRef = useRef<PendingAnomalyAlert[]>([]);
  const initialAnomalyLoadRef = useRef(true);
  const isViewerModeRef = useRef(false);
  const prevViewerViewEnabledRef = useRef(false);
  const lastDataTimestampsRef = useRef<{
    assets: string | null;
    allocations: string | null;
    maintenance: string | null;
    history: string | null;
    users: string | null;
  }>({ assets: null, allocations: null, maintenance: null, history: null, users: null });
  const [controlSettings, setControlSettings] = useState<any>(null);

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      setCurrentUser({
        employeeId: session.user.id || "EMP001",
        userName: session.user.fullName || session.user.name || "User",
        role: session.user.role || "Viewer",
        managedCategories: session.user.managedCategories
          ? session.user.managedCategories.split(",")
          : ["ALL"],
      });
      setIsAuthenticated(true);
    } else if (status === "unauthenticated") {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setLoading(false);
    }
  }, [session, status]);

  // Load data only when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    if (serverData) return; // Skip client-side fetch if serverData is provided

    const initData = async () => {
      try {
        setLoading(true);

        // Ping the API by fetching assets first. If the API is down, this throws instantly
        // and skips firing the other 4 simultaneous requests, avoiding console spam!
        const assetsResponse = await dataService.getAssets({ limit: 10000 });

        const [
          maintenanceData,
          licensesData,
          usersData,
          categoriesData,
        ] = await Promise.all([
          dataService.getMaintenance(),
          dataService.getLicenseAllocations(),
          dataService.getUsers(),
          dataService.getCategories(),
        ]);

        const assetsData = assetsResponse.data;

        setAssets(assetsData || []);
        setMaintenanceRecords(maintenanceData || []);
        setLicenseAllocations(licensesData || []);
        setUsers(usersData || []);
        setCategories(categoriesData || []);

        loadSecondaryData();
      } catch {
        // Initial load failed — handled by empty state UI
      } finally {
        setLoading(false);
      }
    };

    const loadSecondaryData = async () => {
      try {
        const [vendorsData, historyData] = await Promise.all([
          dataService.getVendors(),
          dataService.getAssetHistory(undefined, undefined, true, {
            limit: 10000,
          }),
        ]);
        setVendors(vendorsData || []);
        setAssetHistory(historyData || []);
      } catch {
        // Secondary data load failed — non-critical
      }
    };

    initData();
  }, [isAuthenticated]);

  // Helper to refresh data after changes.
  // scope controls which endpoints are hit:
  //   'all'         — assets + history + allocations + maintenance (default, for complex mutations)
  //   'allocation'  — assets + allocations only (for allocate/revoke)
  //   'maintenance' — assets + maintenance only (for maintenance create/update)
  //   'asset'       — assets only (for simple asset edits)
  const refreshAllocationData = useCallback(
    async (
      force = false,
      scope: "all" | "allocation" | "maintenance" | "asset" | { assets?: boolean, allocations?: boolean, maintenance?: boolean, history?: boolean, users?: boolean } = "all",
    ) => {
      // If a refresh is already happening, we can queue another one to run immediately after.
      if (refreshInFlightRef.current) {
        refreshQueuedRef.current = true;
        return refreshInFlightRef.current;
      }

      const runRefresh = async (): Promise<{
        assets: Asset[] | null;
        assetHistory: AssetHistoryType[] | null;
        licenseAllocations: LicenseAllocation[] | null;
        maintenanceRecords: MaintenanceRecord[] | null;
        users?: User[] | null;
      } | null> => {
        try {
          const fetchHistory = scope === "all" || (typeof scope === "object" && scope.history);
          const fetchAllocations = scope === "all" || scope === "allocation" || (typeof scope === "object" && scope.allocations);
          const fetchMaintenance = scope === "all" || scope === "maintenance" || (typeof scope === "object" && scope.maintenance);
          const fetchCategories = scope === "all"; // Rarely changes, skip in polling
          const fetchAssets = (scope !== "maintenance" && typeof scope !== "object") || (typeof scope === "object" && scope.assets);
          const fetchUsers = scope === "all" || (typeof scope === "object" && scope.users);

          // We serialize the largest/primary fetch (usually Assets) to act as a health check.
          // If it fails with a 500, we don't spam the console with 4 more failed requests.
          let assetsRes: Asset[] | null = null;
          if (fetchAssets) {
            const res = await dataService.getAssets({ limit: 10000, includePersonal: true });
            assetsRes = res.data;

            if (res.userRole && res.userCategories && !isViewerModeRef.current) {
              setCurrentUser(prev => {
                if (!prev) return prev;
                const prevCategoriesStr = JSON.stringify(prev.managedCategories || []);
                const newCategoriesStr = JSON.stringify(res.userCategories);

                if (prev.role !== res.userRole || prevCategoriesStr !== newCategoriesStr) {
                  const updatedAuth = { ...prev, role: res.userRole, managedCategories: res.userCategories };
                  const storage = sessionStorage.getItem("inventoryAuth") ? sessionStorage : localStorage;
                  storage.setItem("inventoryAuth", JSON.stringify(updatedAuth));
                  return updatedAuth;
                }
                return prev;
              });
            }
          }

          // Run the remaining fetches in parallel
          const [
            historyResult,
            allocationsResult,
            maintenanceResult,
            categoriesResult,
            usersResult,
          ] = await Promise.allSettled([
            fetchHistory
              ? dataService.getAssetHistory(undefined, undefined, true, {
                limit: 10000,
              })
              : Promise.resolve(null),
            fetchAllocations
              ? dataService.getLicenseAllocations()
              : Promise.resolve(null),
            fetchMaintenance
              ? dataService.getMaintenance()
              : Promise.resolve(null),
            fetchCategories
              ? dataService.getCategories()
              : Promise.resolve(null),
            fetchUsers
              ? dataService.getUsers()
              : Promise.resolve(null),
          ]);

          const historyRes =
            historyResult.status === "fulfilled" ? historyResult.value : null;
          const allocationsRes =
            allocationsResult.status === "fulfilled"
              ? allocationsResult.value
              : null;
          const maintenanceRes =
            maintenanceResult.status === "fulfilled"
              ? maintenanceResult.value
              : null;
          const categoriesRes =
            categoriesResult.status === "fulfilled"
              ? categoriesResult.value
              : null;
          const usersRes =
            usersResult.status === "fulfilled" ? usersResult.value : null;

          // Update states only for data that was fetched (null means scope skipped it)
          if (assetsRes) setAssets(assetsRes || []);
          if (historyRes) setAssetHistory(historyRes);
          if (allocationsRes) setLicenseAllocations(allocationsRes);
          if (maintenanceRes) setMaintenanceRecords(maintenanceRes);
          if (categoriesRes) setCategories(categoriesRes || []);
          if (usersRes) setUsers(usersRes || []);

          return {
            assets: assetsRes || null,
            assetHistory: historyRes || null,
            licenseAllocations: allocationsRes || null,
            maintenanceRecords: maintenanceRes || null,
            users: usersRes || null,
          };
        } catch (err) {
          console.error("[REFRESH] Fatal error:", err instanceof Error ? err.message : err);
          return null;
        }
      };

      const execute = async (): Promise<{
        assets: Asset[] | null;
        assetHistory: AssetHistoryType[] | null;
        licenseAllocations: LicenseAllocation[] | null;
        maintenanceRecords: MaintenanceRecord[] | null;
      } | null> => {
        const snapshot = await runRefresh();

        // If another refresh was requested while one was in flight, run one more pass.
        if (refreshQueuedRef.current) {
          refreshQueuedRef.current = false;
          return execute();
        }

        // ─── SYNC NOTIFICATIONS IMMEDIATELY AFTER DATA REFRESH ───
        // Signal both the notification bell and anomaly overlay at the same time
        // the data is updated — no more 800ms delay. This ensures the bell badge
        // count and anomaly UI are in sync with the fresh data the user already sees.
        window.dispatchEvent(new CustomEvent("refreshNotifications"));

        // Fire anomaly check immediately (data is already fresh from runRefresh)
        window.dispatchEvent(new CustomEvent("REFRESH_ANOMALIES"));

        return snapshot;
      };

      const task = execute().finally(() => {
        refreshInFlightRef.current = null;
      });
      refreshInFlightRef.current = task;
      return task;
    },
    [
      setAssets,
      setAssetHistory,
      setLicenseAllocations,
      setMaintenanceRecords,
      setCategories,
    ],
  );

  // Emulates the Database View (vw_Assets_Detailed)
  const processedAssets = useMemo(() => {
    return assets
      .filter((asset) => asset && asset.id) // Filter out any undefined or invalid assets
      .map((asset) =>
        computeAssetViewData(
          asset,
          licenseAllocations,
          maintenanceRecords,
          assets, // Pass full assets array for bulk order parent allocation calculations
        ),
      );
  }, [assets, licenseAllocations, maintenanceRecords]);

  // Listen for global refresh signals from other components
  useEffect(() => {
    const handler = () => {
      if (isAuthenticated) refreshAllocationData(true).catch(() => { });
    };
    window.addEventListener("REFRESH_APP_DATA", handler);
    return () => window.removeEventListener("REFRESH_APP_DATA", handler);
  }, [isAuthenticated, refreshAllocationData]);

  // Synchronize viewer mode ref and service state when viewer view is toggled,
  // and trigger a full refetch since server-side RBAC filters will change.
  useEffect(() => {
    isViewerModeRef.current = isViewerViewEnabled;
    dataService.setViewerMode(isViewerViewEnabled);
    if (isAuthenticated) {
      if (prevViewerViewEnabledRef.current !== isViewerViewEnabled) {
        refreshAllocationData(false, "all").catch(() => { });
      }
    }
    prevViewerViewEnabledRef.current = isViewerViewEnabled;
  }, [isViewerViewEnabled, isAuthenticated, refreshAllocationData]);

  // Listen for vendors updates from Settings -> Vendors
  useEffect(() => {
    const handleVendorsUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<Vendor[]>;
      if (customEvent.detail && Array.isArray(customEvent.detail)) {
        setVendors(customEvent.detail);
      }
    };
    window.addEventListener("VENDORS_UPDATED", handleVendorsUpdated);
    return () =>
      window.removeEventListener("VENDORS_UPDATED", handleVendorsUpdated);
  }, []);

  // Listen for users updates from Settings -> Users
  useEffect(() => {
    const handleUsersUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<User[]>;
      if (customEvent.detail && Array.isArray(customEvent.detail)) {
        setUsers(customEvent.detail);

        // Ensure currentUser is updated immediately if they were edited by themselves or an admin
        setCurrentUser(prev => {
          if (!prev) return prev;
          const updatedSelf = customEvent.detail.find(u => String(u.employeeId) === String(prev.employeeId));
          if (updatedSelf) {
            const newManagedCategories = updatedSelf.managedCategories || ["ALL"];
            const prevCategoriesStr = JSON.stringify(prev.managedCategories || []);
            const newCategoriesStr = JSON.stringify(newManagedCategories);

            if (prev.role !== updatedSelf.role || prevCategoriesStr !== newCategoriesStr) {
              const updatedAuth = {
                ...prev,
                role: updatedSelf.role,
                managedCategories: newManagedCategories
              };

              // Persist the hot-reloaded permissions so they survive a page refresh
              const storage = sessionStorage.getItem("inventoryAuth") ? sessionStorage : localStorage;
              storage.setItem("inventoryAuth", JSON.stringify(updatedAuth));

              return updatedAuth;
            }
          }
          return prev;
        });
      }
    };
    window.addEventListener("USERS_UPDATED", handleUsersUpdated);
    return () =>
      window.removeEventListener("USERS_UPDATED", handleUsersUpdated);
  }, []);

  // Listen for settings updates from Settings -> Admin Control
  useEffect(() => {
    const handleSettingsUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<NotificationControlSettings>;
      if (customEvent.detail) {
        setControlSettings(customEvent.detail);
      }
    };
    window.addEventListener("SETTINGS_UPDATED", handleSettingsUpdated);
    return () =>
      window.removeEventListener("SETTINGS_UPDATED", handleSettingsUpdated);
  }, []);

  // Scroll to top when view changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentView]);

  // Keep mobile menu from lingering after navigation changes.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [currentView]);

  // ==================== AUTHENTICATION ====================
  const handleLogin = useCallback(
    (employeeId: string, userName: string, role: string, managedCategories?: string[]) => {
      setCurrentUser({ employeeId, userName, role, managedCategories });
      setIsAuthenticated(true);
      toast.success(`Welcome, ${userName}!`);
    },
    [],
  );

  const handleLogout = useCallback(async () => {
    await signOut({ callbackUrl: "/auth/sign-in" });
  }, []);

  // ==================== ASSET HANDLERS ====================
  const handleAddAsset = useCallback(() => {
    setSelectedAssetId(null);
    setShowAssetForm(true);
  }, []);

  const handleEditAsset = useCallback((asset: Asset) => {
    setSelectedAssetId(asset.id);
    setShowAssetDetail(false);
    setShowAssetForm(true);
  }, []);

  const handleViewAsset = useCallback(
    (asset: Asset, navigateToAssets = true) => {
      if (asset.bulkOrderParentId && !asset.isBulkOrder) {
        setStandaloneUnitAsset(asset);
      } else {
        setSelectedAssetId(asset.id);
        setShowAssetDetail(true);
        if (navigateToAssets) setCurrentView("assets");
      }
    },
    [],
  );

  const handleQuickViewAsset = useCallback(
    (asset: Asset) => handleViewAsset(asset, false),
    [handleViewAsset],
  );

  const handleDisposeAsset = useCallback(
    async (assetId: string, reason: string, condition?: string) => {
      const now = new Date();
      const disposalDate = now.toLocaleDateString("en-CA");

      try {
        const assetToDispose = assets.find((a) => a.id === assetId);

        // If this is a Bulk Parent, dispose children first, then parent.
        const assetsToDispose: string[] = [];
        if (assetToDispose?.isBulkOrder) {
          const children = assets.filter(
            (a) =>
              a.bulkOrderParentId === assetId &&
              a.status !== ASSET_STATUS.DISPOSED,
          );
          children.forEach((child) => assetsToDispose.push(child.id));
        }
        assetsToDispose.push(assetId);

        // Perform bulk disposal using the new bulk disposal endpoint in a single HTTP request
        await dataService.bulkDisposeAssets(assetsToDispose, {
          disposalDate,
          reason,
          condition: condition || "POOR",
        });

        const disposeCount = assetsToDispose.length;

        // Show toast and close modal IMMEDIATELY — refresh in background
        setShowAssetDetail(false);
        setSelectedAssetId(null);
        toast.success(
          disposeCount > 1
            ? `Bulk asset and ${disposeCount - 1} units disposed successfully`
            : "Asset disposed successfully",
        );
        refreshAllocationData(true);
      } catch (err) {
        toast.error(getErrorMessage(err));
      }
    },
    [assets, refreshAllocationData],
  );

  const syncAssetToMaintenance = useCallback(
    async (oldAsset: Asset | null, newAsset: Asset) => {
      if (!newAsset || !newAsset.id) return;

      // Skip sync if the asset is Disposed — the backend rejects PUT for these.
      if (newAsset.status === ASSET_STATUS.DISPOSED) {
        return;
      }

      const now = new Date().toISOString().split("T")[0];

      try {
        const activeMaintenance = maintenanceRecords.find(
          (m) =>
            String(m.assetId) === String(newAsset.id) &&
            (m.status === MAINTENANCE_STATUS.SCHEDULED ||
              m.status === MAINTENANCE_STATUS.IN_PROGRESS),
        );

        if (newAsset.status === ASSET_STATUS.UNDER_MAINTENANCE) {
          if (activeMaintenance) {
            if (activeMaintenance.status !== MAINTENANCE_STATUS.IN_PROGRESS) {
              const updated = await dataService.updateMaintenance(
                activeMaintenance.id,
                {
                  assetId: newAsset.id,
                  status: MAINTENANCE_STATUS.IN_PROGRESS,
                  scheduledDate: activeMaintenance.scheduledDate,
                  completionDate: null,
                },
              );
              setMaintenanceRecords((prev) =>
                prev.map((m) => (m.id === activeMaintenance.id ? updated : m)),
              );
            }
          } else {
            // Don't silently auto-create a bare maintenance record — warn the user instead.
            // The proper flow is to create a maintenance record through the Maintenance form.
            toast.warning(
              `Asset status set to Under Maintenance. Please create a maintenance record to track this session.`,
            );
          }
        } else if (oldAsset?.status === ASSET_STATUS.UNDER_MAINTENANCE) {
          if (
            activeMaintenance &&
            activeMaintenance.status === MAINTENANCE_STATUS.IN_PROGRESS
          ) {
            const updated = await dataService.updateMaintenance(
              activeMaintenance.id,
              {
                status: MAINTENANCE_STATUS.COMPLETED,
                completionDate: now,
              },
            );
            setMaintenanceRecords((prev) =>
              prev.map((m) => (m.id === activeMaintenance.id ? updated : m)),
            );
          }
        }
      } catch {
        // Sync failed — non-critical
      }
    },
    [maintenanceRecords],
  );

  const handleSaveAsset = useCallback(
    async (assetData: Partial<Asset>, stayInDetail: boolean = false) => {
      try {
        // Child unit edit refresh — just reload all data, no save needed here
        if ((assetData as Record<string, unknown>)._refreshAfterUnitEdit) {
          // Unit edit may change condition/status — keep anomaly signaling on
          await refreshAllocationData(true, "asset");
          return;
        }

        const isRenewal = !!assetData.isRenewalRecord;

        if (selectedAssetId) {
          const oldAsset = assets.find((a) => a.id === selectedAssetId);
          const updatedAsset = await dataService.updateAsset(
            selectedAssetId,
            assetData,
          );

          if (updatedAsset && updatedAsset.id) {
            if (updatedAsset.isBulkOrder) {
              // Bulk parent cascades children — refresh assets + signal anomalies, then return
              // to avoid the redundant trailing refresh below
              await refreshAllocationData(true, isRenewal ? "all" : "asset");
              toast.success("Asset updated successfully!");
              if (!stayInDetail) {
                setShowAssetForm(false);
                setSelectedAssetId(null);
              }
              return;
            } else {
              setAssets((prev) =>
                prev.map((a) => (a.id === selectedAssetId ? updatedAsset : a)),
              );
              await syncAssetToMaintenance(oldAsset || null, updatedAsset);
              if (isRenewal) {
                await refreshAllocationData(true, "all");
              }
              toast.success("Asset updated successfully!");
            }
          } else {
            await refreshAllocationData(false, isRenewal ? "all" : "asset");
            toast.success("Asset updated successfully!");
          }
        } else {
          const result = await dataService.createAsset(assetData);

          // Handle both single asset and bulk order (array) returns
          const newAssets = Array.isArray(result) ? result : [result];

          if (newAssets.length > 0) {
            setAssets((prev) => [...newAssets, ...prev]);

            // Bulk create returns only the parent; refresh to pull children so the Units tab shows immediately.
            const isBulkCreate = Number(assetData.totalQuantity || 1) > 1;
            if (isBulkCreate) {
              await refreshAllocationData(true, "asset");
            }

            const createdCategory = String(assetData.category || "").trim();
            if (createdCategory) {
              setCategories((prev) =>
                prev.some((c) => c.id === createdCategory)
                  ? prev
                  : [{ id: createdCategory }, ...prev],
              );
            }

            // Log action for the main asset (or parent if bulk)
            const primaryAsset = newAssets[0];
            await syncAssetToMaintenance(null, primaryAsset);

            toast.success(
              newAssets.length > 1
                ? "Bulk order created successfully!"
                : "Asset created successfully!",
            );
          } else {
            const refreshed = await dataService.getAssets({ limit: 10000, includePersonal: true });
            setAssets(refreshed.data || []);
            toast.success("Asset created successfully!");
          }
        }

        // Background sync for anomaly detection — assets scope is enough for lemon detection
        if (isRenewal) {
          refreshAllocationData(true, "all");
        } else {
          window.dispatchEvent(new CustomEvent("REFRESH_ANOMALIES"));
        }
      } catch (err) {
        toast.error(getErrorMessage(err));
        return;
      }

      if (!stayInDetail) {
        setShowAssetForm(false);
        setSelectedAssetId(null);
      }
    },
    [selectedAssetId, assets, refreshAllocationData, syncAssetToMaintenance],
  );

  const handleDeleteAsset = useCallback(
    async (id: string, reason?: string, condition?: string) => {
      try {
        const asset = processedAssets.find((a) => a.id === id);
        if (asset && asset.status === ASSET_STATUS.DISPOSED) {
          toast.error(
            "Disposed assets cannot be deleted to maintain a permanent audit trail.",
          );
          return;
        }

        // Collect all IDs to delete (parent + children for bulk orders)
        const idsToDelete = [id];
        if (asset?.isBulkOrder) {
          const children = processedAssets.filter(
            (a) => a.bulkOrderParentId === id,
          );
          children.forEach((child) => idsToDelete.push(child.id));
        }
        const idsToDeleteSet = new Set(
          idsToDelete.map((assetId) => String(assetId)),
        );

        // Check for active maintenance records — warn before proceeding (backend will cancel them)
        const activeMaintCount = maintenanceRecords.filter(
          (m) =>
            idsToDeleteSet.has(String(m.assetId)) &&
            (m.status === MAINTENANCE_STATUS.SCHEDULED ||
              m.status === MAINTENANCE_STATUS.IN_PROGRESS),
        ).length;
        if (activeMaintCount > 0) {
          const confirmed = window.confirm(
            `This asset has ${activeMaintCount} active maintenance record(s) that will be cancelled upon deletion. Proceed?`,
          );
          if (!confirmed) return;
        }

        // Check for active allocations.
        // For bulk parents, validate against the whole parent group to avoid child-level error messages.
        const activeAllocsForDelete = licenseAllocations.filter(
          (allocation) =>
            allocation.status === ALLOCATION_STATUS_DISPLAY.ACTIVE &&
            idsToDeleteSet.has(String(allocation.assetId)),
        );

        if (activeAllocsForDelete.length > 0) {
          if (asset?.isBulkOrder) {
            toast.error(
              `Cannot delete ${asset.assetCode}. It has ${activeAllocsForDelete.length} active allocation(s) under this bulk parent. Revoke them first.`,
            );
          } else {
            toast.error(
              `Cannot delete ${asset?.assetCode || "asset"}. It has ${activeAllocsForDelete.length} active allocation(s). Revoke them first.`,
            );
          }
          return;
        }

        // Validate non-software specific checks on the primary asset
        if (asset && !isSoftwareLikeCategory(asset.category || "")) {
          if (asset.employeeId) {
            toast.error(
              `Cannot delete this asset. It is currently allocated to ${asset.userName} (${asset.employeeId}). Please return the asset first or use the Dispose feature instead.`,
            );
            return;
          }
          if (asset.parentAssetId) {
            toast.error(
              `Cannot delete this asset. It is currently allocated to another asset (${asset.parentAssetName || "Parent Asset"}). Please unassign it first or use the Dispose feature instead.`,
            );
            return;
          }
        }

        // Delete via parent/selected asset endpoint.
        // Backend bulk delete already handles parent + children atomically.
        await dataService.deleteAsset(id, reason, condition);

        setAssets((prev) => prev.filter((a) => !idsToDelete.includes(a.id)));
        toast.success(
          idsToDelete.length > 1
            ? `Bulk order and ${idsToDelete.length - 1} units deleted successfully`
            : "Asset deleted successfully",
        );

        // Refresh: delete auto-cancels maintenance + adds history — need full refresh
        refreshAllocationData(false, "all");
      } catch (err) {
        toast.error(getErrorMessage(err) || "Failed to delete asset");
      }
    },
    [processedAssets, licenseAllocations, refreshAllocationData],
  );

  // ==================== MAINTENANCE HANDLERS ====================
  const handleAddMaintenance = useCallback(() => {
    setSelectedMaintenance(null);
    setShowMaintenanceForm(true);
  }, []);

  const handleEditMaintenance = useCallback(
    (record: MaintenanceRecord) => {
      // If the linked asset is Disposed, open the view-only detail modal
      // instead of the editable form — the backend will reject any PUT.
      const linkedAsset = assets.find(
        (a) => String(a.id) === String(record.assetId),
      );

      if (linkedAsset?.status === ASSET_STATUS.DISPOSED) {
        setSelectedMaintenanceForView(record);
        setShowMaintenanceDetail(true);
        return;
      }

      setShowAssetDetail(false);
      setSelectedAssetId(null);
      setSelectedMaintenance(record);
      setShowMaintenanceForm(true);
    },
    [assets],
  );

  const handleSaveMaintenance = useCallback(
    async (maintenanceData: MaintenanceSavePayload) => {
      try {
        const {
          _applyToAllUnits,
          _bulkParentId,
          _skipAssetIds,
          consumedPartIds,
          replacementAssetId,
          brokenAssetAction,
          ...cleanData
        } = maintenanceData;

        const resolvedAssetId = String(
          cleanData.assetId ?? selectedMaintenance?.assetId ?? "",
        );
        const finalStatus =
          cleanData.status ?? selectedMaintenance?.status ?? null;
        const normalizedPartIds = Array.isArray(consumedPartIds)
          ? Array.from(
            new Set(
              consumedPartIds.map((id) => String(id).trim()).filter(Boolean),
            ),
          )
          : null;
        const isBulkGroup = Boolean(
          _applyToAllUnits ||
          _bulkParentId ||
          selectedMaintenance?.isBulkGroupRecord,
        );
        const shouldSyncParts =
          Boolean(resolvedAssetId) &&
          finalStatus === MAINTENANCE_STATUS.COMPLETED &&
          normalizedPartIds !== null &&
          !isBulkGroup;

        const replacementId = replacementAssetId
          ? String(replacementAssetId)
          : "";
        const resolvedBrokenAction = brokenAssetAction || "AVAILABLE";
        const shouldAppendDisposalNote =
          Boolean(replacementId) &&
          resolvedBrokenAction === "DISPOSED" &&
          finalStatus === MAINTENANCE_STATUS.COMPLETED &&
          !isBulkGroup;
        const disposalNote =
          "Asset disposed: Disposed after maintenance replacement.";
        const baseNotes =
          typeof cleanData.notes === "string" ? cleanData.notes.trim() : "";
        const hasDisposalNote = baseNotes
          .toLowerCase()
          .includes(disposalNote.toLowerCase());
        const notesWithDisposal =
          shouldAppendDisposalNote && !hasDisposalNote
            ? baseNotes
              ? `${cleanData.notes}\n\n${disposalNote}`
              : disposalNote
            : (cleanData.notes ?? null);
        const maintenancePayload = {
          ...cleanData,
          notes: notesWithDisposal,
        };

        // Document newly installed parts in the notes
        let partsNote = "";

        if (shouldSyncParts && normalizedPartIds) {
          const activePartAllocations = licenseAllocations.filter(
            (allocation) =>
              allocation.status === ALLOCATION_STATUS_DISPLAY.ACTIVE &&
              String(allocation.parentAssetId) === resolvedAssetId,
          );
          const currentPartIds = new Set(
            activePartAllocations.map((allocation) =>
              String(allocation.assetId),
            ),
          );

          const partIdsToAdd = normalizedPartIds.filter(
            (id) => !currentPartIds.has(String(id)),
          );

          if (partIdsToAdd.length > 0) {
            const partsToAdd = partIdsToAdd
              .map((id) => assets.find((a) => String(a.id) === id))
              .filter(Boolean);

            partsToAdd.forEach((p) => {
              if (p) {
                partsNote += `\n+ Consumed Part: ${p.assetName} (${p.assetCode}) - ${p.category}`;
              }
            });
          }
        }

        // Document the replacement-swap in the notes too (matches the
        // "Install Parts / Accessories" pattern). This is the user-visible
        // audit trail of WHAT was swapped and HOW the broken asset was
        // handled — persisted inside the maintenance record's Notes field.
        let replacementNote = "";
        if (
          replacementId &&
          finalStatus === MAINTENANCE_STATUS.COMPLETED &&
          !isBulkGroup
        ) {
          const brokenAsset = assets.find(
            (asset) => String(asset.id) === resolvedAssetId,
          );
          const replacementAsset = assets.find(
            (asset) => String(asset.id) === replacementId,
          );

          const brokenLabel = brokenAsset
            ? `${brokenAsset.assetName} (${brokenAsset.assetCode})`
            : `asset #${resolvedAssetId}`;
          const replacementLabel = replacementAsset
            ? `${replacementAsset.assetName} (${replacementAsset.assetCode})`
            : `asset #${replacementId}`;

          const brokenActionLabel =
            resolvedBrokenAction === "DISPOSED"
              ? "disposed after maintenance replacement"
              : "returned to inventory (AVAILABLE)";

          replacementNote = `\n--- Replacement Swap ---\nBroken: ${brokenLabel}\nReplaced With: ${replacementLabel}\nBroken Asset Action: ${brokenActionLabel}\nSwap Reason: ${cleanData.description || "Asset replaced during maintenance"}`;
        }

        const appendedNotes = [partsNote, replacementNote]
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .join("\n");

        if (appendedNotes.length > 0) {
          maintenancePayload.notes = maintenancePayload.notes
            ? `${maintenancePayload.notes}\n${appendedNotes}`
            : appendedNotes;
        }

        const performReplacementSwap = async (status: string | null) => {
          if (!replacementId) return false;
          if (status !== MAINTENANCE_STATUS.COMPLETED) return false;
          if (!resolvedAssetId || isBulkGroup) return false;

          const activeAllocation = licenseAllocations.find(
            (allocation) =>
              String(allocation.assetId) === resolvedAssetId &&
              allocation.status === ALLOCATION_STATUS_DISPLAY.ACTIVE,
          );

          if (!activeAllocation) {
            toast.error("No active allocation found for this asset.");
            return false;
          }

          const replacementAsset = assets.find(
            (asset) => String(asset.id) === replacementId,
          );
          if (!replacementAsset) {
            toast.error("Replacement asset not found.");
            return false;
          }
          if (replacementAsset.status !== ASSET_STATUS.AVAILABLE) {
            toast.error("Replacement asset is no longer available.");
            return false;
          }

          const brokenAsset = assets.find(
            (asset) => String(asset.id) === resolvedAssetId,
          );

          const allocationNotes = `Replacement for ${brokenAsset?.assetCode || "asset"
            } during maintenance`;
          const returnNotes = "Returned due to maintenance replacement";
          const returnCondition =
            resolvedBrokenAction === "DISPOSED"
              ? "POOR"
              : brokenAsset?.condition || DEFAULT_ASSET_CONDITION;

          const allocationPayload = {
            employeeId: activeAllocation.employeeId || null,
            parentAssetId: activeAllocation.parentAssetId || null,
            quantity: 1,
            notes: allocationNotes,
            conditionAtAllocation:
              replacementAsset.condition || DEFAULT_ASSET_CONDITION,
            installationLocation:
              activeAllocation.installationLocation || undefined,
            ipAddress: activeAllocation.ipAddress || undefined,
            operatingSystem: activeAllocation.operatingSystem || undefined,
          };

          try {
            if (activeAllocation.parentAssetId) {
              await dataService.revokeAllocation(
                activeAllocation.id,
                returnNotes,
                returnCondition,
              );
              await dataService.allocate(
                String(replacementAsset.id),
                replacementAsset.category,
                allocationPayload,
              );
            } else {
              await dataService.allocate(
                String(replacementAsset.id),
                replacementAsset.category,
                allocationPayload,
              );
              await dataService.revokeAllocation(
                activeAllocation.id,
                returnNotes,
                returnCondition,
              );
            }

            if (resolvedBrokenAction === "DISPOSED") {
              await dataService.disposeAsset(resolvedAssetId, {
                disposalDate: new Date().toISOString().split("T")[0],
                reason: "Disposed after maintenance replacement",
                condition: "POOR",
              });
            }

            toast.success(
              resolvedBrokenAction === "DISPOSED"
                ? "Replacement allocated and broken asset disposed."
                : "Replacement allocated and broken asset returned to inventory.",
            );
            return true;
          } catch (err) {
            toast.error(getErrorMessage(err));
            return false;
          }
        };

        const syncMaintenanceParts = async () => {
          if (!shouldSyncParts || !normalizedPartIds) return false;

          const activePartAllocations = licenseAllocations.filter(
            (allocation) =>
              allocation.status === ALLOCATION_STATUS_DISPLAY.ACTIVE &&
              String(allocation.parentAssetId) === resolvedAssetId,
          );
          const currentPartIds = new Set(
            activePartAllocations.map((allocation) =>
              String(allocation.assetId),
            ),
          );
          const desiredPartIds = normalizedPartIds;
          const desiredPartSet = new Set(desiredPartIds);

          const allocationsToRemove = activePartAllocations.filter(
            (allocation) => !desiredPartSet.has(String(allocation.assetId)),
          );
          const partIdsToAdd = desiredPartIds.filter(
            (id) => !currentPartIds.has(String(id)),
          );

          if (allocationsToRemove.length === 0 && partIdsToAdd.length === 0) {
            return false;
          }

          if (allocationsToRemove.length > 0) {
            await Promise.all(
              allocationsToRemove.map((allocation) => {
                const part = assets.find(
                  (asset) => String(asset.id) === String(allocation.assetId),
                );
                return dataService.revokeAllocation(
                  allocation.id,
                  "Removed during maintenance",
                  part?.condition || DEFAULT_ASSET_CONDITION,
                );
              }),
            );
          }

          for (const partId of partIdsToAdd) {
            const part = assets.find(
              (asset) => String(asset.id) === String(partId),
            );
            if (!part) continue;

            await dataService.allocate(part.id, part.category, {
              parentAssetId: resolvedAssetId,
              quantity: 1,
              conditionAtAllocation: part.condition || DEFAULT_ASSET_CONDITION,
              notes: "Installed during maintenance",
            });
          }

          return true;
        };

        let skipFinalRefresh = false;
        let finalRefreshScope: "all" | "maintenance" = "maintenance";

        if (selectedMaintenance?.id) {
          // Guard: skip the PUT if the linked asset is Disposed —
          // the backend will reject it anyway.
          const linkedAsset = assets.find(
            (a) =>
              String(a.id) ===
              String(cleanData.assetId ?? selectedMaintenance.assetId),
          );

          if (linkedAsset?.status === ASSET_STATUS.DISPOSED) {
            toast.error(
              "Cannot edit maintenance for a disposed asset. This record is view-only.",
            );
            setShowMaintenanceForm(false);
            setSelectedMaintenance(null);
            return;
          }

          const updated = await dataService.updateMaintenance(
            selectedMaintenance.id,
            maintenancePayload,
          );

          // Extract the auto-renewed record (if any) before setting state
          const renewedRecord = (updated as any).renewed as
            | MaintenanceRecord
            | undefined;

          setMaintenanceRecords((prev) => {
            let next = prev.map((m) =>
              m.id === selectedMaintenance.id ? updated : m,
            );
            // If backend auto-renewed a recurring maintenance, add the new record
            if (renewedRecord) {
              next = [renewedRecord, ...next];
            }
            return next;
          });

          // Show appropriate toast
          if (renewedRecord) {
            const nextDate = formatDisplayDate(renewedRecord.scheduledDate);
            toast.success(
              `Maintenance completed. Next ${updated.frequency || "recurring"} maintenance auto-scheduled for ${nextDate}.`,
            );
          } else {
            toast.success(`Maintenance record updated — ${updated.status}.`);
          }

          if (shouldSyncParts) {
            try {
              await syncMaintenanceParts();
            } catch (err) {
              console.error("Failed to sync maintenance parts:", err);
              toast.error("Failed to update installed parts. Please retry.");
            }
          }

          await performReplacementSwap(updated.status || finalStatus);

          // Close modal immediately so UI feels responsive and doesn't show transient conflicts
          setShowMaintenanceForm(false);
          setSelectedMaintenance(null);

          // Refresh all data so the UI accurately reflects any status changes and part (un)allocations
          try {
            await refreshAllocationData(false, "all");
          } catch (err) {
            console.error(
              "Failed to refresh data after maintenance save:",
              err,
            );
          }

          skipFinalRefresh = true;
        } else if (_applyToAllUnits && _bulkParentId) {
          // Bulk Creation — single group record for all units
          const newRecord = await dataService.createBulkMaintenance({
            bulkParentId: _bulkParentId,
            scheduledDate: maintenancePayload.scheduledDate || "",
            description: maintenancePayload.description || "",
            status: maintenancePayload.status,
            completionDate: maintenancePayload.completionDate,
            technician: maintenancePayload.technician,
            cost: maintenancePayload.cost,
            notes: maintenancePayload.notes,
            frequency: maintenancePayload.frequency,
            skipAssetIds: _skipAssetIds || [],
          });

          setMaintenanceRecords((prev) => [newRecord, ...prev]);

          // Use the backend's descriptive message (includes skip count)
          const backendMsg = (newRecord as any)._backendMessage;
          const unitCount = (newRecord as any).childUnitCount || "all";
          if (backendMsg && backendMsg.includes("skipped")) {
            toast.warning(backendMsg);
          } else {
            toast.success(
              backendMsg || `Group maintenance scheduled for ${unitCount} units.`,
            );
          }
        } else {
          const newMaintenance =
            await dataService.createMaintenance(maintenancePayload);
          setMaintenanceRecords((prev) => [newMaintenance, ...prev]);
          toast.success("Maintenance record created successfully!");

          if (shouldSyncParts) {
            try {
              const partsChanged = await syncMaintenanceParts();
              finalRefreshScope = partsChanged ? "all" : "maintenance";
            } catch (err) {
              console.error("Failed to sync maintenance parts:", err);
              toast.error("Failed to update installed parts. Please retry.");
              finalRefreshScope = "all";
            }
          }

          const swapPerformed = await performReplacementSwap(finalStatus);
          if (swapPerformed) finalRefreshScope = "all";
        }

        // Close modal immediately on success before background refresh
        setShowMaintenanceForm(false);
        setSelectedMaintenance(null);

        if (!skipFinalRefresh) {
          // Refresh after maintenance save; scope widens when parts were updated.
          await refreshAllocationData(true, finalRefreshScope);
        }
      } catch (err) {
        toast.error(getErrorMessage(err));
      }
    },
    [selectedMaintenance, refreshAllocationData, assets, licenseAllocations],
  );

  const handleCancelMaintenance = useCallback(
    async (id: string, reason: string) => {
      try {
        const maintenanceRecord = maintenanceRecords.find(
          (m) => String(m.id) === String(id),
        );
        // Cancel via status update instead of soft-delete
        const updated = await dataService.updateMaintenance(id, {
          status: MAINTENANCE_STATUS.CANCELLED,
          notes: reason
            ? `Cancelled: ${reason}`
            : maintenanceRecord?.notes || null,
        });
        if (maintenanceRecord) {
          setMaintenanceRecords((prev) =>
            prev.map((m) =>
              String(m.id) === String(id) ? { ...m, ...updated } : m,
            ),
          );

          toast.success("Maintenance record cancelled successfully.");

          // Refresh the associated asset to reflect status changes in background
          if (maintenanceRecord.assetId) {
            refreshAllocationData(false, "asset").catch(() => { });
          }
        }
      } catch (err) {
        toast.error("Failed to cancel maintenance record.");
      }
    },
    [maintenanceRecords],
  );

  const handleDeleteMaintenance = useCallback(
    async (id: string, reason: string) => {
      try {
        const maintenanceRecord = maintenanceRecords.find(
          (m) => String(m.id) === String(id),
        );
        await dataService.deleteMaintenance(id);
        if (maintenanceRecord) {
          setMaintenanceRecords((prev) =>
            prev.filter((m) => String(m.id) !== String(id)),
          );
          toast.success("Maintenance record deleted permanently.");

          if (maintenanceRecord.assetId) {
            refreshAllocationData(false, "asset").catch(() => { });
          }
        }
      } catch (err) {
        toast.error("Failed to delete maintenance record.");
      }
    },
    [maintenanceRecords],
  );

  // Unified allocation handler - works for ALL asset categories
  const handleAllocateLicense = useCallback(
    (assetId: string) =>
      async (
        allocationsData: Array<{
          employeeId: string;
          userName: string;
          department: string;
          count: number;
          parentAssetId?: string;
          conditionAtAllocation?: string;
          installationLocation?: string;
          serialNumber?: string;
          targetUnitId?: string;
          ipAddress?: string;
          macAddress?: string;
          operatingSystem?: string;
        }>,
      ) => {
        try {
          const asset = processedAssets.find((a) => a.id === assetId);
          // Allow allocation for any asset (removed supportsBulkAllocation check to fix single-unit allocation)
          if (!asset) return;

          let bulkAllocateResult: any = null;
          if (allocationsData.length > 1) {
            bulkAllocateResult = await dataService.bulkAllocate(
              assetId,
              asset.category,
              allocationsData.map((data) => ({
                employeeId: data.employeeId || null,
                parentAssetId: data.parentAssetId || null,
                quantity: data.count,
                conditionAtAllocation: data.conditionAtAllocation || "GOOD",
                installationLocation: data.installationLocation || undefined,
                serialNumber: data.serialNumber || undefined,
                targetUnitId: data.targetUnitId || undefined,
                ipAddress: data.ipAddress || undefined,
                macAddress: data.macAddress || undefined,
                operatingSystem: data.operatingSystem || undefined,
              })),
            );
          } else {
            for (const data of allocationsData) {
              // Use unified allocate function - internally routes to correct API based on category
              await dataService.allocate(assetId, asset.category, {
                employeeId: data.employeeId || null,
                parentAssetId: data.parentAssetId || null,
                quantity: data.count,
                conditionAtAllocation: data.conditionAtAllocation || "GOOD",
                installationLocation: data.installationLocation || undefined,
                serialNumber: data.serialNumber || undefined,
                targetUnitId: data.targetUnitId || undefined,
                ipAddress: data.ipAddress || undefined,
                macAddress: data.macAddress || undefined,
                operatingSystem: data.operatingSystem || undefined,
              });
            }
          }

          // Show success toast IMMEDIATELY — don't wait for full refresh
          if (allocationsData.length > 1) {
            if (bulkAllocateResult?._backendMessage && bulkAllocateResult._backendMessage.includes("Skipped")) {
              toast.warning(bulkAllocateResult._backendMessage);
            } else {
              toast.success(
                `Allocated ${allocationsData.length} units successfully`,
              );
            }
          } else {
            const firstAlloc = allocationsData[0];
            const targetUnit = firstAlloc?.targetUnitId
              ? processedAssets.find(
                (a) => String(a.id) === String(firstAlloc.targetUnitId),
              )
              : null;
            const unitLabel =
              targetUnit?.assetName || asset.assetName || "Asset";
            const allocatedTo = firstAlloc?.parentAssetId
              ? `to ${processedAssets.find((a) => String(a.id) === String(firstAlloc.parentAssetId))?.assetName || "asset"}`
              : firstAlloc?.userName
                ? `to ${firstAlloc.userName}`
                : "";
            toast.success(
              `Allocated ${unitLabel}${allocatedTo ? ` ${allocatedTo}` : ""}`,
            );
          }

          // Refresh only assets + allocations — history and maintenance are unaffected by allocation
          refreshAllocationData(false, "allocation");
          window.dispatchEvent(new CustomEvent("refreshNotifications"));
        } catch (err) {
          // Still refresh data because a failure (like 409 Conflict) means our client data is stale
          refreshAllocationData(false, "allocation");
          window.dispatchEvent(new CustomEvent("refreshNotifications"));
          throw err;
        }
      },
    [processedAssets, refreshAllocationData],
  );

  // Unified revoke handler - works for ALL asset categories
  const handleRevokeLicense = useCallback(
    async (
      allocationId: string,
      conditionAtReturn?: string,
      notes?: string,
    ) => {
      try {
        const allocation = licenseAllocations.find(
          (a) => String(a.id) === String(allocationId),
        );
        if (!allocation) return;

        await dataService.revokeAllocation(
          allocationId,
          notes,
          conditionAtReturn,
        );

        // Show success toast IMMEDIATELY — don't wait for data refresh
        toast.success("Successfully revoked allocation");

        // ─── OPTIMISTIC STATE UPDATES ───
        // Immediately update local state so ALL views (user records, asset detail,
        // allocation tables) reflect the change without needing a page refresh.
        // The background refreshAllocationData() will later sync with server truth.

        // 1. Mark this allocation as "Returned" in local state
        setLicenseAllocations((prev) =>
          prev.map((a) =>
            String(a.id) === String(allocationId)
              ? {
                ...a,
                status: ALLOCATION_STATUS_DISPLAY.RETURNED,
                returnDate: new Date().toISOString(),
                conditionAtReturn: conditionAtReturn || "GOOD",
              }
              : a,
          ),
        );

        const asset = processedAssets.find(
          (a) => String(a.id) === String(allocation.assetId),
        );
        if (asset) {
          // Map conditionAtReturn to valid asset Condition values (EXCELLENT/GOOD/FAIR/POOR)
          const assetConditionMap: Record<string, Asset["condition"]> = {
            EXCELLENT: "EXCELLENT",
            GOOD: "GOOD",
            FAIR: "FAIR",
            POOR: "POOR",
          };
          const mappedCondition =
            assetConditionMap[conditionAtReturn || "GOOD"] || "GOOD";

          // Update the asset's own Condition field to reflect the return condition
          const updates: Partial<Asset> = {
            condition: mappedCondition,
            // Clear allocation-related fields so the unit no longer shows stale data
            userName: "",
            employeeId: "",
            parentAssetId: undefined,
            parentAssetName: "",
            installationLocation: "",
          };

          // Automatic Status Update on Revoke
          const currentAllocated = asset.allocatedQuantity || 0;
          const returnedCount = allocation.licensesAllocated || 1;
          const newAllocatedCount = Math.max(
            0,
            currentAllocated - returnedCount,
          );
          const totalQty = asset.totalQuantity || 0;

          if (
            newAllocatedCount === 0 &&
            asset.status !== ASSET_STATUS.AVAILABLE
          ) {
            updates.status = ASSET_STATUS.AVAILABLE;
          } else if (
            newAllocatedCount > 0 &&
            newAllocatedCount < totalQty &&
            asset.status !== ASSET_STATUS.PARTIALLY_ALLOCATED
          ) {
            updates.status = ASSET_STATUS.PARTIALLY_ALLOCATED;
          }

          // 2. Optimistically update the asset in local state
          setAssets((prev) =>
            prev.map((a) =>
              String(a.id) === String(asset.id) ? { ...a, ...updates } : a,
            ),
          );

          // Revoke only affects assets + allocations — maintenance and history unchanged
          refreshAllocationData(true, "allocation").catch(() => { });
        } else {
          // No asset found — just refresh in background
          refreshAllocationData(true, "allocation").catch(() => { });
        }
      } catch (err) {
        const errorMessage = getErrorMessage(err);

        // If already returned, refresh data to sync UI with server state
        if (errorMessage.toLowerCase().includes("already returned")) {
          toast.warning(
            "This allocation was already returned. Refreshing data...",
          );
          refreshAllocationData(true, "allocation");
        } else {
          toast.error(errorMessage);
        }
      }
    },
    [
      licenseAllocations,
      processedAssets,
      refreshAllocationData,
      setAssets,
      setLicenseAllocations,
    ],
  );

  const handleBulkRevoke = useCallback(
    async (
      revocations: Array<{
        allocationId: string;
        conditionAtReturn: string;
        notes?: string;
      }>,
    ) => {
      try {
        await dataService.bulkRevokeAllocation(revocations);
        toast.success(
          `Successfully revoked ${revocations.length} allocation(s)`,
        );
        // Bulk revoke: assets + allocations only
        await refreshAllocationData(true, "allocation");
      } catch (error) {
        toast.error(getErrorMessage(error));
      }
    },
    [refreshAllocationData],
  );

  const actualRole = currentUser?.role || "Viewer";
  const currentRole = isViewerViewEnabled ? "Viewer" : actualRole;
  const viewerEmployeeId = currentUser?.employeeId || "";
  const isAdmin = currentRole === "Admin";
  const isManager = currentRole === "Manager";
  const isViewer = currentRole === "Viewer";
  const canAccessAllocations = currentRole !== "Viewer";
  const canAccessReports = currentRole !== "Viewer";
  const canAccessSettings = isAdmin;
  const canApproveAnomalies = isAdmin || isManager;

  useEffect(() => {
    if (!isAuthenticated || !canAccessSettings) {
      setControlSettings(null);
      return;
    }

    let isActive = true;

    dataService
      .getNotificationControlSettings()
      .then((settings) => {
        if (isActive) setControlSettings(settings);
      })
      .catch(() => {
        if (isActive) setControlSettings(null);
      });

    return () => {
      isActive = false;
    };
  }, [isAuthenticated, canAccessSettings]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const handleSettingsChanged = () => {
      dataService.getNotificationControlSettings(true).then((s) => {
        setControlSettings(s);
        setNotificationControl(s);
      }).catch(() => { });
    };
    window.addEventListener("controlSettingsChanged", handleSettingsChanged);
    return () => window.removeEventListener("controlSettingsChanged", handleSettingsChanged);
  }, [isAuthenticated]);

  useEffect(() => {
    // Only Admin (Admin) has access to notification control settings.
    // Manager does not have access to GET /api/notifications/control-settings.
    if (!isAuthenticated || !canAccessSettings) {
      setNotificationControl(null);
      return;
    }

    let isActive = true;

    dataService
      .getNotificationControlSettings()
      .then((settings) => {
        if (isActive) setNotificationControl(settings);
      })
      .catch(() => {
        if (isActive)
          setNotificationControl(DEFAULT_NOTIFICATION_CONTROL_SETTINGS);
      });

    return () => {
      isActive = false;
    };
  }, [isAuthenticated, canAccessSettings]);

  const hoarderStepLabel =
    notificationControl?.hoarderAlertStep ??
    DEFAULT_NOTIFICATION_CONTROL_SETTINGS.hoarderAlertStep;
  const duplicateStepLabel =
    notificationControl?.softwareDuplicateAlertStep ??
    DEFAULT_NOTIFICATION_CONTROL_SETTINGS.softwareDuplicateAlertStep;

  const resolveAnomalyTypeLabel = (alert: PendingAnomalyAlert) => {
    const rawType = String(alert.anomalyType || "").toUpperCase();
    if (rawType === "SOFTWARE_DUPLICATE") return "Software Duplicate";
    if (rawType === "HOARDER") return "Hoarder";
    if (rawType === "LEMON") return "Lemon Hardware";
    if (rawType === "GHOST_ASSET") return "Ghost Asset";
    return "Anomaly";
  };

  const stripAutoSendMessage = (message?: string | null) => {
    if (!message) return "";
    return String(message)
      .replace(/\s*Auto-send.*$/i, "")
      .trim();
  };

  const formatAnomalyTimestamp = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString();
  };

  const formatAutoSendLabel = (scheduledFor?: string | null) => {
    if (!scheduledFor) return "Auto-send in 5 min.";
    const parsed = new Date(scheduledFor);
    if (Number.isNaN(parsed.getTime())) return "Auto-send in 5 min.";

    const diffMs = parsed.getTime() - Date.now();
    if (diffMs <= 0) return "Auto-send is due now.";

    const totalSeconds = Math.ceil(diffMs / 1000);

    if (totalSeconds > 60) {
      const minutes = Math.ceil(totalSeconds / 60);
      return `Auto-send in ${minutes} min${minutes === 1 ? "" : "s"}.`;
    }

    return `Auto-send in ${totalSeconds} sec.`;
  };

  const handleApproveAnomaly = useCallback(async (alertId: number) => {
    if (anomalyActionInFlightRef.current.has(alertId)) {
      return;
    }

    anomalyActionInFlightRef.current.add(alertId);
    setAnomalyActionIds((prev) => {
      const next = new Set(prev);
      next.add(alertId);
      return next;
    });

    // Optimistically remove from state
    setPendingAnomalies((prev) => prev.filter((a) => a.id !== alertId));

    try {
      await dataService.approveAnomalyAlert(alertId);
      toast.success("Anomaly email dispatched");
    } catch (err) {
      toast.error(getErrorMessage(err) || "Failed to send anomaly email");
    } finally {
      anomalyActionInFlightRef.current.delete(alertId);
      setAnomalyActionIds((prev) => {
        const next = new Set(prev);
        next.delete(alertId);
        return next;
      });
    }
  }, []);

  const handleIgnoreAnomaly = useCallback(async (alertId: number) => {
    if (anomalyActionInFlightRef.current.has(alertId)) {
      return;
    }

    anomalyActionInFlightRef.current.add(alertId);
    setAnomalyActionIds((prev) => {
      const next = new Set(prev);
      next.add(alertId);
      return next;
    });

    // Optimistically remove from state
    setPendingAnomalies((prev) => prev.filter((a) => a.id !== alertId));

    try {
      await dataService.ignoreAnomalyAlert(alertId);
      toast.success("Anomaly notification suppressed");
    } catch (err) {
      toast.error(getErrorMessage(err) || "Failed to suppress anomaly");
    } finally {
      anomalyActionInFlightRef.current.delete(alertId);
      setAnomalyActionIds((prev) => {
        const next = new Set(prev);
        next.delete(alertId);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !canApproveAnomalies) {
      setPendingAnomalies([]);
      return;
    }

    let isActive = true;

    const pollPendingAnomalies = async () => {
      // Skip if inactive, already fetching, or if the tab is hidden (to save server credits)
      if (
        !isActive ||
        anomalyFetchInFlightRef.current ||
        document.visibilityState !== "visible"
      )
        return;
      anomalyFetchInFlightRef.current = true;

      try {
        const pending = await dataService.getPendingAnomalyApprovals();
        if (!isActive) return;
        const anomalies = pending || [];

        // On first poll after login, seed the prev ref so these aren't treated
        // as "new" anomalies — prevents auto-opening the overlay for alerts
        // that were created during a previous user's session.
        if (initialAnomalyLoadRef.current) {
          initialAnomalyLoadRef.current = false;
          prevPendingAnomaliesRef.current = anomalies;
        }

        setPendingAnomalies(anomalies);
        // NOTE: We no longer force-open the overlay here.
        // The seenSet useEffect below is the SOLE gatekeeper — it only
        // opens the overlay when a genuinely NEW alert ID appears.
      } catch (err) {
        console.error("Failed to fetch pending anomaly approvals:", err instanceof Error ? err.message : err);
      } finally {
        anomalyFetchInFlightRef.current = false;
      }
    };

    pollPendingAnomalies();

    // Listen for "REFRESH_ANOMALIES" signal from other components.
    // We no longer force-open — the seenSet useEffect handles visibility.
    const handleManualSignal = () => {
      pollPendingAnomalies();
    };

    window.addEventListener("REFRESH_ANOMALIES", handleManualSignal);

    return () => {
      isActive = false;
      window.removeEventListener("REFRESH_ANOMALIES", handleManualSignal);
    };
  }, [isAuthenticated, canApproveAnomalies]);

  // --- BACKGROUND POLLING: Auto-refresh data every 30s for ALL authenticated users ---
  // This solves the problem where a user sits on the website without interacting,
  // but we want them to see new assets/maintenance records added by other users.
  useEffect(() => {
    if (!isAuthenticated) return;
    let isActive = true;

    const autoRefreshData = async () => {
      if (!isActive || document.visibilityState !== "visible") return;

      try {
        const syncStatus = await dataService.getSyncStatus();
        const prevStatus = lastDataTimestampsRef.current;

        let needsAssets = false;
        let needsAllocations = false;
        let needsMaintenance = false;
        let needsHistory = false;
        let needsUsers = false;

        // Compare timestamps. If null, we assume we need to fetch.
        if (syncStatus.assets !== prevStatus.assets || !prevStatus.assets) needsAssets = true;
        if (syncStatus.allocations !== prevStatus.allocations || !prevStatus.allocations) needsAllocations = true;
        if (syncStatus.maintenance !== prevStatus.maintenance || !prevStatus.maintenance) needsMaintenance = true;
        if (syncStatus.history !== prevStatus.history || !prevStatus.history) needsHistory = true;
        // If users changed, we need to refresh assets because the user's role or managed categories might have changed, and also refresh users list
        if (syncStatus.users !== prevStatus.users || !prevStatus.users) {
          needsAssets = true;
          needsUsers = true;
        }

        lastDataTimestampsRef.current = syncStatus;

        if (needsAssets || needsAllocations || needsMaintenance || needsHistory || needsUsers) {
          refreshAllocationData(true, {
            assets: needsAssets,
            allocations: needsAllocations,
            maintenance: needsMaintenance,
            history: needsHistory,
            users: needsUsers
          }).catch((err) =>
            console.error("Failed background data sync:", err instanceof Error ? err.message : err)
          );
        }
      } catch (err) {
        console.error("Failed to check sync status:", err);
      }

      // Only Admin/Manager have access to /api/notifications/control-settings.
      // Skipping the call for Viewers prevents a noisy 403 in the console.
      if (canAccessSettings || canApproveAnomalies) {
        dataService.getNotificationControlSettings(true).catch(() => { });
      }

      // Synchronized app-wide tick: re-fetch the notification bell IN PARALLEL
      try {
        window.dispatchEvent(new CustomEvent("APP_DATA_TICK"));
        window.dispatchEvent(new CustomEvent("REFRESH_ANOMALIES"));
      } catch {
        // CustomEvent is supported everywhere we run; ignore if not.
      }
    };

    // Use the same interval as anomalies to batch network requests roughly
    const pollIntervalId = window.setInterval(autoRefreshData, ANOMALY_POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        autoRefreshData();
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isActive = false;
      window.clearInterval(pollIntervalId);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAuthenticated, refreshAllocationData, canAccessSettings, canApproveAnomalies]);

  useEffect(() => {
    const next = pendingAnomalies;
    if (!currentUser?.employeeId) return;

    const storageKey = `seen_anomalies_${currentUser.employeeId}`;
    const signatureStorageKey = `seen_anomaly_signatures_${currentUser.employeeId}`;

    let seenIds: number[] = [];
    let seenSignatures: string[] = [];

    try {
      seenIds = JSON.parse(localStorage.getItem(storageKey) || "[]");
    } catch {
      seenIds = [];
    }

    try {
      seenSignatures = JSON.parse(
        localStorage.getItem(signatureStorageKey) || "[]",
      );
    } catch {
      seenSignatures = [];
    }

    const seenSet = new Set(seenIds);
    const seenSigSet = new Set(seenSignatures);
    const prevById = new Map(
      prevPendingAnomaliesRef.current.map((alert) => [alert.id, alert]),
    );

    const getAnomalySignature = (alert: PendingAnomalyAlert) => {
      const type = String(alert.anomalyType || "").toUpperCase();
      const payload = (alert.payload || {}) as any;
      const createdAt = String(alert.createdAt || "");
      const scheduledFor = String(alert.scheduledFor || "");
      const base = `${alert.id}:${createdAt}:${scheduledFor}`;

      if (type === "SOFTWARE_DUPLICATE") {
        const userName = String(payload.userName || "").trim();
        const softwareName = String(payload.softwareName || "").trim();
        return `${base}:SOFTWARE_DUPLICATE:${userName}:${softwareName}`;
      }

      if (type === "HOARDER") {
        const employeeId = String(payload.employeeId || "").trim();
        const assetType = String(payload.assetType || "").trim();
        return `${base}:HOARDER:${employeeId}:${assetType}`;
      }

      if (type === "LEMON") {
        const assetCode = String(payload.assetCode || "").trim();
        return `${base}:LEMON:${assetCode}`;
      }

      if (type === "GHOST_ASSET") {
        const dateStr = alert.createdAt
          ? alert.createdAt.split("T")[0]
          : new Date().toISOString().split("T")[0];
        return `${base}:GHOST_ASSET:${dateStr}`;
      }

      return `${base}:${type}`;
    };

    let shouldOpen = false;

    for (const a of next) {
      const sig = getAnomalySignature(a);
      const previous = prevById.get(a.id);
      const isNewOrUpdated =
        !previous ||
        previous.createdAt !== a.createdAt ||
        previous.scheduledFor !== a.scheduledFor;

      if (isNewOrUpdated && !seenSigSet.has(sig)) {
        // Show the popup for any genuinely new anomaly.
        // seenSigSet deduplication prevents repeat popups for the same alert.
        // initialAnomalyLoadRef prevents existing anomalies from popping up on login.
        // Only trigger the pop-up if the anomaly has no allocatedBy field (background check)
        // or if it matches the current user's employeeId (who triggered the allocation).
        if (!a.allocatedBy || String(a.allocatedBy) === String(currentUser.employeeId)) {
          shouldOpen = true;
        }
      }

      seenSigSet.add(sig);
      seenSet.add(a.id);
    }

    localStorage.setItem(storageKey, JSON.stringify(Array.from(seenSet)));
    localStorage.setItem(
      signatureStorageKey,
      JSON.stringify(Array.from(seenSigSet)),
    );

    if (shouldOpen) {
      setIsAnomalyOverlayOpen(true);
    }

    if (next.length === 0) setIsAnomalyOverlayOpen(false);

    prevPendingAnomaliesRef.current = next;
  }, [pendingAnomalies, currentUser?.employeeId]);

  useEffect(() => {
    if (!isAnomalyOverlayOpen) return;

    const timerId = window.setTimeout(() => {
      setIsAnomalyOverlayOpen(false);
    }, 60000);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [isAnomalyOverlayOpen]);

  const viewerActiveAssetIds = useMemo(() => {
    if (!isViewer || !viewerEmployeeId) return null;

    const activeIds = new Set<string>();

    const isViewerInUseAssetStatus = (status: string | null | undefined) =>
      status === ASSET_STATUS.ALLOCATED ||
      status === ASSET_STATUS.PARTIALLY_ALLOCATED ||
      status === ASSET_STATUS.UNDER_MAINTENANCE;

    for (const allocation of licenseAllocations) {
      if (String(allocation.employeeId || "") !== String(viewerEmployeeId)) {
        continue;
      }

      if (allocation.status === ALLOCATION_STATUS_DISPLAY.ACTIVE) {
        activeIds.add(String(allocation.assetId));
      }
    }

    for (const asset of processedAssets) {
      if (
        String(asset.employeeId || "") === String(viewerEmployeeId) &&
        isViewerInUseAssetStatus(asset.status)
      ) {
        activeIds.add(String(asset.id));
      }
    }

    return activeIds;
  }, [isViewer, licenseAllocations, processedAssets, viewerEmployeeId]);

  const viewerActiveChainIds = useMemo(() => {
    if (!isViewer || !viewerActiveAssetIds) return null;

    const chainIds = new Set<string>(viewerActiveAssetIds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const allocation of licenseAllocations) {
        if (allocation.status !== ALLOCATION_STATUS_DISPLAY.ACTIVE) continue;
        const allocationAssetId = String(allocation.assetId);
        const parentAssetId = allocation.parentAssetId ? String(allocation.parentAssetId) : null;
        if (parentAssetId && chainIds.has(parentAssetId)) {
          if (!chainIds.has(allocationAssetId)) {
            chainIds.add(allocationAssetId);
            changed = true;
          }
        }
      }
    }
    return chainIds;
  }, [isViewer, viewerActiveAssetIds, licenseAllocations]);

  const visibleAssetIdsForViewer = useMemo(() => {
    if (!isViewer || !viewerEmployeeId) return null;

    const viewerAssetIds = new Set<string>();
    const viewerHistoricalAssetIds = new Set<string>();

    for (const allocation of licenseAllocations) {
      if (String(allocation.employeeId || "") !== String(viewerEmployeeId)) {
        continue;
      }

      viewerHistoricalAssetIds.add(String(allocation.assetId));
    }

    for (const entry of assetHistory) {
      if (String(entry.employeeId || "") === String(viewerEmployeeId)) {
        viewerHistoricalAssetIds.add(String(entry.assetId));
      }
    }

    // Include historical chain allocations: recursively include assets allocated to
    // assets that the viewer has historically owned.
    let historicalChainChanged = true;
    while (historicalChainChanged) {
      historicalChainChanged = false;
      for (const allocation of licenseAllocations) {
        const assetIdStr = String(allocation.assetId);
        if (allocation.parentAssetId) {
          const parentIdStr = String(allocation.parentAssetId);
          if (viewerHistoricalAssetIds.has(parentIdStr) && !viewerHistoricalAssetIds.has(assetIdStr)) {
            viewerHistoricalAssetIds.add(assetIdStr);
            historicalChainChanged = true;
          }
        }
      }
    }

    // Base visibility: currently in-use assets for this viewer + historical assets they once held.
    if (viewerActiveAssetIds) {
      for (const assetId of viewerActiveAssetIds) {
        viewerAssetIds.add(assetId);
      }
    }
    for (const assetId of viewerHistoricalAssetIds) {
      viewerAssetIds.add(assetId);
    }

    // Include chain-allocated assets (assets allocated to assets the viewer currently owns).
    if (viewerActiveChainIds) {
      for (const chainId of viewerActiveChainIds) {
        viewerAssetIds.add(chainId);
      }
    }

    // Keep viewer-linked assets visible while maintenance is active, even after
    // automatic allocation revoke transitions Active -> Returned/Revoked.
    const activeMaintenanceRecords = maintenanceRecords.filter(
      (record) =>
        record.status === MAINTENANCE_STATUS.SCHEDULED ||
        record.status === MAINTENANCE_STATUS.IN_PROGRESS,
    );

    for (const record of activeMaintenanceRecords) {
      const maintenanceAssetId = String(record.assetId);

      if (viewerHistoricalAssetIds.has(maintenanceAssetId)) {
        viewerAssetIds.add(maintenanceAssetId);
        continue;
      }

      // Bulk group maintenance is stored on the parent. If viewer had a child unit
      // under that parent, keep both parent record context and child asset visible.
      const viewerLinkedChildren = processedAssets.filter(
        (asset) =>
          String(asset.bulkOrderParentId || "") === maintenanceAssetId &&
          viewerHistoricalAssetIds.has(String(asset.id)),
      );

      if (viewerLinkedChildren.length > 0) {
        viewerAssetIds.add(maintenanceAssetId);
        for (const childAsset of viewerLinkedChildren) {
          viewerAssetIds.add(String(childAsset.id));
        }
      }
    }

    return viewerAssetIds;
  }, [
    isViewer,
    maintenanceRecords,
    licenseAllocations,
    processedAssets,
    viewerEmployeeId,
    viewerActiveAssetIds,
    viewerActiveChainIds,
    assetHistory,
  ]);

  const scopedLicenseAllocations = useMemo(() => {
    if (!isViewer || !viewerEmployeeId || !visibleAssetIdsForViewer)
      return licenseAllocations;
    return licenseAllocations
      .filter((allocation) => {
        // Strict Isolation: Viewers only see their own allocation records
        if (String(allocation.employeeId || "") === String(viewerEmployeeId)) {
          return true;
        }
        // Only show chain allocations if the parent asset belongs (or belonged) to this viewer.
        if (
          allocation.parentAssetId &&
          visibleAssetIdsForViewer.has(String(allocation.parentAssetId))
        ) {
          return true;
        }
        return false;
      })
      .map((allocation) => {
        // If it is a chain allocation, check if the parent asset is currently active for this viewer.
        // If the parent asset is NOT currently active, we mark this child allocation as returned
        // so that the child asset status computes correctly as "Return".
        if (
          allocation.parentAssetId &&
          (!viewerActiveAssetIds || !viewerActiveAssetIds.has(String(allocation.parentAssetId)))
        ) {
          return {
            ...allocation,
            status: ALLOCATION_STATUS_DISPLAY.RETURNED,
          };
        }
        return allocation;
      });
  }, [
    isViewer,
    licenseAllocations,
    viewerEmployeeId,
    visibleAssetIdsForViewer,
    viewerActiveAssetIds,
  ]);

  const viewerProcessedAssets = useMemo(() => {
    if (!isViewer) return processedAssets;
    return assets
      .filter((asset) => asset && asset.id)
      .map((asset) =>
        computeAssetViewData(
          asset,
          scopedLicenseAllocations,
          maintenanceRecords,
          assets,
        ),
      );
  }, [
    isViewer,
    assets,
    scopedLicenseAllocations,
    maintenanceRecords,
    processedAssets,
  ]);

  const managerFilteredAssets = useMemo(() => {
    if (
      isViewer ||
      !currentUser ||
      currentUser.role !== "Manager" ||
      !currentUser.managedCategories ||
      currentUser.managedCategories.length === 0 ||
      currentUser.managedCategories.includes("ALL")
    ) {
      return processedAssets;
    }
    return processedAssets.filter((asset) =>
      currentUser.managedCategories!.includes(asset.category)
    );
  }, [isViewer, currentUser, processedAssets]);

  const displayAssets = isViewer ? viewerProcessedAssets : managerFilteredAssets;

  const scopedAssets = useMemo(() => {
    if (!visibleAssetIdsForViewer) return displayAssets;
    return displayAssets.filter((asset) => {
      if (!visibleAssetIdsForViewer.has(String(asset.id))) return false;
      if (isViewer && asset.isBulkOrder) return false;
      return true;
    });
  }, [displayAssets, visibleAssetIdsForViewer, isViewer]);

  const viewerAssetIdsForMaintenance = useMemo(() => {
    if (!visibleAssetIdsForViewer) return null;

    const maintenanceAssetIds = new Set<string>(visibleAssetIdsForViewer);

    // Extract related bulk parent/child IDs so viewer can see group + unit maintenance.
    for (const asset of processedAssets) {
      const assetId = String(asset.id);
      if (!visibleAssetIdsForViewer.has(assetId)) continue;

      // If a visible asset is a child unit, include its parent ID for group records.
      if (asset.bulkOrderParentId) {
        maintenanceAssetIds.add(String(asset.bulkOrderParentId));
      }

      // If a visible asset is a bulk parent, include all child unit IDs.
      if (asset.isBulkOrder) {
        for (const childAsset of processedAssets) {
          if (
            String(childAsset.bulkOrderParentId || "") === assetId &&
            !childAsset.isBulkOrder
          ) {
            maintenanceAssetIds.add(String(childAsset.id));
          }
        }
      }
    }

    return maintenanceAssetIds;
  }, [processedAssets, visibleAssetIdsForViewer]);

  const scopedMaintenanceRecords = useMemo(() => {
    if (!isViewer || !viewerEmployeeId || !viewerAssetIdsForMaintenance)
      return maintenanceRecords;

    // For Viewers, only show maintenance records that occurred while the asset was assigned to them.
    // This prevents Viewers from seeing historical maintenance from previous owners.
    return maintenanceRecords.filter((record) => {
      if (!viewerAssetIdsForMaintenance.has(String(record.assetId)))
        return false;

      // If the maintenance record is on a bulk parent, find child units
      const childUnitIds = new Set<string>();
      for (const asset of processedAssets) {
        if (String(asset.bulkOrderParentId || "") === String(record.assetId)) {
          childUnitIds.add(String(asset.id));
        }
      }

      // Find allocations for this viewer for this asset (direct or child units)
      const viewerAllocations = licenseAllocations.filter(
        (a) => {
          const isDirect = String(a.assetId) === String(record.assetId);
          const isChild = childUnitIds.has(String(a.assetId));

          if (!isDirect && !isChild) return false;
          if (String(a.employeeId || "") !== String(viewerEmployeeId)) return false;

          // For child units in a bulk group record, check if they are actually covered
          if (isChild && record.snapshotCoveredUnits) {
            const isCovered = record.snapshotCoveredUnits.some(
              (u) => String(u.id) === String(a.assetId)
            );
            if (!isCovered) return false;
          }

          return true;
        }
      );

      // Find chain allocations for this asset (where it's allocated to a parent the viewer owns)
      const chainAllocations = licenseAllocations.filter(
        (a) => {
          const isDirect = String(a.assetId) === String(record.assetId);
          const isChild = childUnitIds.has(String(a.assetId));

          if (!isDirect && !isChild) return false;
          if (!a.parentAssetId || !visibleAssetIdsForViewer?.has(String(a.parentAssetId))) return false;

          // For child units in a bulk group record, check if they are actually covered
          if (isChild && record.snapshotCoveredUnits) {
            const isCovered = record.snapshotCoveredUnits.some(
              (u) => String(u.id) === String(a.assetId)
            );
            if (!isCovered) return false;
          }

          return true;
        }
      );

      const relevantAllocations = [...viewerAllocations, ...chainAllocations];

      if (relevantAllocations.length === 0) return false;

      const stripTime = (dateStr: string) => {
        const d = new Date(dateStr);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      };

      // Check if the maintenance window overlaps with any of the relevant allocation windows.
      const maintStart = stripTime(record.scheduledDate);
      const maintEnd = record.completionDate
        ? stripTime(record.completionDate)
        : maintStart;

      return relevantAllocations.some((a) => {
        const allocStart = stripTime(a.allocationDate);
        const allocEnd = a.returnDate
          ? stripTime(a.returnDate)
          : Infinity;

        return (
          (maintStart >= allocStart && maintStart <= allocEnd) ||
          (maintEnd >= allocStart && maintEnd <= allocEnd) ||
          (allocStart >= maintStart && allocStart <= maintEnd)
        );
      });
    });
  }, [
    isViewer,
    maintenanceRecords,
    viewerAssetIdsForMaintenance,
    licenseAllocations,
    viewerEmployeeId,
  ]);

  const scopedAssetsForMaintenance = useMemo(() => {
    if (!visibleAssetIdsForViewer) return displayAssets;

    const relatedAssetIds = new Set<string>(
      scopedAssets.map((asset) => String(asset.id)),
    );

    for (const record of scopedMaintenanceRecords) {
      relatedAssetIds.add(String(record.assetId));
    }

    return displayAssets.filter((asset) =>
      relatedAssetIds.has(String(asset.id)),
    );
  }, [
    displayAssets,
    managerFilteredAssets,
    scopedMaintenanceRecords,
    visibleAssetIdsForViewer,
  ]);

  const managerFilteredMaintenanceRecords = useMemo(() => {
    if (
      isViewer ||
      !currentUser ||
      currentUser.role !== "Manager" ||
      !currentUser.managedCategories ||
      currentUser.managedCategories.length === 0 ||
      currentUser.managedCategories.includes("ALL")
    ) {
      return maintenanceRecords;
    }

    const allowedAssetIds = new Set(managerFilteredAssets.map(a => String(a.id)));

    return maintenanceRecords.filter((record) =>
      allowedAssetIds.has(String(record.assetId))
    );
  }, [isViewer, currentUser, maintenanceRecords, managerFilteredAssets]);

  const displayMaintenanceRecords = useMemo(() => {
    const baseRecords = isViewer
      ? scopedMaintenanceRecords
      : managerFilteredMaintenanceRecords;

    // The user explicitly requested: "make it so that it only appear if assetlist contain that asset"
    // Ensure we never show a maintenance record if the asset is missing (e.g. deleted or hidden)
    const allowedAssetIds = new Set(displayAssets.map((a) => String(a.id)));

    return baseRecords.filter((record) =>
      allowedAssetIds.has(String(record.assetId))
    );
  }, [isViewer, scopedMaintenanceRecords, managerFilteredMaintenanceRecords, displayAssets]);

  const selectedAsset = useMemo(
    () => displayAssets.find((a) => a.id === selectedAssetId) || null,
    [displayAssets, selectedAssetId],
  );

  const scopedAssetHistory = useMemo(() => {
    if (!isViewer || !viewerEmployeeId) return assetHistory;
    return assetHistory.filter((entry) => {
      // 1. Explicitly linked to viewer (Allocation, Return, etc.)
      if (String(entry.employeeId || "") === String(viewerEmployeeId))
        return true;

      // 2. Maintenance records — only show if they occurred during the viewer's allocation windows.
      if (entry.actionType && entry.actionType.startsWith("MAINTENANCE_")) {
        const viewerAllocations = licenseAllocations.filter(
          (a) =>
            String(a.assetId) === String(entry.assetId) &&
            String(a.employeeId || "") === String(viewerEmployeeId),
        );

        // assignedDate in history table maps to ActionDate for maintenance events
        const actionDate = new Date(entry.assignedDate).getTime();
        return viewerAllocations.some((a) => {
          const start = new Date(a.allocationDate).getTime();
          const end = a.returnDate
            ? new Date(a.returnDate).getTime()
            : Infinity;
          return actionDate >= start && actionDate <= end;
        });
      }

      return false;
    });
  }, [isViewer, assetHistory, viewerEmployeeId, licenseAllocations]);

  useEffect(() => {
    const handleOpenAssetDetail = async (e: Event) => {
      const customEvent = e as CustomEvent<{ assetId: string }>;
      const assetId = customEvent.detail?.assetId;
      if (!assetId) return;

      const asset = processedAssets.find((a) => String(a.id) === String(assetId));
      if (asset) {
        if (actualRole === "Admin" || actualRole === "Manager") {
          const hasManagerAccess = actualRole === "Admin" || (
            currentUser?.managedCategories && (
              currentUser.managedCategories.includes("ALL") ||
              currentUser.managedCategories.includes(asset.category)
            )
          );

          if (hasManagerAccess) {
            setForceViewerModeForDetail(false);
          } else {
            setIsViewerViewEnabled(true);
            setForceViewerModeForDetail(true);
          }
        } else {
          setForceViewerModeForDetail(true);
        }
        handleViewAsset(asset, true);
        return;
      }

      // Fallback: Fetch directly from server in case list is filtered or asset is not in local state
      try {
        const fetchedAsset = await dataService.getAsset(assetId);
        if (fetchedAsset) {
          const viewData = computeAssetViewData(
            fetchedAsset,
            licenseAllocations,
            maintenanceRecords,
            assets
          );
          if (actualRole === "Admin" || actualRole === "Manager") {
            const hasManagerAccess = actualRole === "Admin" || (
              currentUser?.managedCategories && (
                currentUser.managedCategories.includes("ALL") ||
                currentUser.managedCategories.includes(viewData.category)
              )
            );

            if (hasManagerAccess) {
              setForceViewerModeForDetail(false);
            } else {
              setIsViewerViewEnabled(true);
              setForceViewerModeForDetail(true);
            }
          } else {
            setForceViewerModeForDetail(true);
          }
          handleViewAsset(viewData, true);
        } else {
          toast.error("You no longer have permission to view this asset or it does not exist.");
        }
      } catch (err) {
        toast.error("You no longer have permission to view this asset or it does not exist.");
      }
    };

    window.addEventListener("OPEN_ASSET_DETAIL", handleOpenAssetDetail);
    return () => window.removeEventListener("OPEN_ASSET_DETAIL", handleOpenAssetDetail);
  }, [processedAssets, handleViewAsset, licenseAllocations, maintenanceRecords, assets, actualRole, currentUser, setIsViewerViewEnabled]);

  // Handle maintenance notification clicks from the InAppNotificationBell
  useEffect(() => {
    const handleOpenMaintenanceDetail = (e: Event) => {
      const customEvent = e as CustomEvent<{ maintenanceId: string }>;
      const maintenanceId = customEvent.detail?.maintenanceId;
      if (!maintenanceId) return;

      // Find the maintenance record using the unfiltered list to ensure it's found
      // even before state fully reconciles to viewer mode
      const record = maintenanceRecords.find(
        (m) => String(m.id) === String(maintenanceId)
      );
      if (record) {
        setSelectedMaintenanceForView(record);
        setShowMaintenanceDetail(true);
      }
    };

    window.addEventListener("OPEN_MAINTENANCE_DETAIL", handleOpenMaintenanceDetail);
    return () => window.removeEventListener("OPEN_MAINTENANCE_DETAIL", handleOpenMaintenanceDetail);
  }, [scopedMaintenanceRecords]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const isForbiddenRoute =
      (currentView === "allocations" && !canAccessAllocations) ||
      (currentView === "reports" && !canAccessReports) ||
      (currentView === "settings" && !canAccessSettings);

    if (isForbiddenRoute) {
      setCurrentView("dashboard");
    }
  }, [
    canAccessAllocations,
    canAccessReports,
    canAccessSettings,
    currentView,
    isAuthenticated,
    setCurrentView,
  ]);

  if (loading) {
    return <LoadingScreen />;
  }

  // Shared nav button renderer for desktop and mobile
  const renderNavButtons = (mobile: boolean) => {
    const baseClass = mobile
      ? "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all font-medium no-push"
      : "flex items-center gap-1.5 px-3 py-1.5 xl:px-4 xl:py-2 rounded-lg transition-all font-medium no-push text-sm";
    const activeClass = mobile
      ? "bg-blue-600 text-white shadow-sm"
      : "bg-blue-600 text-white shadow-md";
    const inactiveClass = "text-gray-700 hover:bg-gray-100";

    const roleBasedItems = navItems.filter((item) => {
      if (item.id === "allocations") return canAccessAllocations;
      if (item.id === "reports") return canAccessReports;
      return true;
    });
    const allItems = isAdmin
      ? [...roleBasedItems, settingsNavItem, { id: "guide" as View, label: "Guide" }]
      : roleBasedItems;

    return allItems.map((item) => (
      <button
        key={item.id}
        onClick={() => {
          setCurrentView(item.id);
          setMobileMenuOpen(false);
        }}
        className={`${baseClass} ${currentView === item.id ? activeClass : inactiveClass}`}>
        {item.label}
      </button>
    ));
  };

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Login onLogin={handleLogin} />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white sticky top-0 z-40 shadow-sm">
        <div className="ui-page-shell">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* <Package className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600 shrink-0" /> */}
              <img
                src="/logo.svg"
                alt="Logo"
                className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 object-contain"
              />
              <div>
                <h1 className="text-sm sm:text-lg font-bold text-gray-900 whitespace-nowrap leading-tight">
                  Inventory Management
                </h1>
                <p className="text-[10px] text-gray-400 hidden sm:block whitespace-nowrap leading-tight">
                  Asset &amp; Maintenance System
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 xl:hidden">
              <InAppNotificationBell />
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors no-push">
                {mobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>

            {/* Desktop nav — hidden until xl; between lg and xl uses hamburger */}
            <div className="hidden xl:flex items-center gap-3 min-w-0 flex-1 justify-end">
              <div className="flex items-center gap-1.5">
                {renderNavButtons(false)}
              </div>

              {/* Notification & User Info & Logout */}
              <div className="ml-2 pl-3 border-l border-gray-200 flex items-center shrink-0 relative gap-3">
                <InAppNotificationBell />
                <div className="flex items-center relative" ref={userMenuRef}>
                  <button
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center gap-2 p-1.5 px-2 rounded-xl hover:bg-gray-100 transition-colors no-push">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs font-semibold text-gray-900 leading-tight">
                        {currentUser?.userName}
                      </p>
                      <p className="text-[10px] font-medium text-gray-500 leading-tight">
                        {actualRole}
                      </p>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-400 transition-transform hidden md:block ${isUserMenuOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  <AnimatePresence>
                    {isUserMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 overflow-hidden z-50">
                        <div className="p-3 border-b border-gray-100 md:hidden bg-gray-50">
                          <p className="text-sm font-semibold text-gray-900">
                            {currentUser?.userName}
                          </p>
                          <p className="text-xs text-gray-500">{actualRole}</p>
                        </div>

                        <div className="p-2">
                          {/* Allow Admins and Managers to toggle viewer mode */}
                          {(actualRole === "Admin" ||
                            actualRole === "Manager") && (
                              <button
                                onClick={() => {
                                  setIsViewerViewEnabled(!isViewerViewEnabled);
                                  setIsUserMenuOpen(false);
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors no-push ${isViewerViewEnabled ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "text-gray-700 hover:bg-gray-100"}`}>
                                {isViewerViewEnabled ? (
                                  <Eye className="w-4 h-4" />
                                ) : (
                                  <Shield className="w-4 h-4" />
                                )}
                                <span>
                                  {isViewerViewEnabled
                                    ? "Exit Viewer Mode"
                                    : `Switch to Viewer Mode`}
                                </span>
                              </button>
                            )}
                          <button
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              handleLogout();
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors no-push mt-1">
                            <LogOut className="w-4 h-4" />
                            <span>Sign Out</span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="xl:hidden py-3 space-y-1">
              {renderNavButtons(true)}
              {/* Mobile User Info & Logout */}
              <div className="pt-3 mt-3">
                <div className="px-4 py-2 mb-2">
                  <p className="text-sm font-medium text-gray-900">
                    {currentUser?.userName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {currentUser?.role || "Viewer"}
                  </p>
                </div>
                {(actualRole === "Admin" || actualRole === "Manager") && (
                  <div className="px-4 mb-2.5">
                    <button
                      onClick={() => {
                        setIsViewerViewEnabled(!isViewerViewEnabled);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-center gap-2 text-xs px-3 py-2 rounded-lg border font-bold uppercase tracking-wider transition-all no-push shadow-sm ${isViewerViewEnabled ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700"}`}>
                      {isViewerViewEnabled ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <Shield className="w-4 h-4" />
                      )}
                      <span>
                        {isViewerViewEnabled
                          ? "Viewer Mode (Tap to Exit)"
                          : `${actualRole} Mode`}
                      </span>
                    </button>
                  </div>
                )}
                <div className="px-4">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-red-600 bg-red-50 hover:bg-red-100 transition-all font-medium text-sm no-push">
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>

      <main
        className="ui-page-shell py-4 sm:py-6 lg:py-8"
        onClick={() => {
          if (mobileMenuOpen) setMobileMenuOpen(false);
        }}>
        <Suspense fallback={<LoadingScreen />}>
          {currentView === "dashboard" && (
            <Dashboard
              assets={scopedAssets}
              maintenanceRecords={displayMaintenanceRecords}
              isViewer={isViewer}
              onViewAsset={handleQuickViewAsset}
              onViewMaintenance={(m: any) => {
                setSelectedMaintenanceForView(m);
                setShowMaintenanceDetail(true);
              }}
              onGoToAssets={() => setCurrentView("assets")}
              onGoToMaintenance={() => setCurrentView("maintenance")}
              onNavigateToAsset={(assetId: string) => {
                const asset = scopedAssets.find((a) => String(a.id) === assetId);
                if (asset) handleQuickViewAsset(asset);
              }}
            />
          )}

          {currentView === "assets" && (
            <AssetList
              assets={scopedAssets}
              licenseAllocations={scopedLicenseAllocations}
              maintenanceRecords={displayMaintenanceRecords}
              users={users}
              onAddAsset={handleAddAsset}
              onEditAsset={handleEditAsset}
              onViewAsset={handleViewAsset}
              onDeleteAsset={handleDeleteAsset}
              onDisposeAsset={handleDisposeAsset}
              onBulkImportComplete={() => {
                // Bulk import: new assets added — assets scope is sufficient
                refreshAllocationData(false, "asset").catch(() => { });
              }}
              hideBulkChildUnits={!isViewer}
              userRole={currentRole as UserRole}
              managedCategories={currentUser?.managedCategories || []}
              vendors={vendors}
            />
          )}

          {currentView === "allocations" && canAccessAllocations && (
            <AllocationsPage
              allocations={scopedLicenseAllocations}
              assets={scopedAssets}
              users={users}
              vendors={vendors}
              assetHistory={scopedAssetHistory}
              maintenanceRecords={displayMaintenanceRecords}
              onViewAsset={handleQuickViewAsset}
              onAllocate={async (
                assetId: string,
                data: Array<{
                  employeeId: string;
                  userName: string;
                  department: string;
                  count: number;
                  parentAssetId?: string;
                  conditionAtAllocation?: string;
                  installationLocation?: string;
                  ipAddress?: string;
                  macAddress?: string;
                  operatingSystem?: string;
                  serialNumber?: string;
                  targetUnitId?: string;
                  allocationDate?: string;
                }>,
              ) => {
                await handleAllocateLicense(assetId)(data);
              }}
              onRevoke={handleRevokeLicense}
              onBulkRevoke={handleBulkRevoke}
              userRole={currentRole as UserRole}
            />
          )}

          {currentView === "maintenance" && (
            <MaintenanceSchedule
              maintenanceRecords={displayMaintenanceRecords}
              assets={isViewer ? scopedAssetsForMaintenance : scopedAssets}
              licenseAllocations={scopedLicenseAllocations}
              onAddMaintenance={handleAddMaintenance}
              onEditMaintenance={handleEditMaintenance}
              onCancelMaintenance={handleCancelMaintenance}
              onDeleteMaintenance={handleDeleteMaintenance}
              onViewAsset={handleQuickViewAsset}
              userRole={currentRole as UserRole}
            />
          )}

          {currentView === "reports" && canAccessReports && (
            <Reports
              assets={scopedAssets}
              maintenanceRecords={displayMaintenanceRecords}
              users={users}
              licenseAllocations={scopedLicenseAllocations}
              onViewAsset={handleQuickViewAsset}
            />
          )}

          {currentView === "settings" && currentRole === "Admin" && (
            <SettingsPage
              onViewAsset={(asset: any) => handleViewAsset(asset as Asset, true)}
              onViewMaintenance={(m: any) => {
                const fullRecord = maintenanceRecords.find(
                  (record) => String(record.id) === String(m.id),
                );
                setSelectedMaintenanceForView(
                  fullRecord || (m as MaintenanceRecord),
                );
                setShowMaintenanceDetail(true);
              }}
              users={users}
              licenseAllocations={licenseAllocations}
            />
          )}

          {currentView === "bookings" && (
            <BookingsPage
              assets={scopedAssets}
              users={users}
              userRole={currentRole}
            />
          )}

          {currentView === "audits" && (
            <AuditsPage
              assets={scopedAssets}
              users={users}
              userRole={currentRole}
            />
            
          )}
          {currentView === "guide" && (
  <GuidePage />
)}
        </Suspense>
      </main>

      <Suspense fallback={null}>
        {showAssetForm && (
          <AssetForm
            asset={selectedAsset}
            vendors={vendors}
            assets={processedAssets}
            categories={categories}
            allocations={licenseAllocations}
            onSave={handleSaveAsset}
            onCancel={() => {
              setShowAssetForm(false);
              setSelectedAssetId(null);
            }}
            currentUser={currentUser ?? undefined}
          />
        )}

        {showAssetDetail &&
          selectedAsset &&
          (() => {
            // For bulk order parents, include allocations for all children
            const isParent = selectedAsset.isBulkOrder === true;
            const childUnitIds = isParent
              ? processedAssets
                .filter((a) => a.bulkOrderParentId === selectedAsset.id)
                .map((a) => String(a.id))
              : [];

            const relevantAssetIds = [String(selectedAsset.id), ...childUnitIds];

            const relevantAllocations = licenseAllocations.filter(
              (l) =>
                relevantAssetIds.includes(String(l.assetId)) ||
                // Include allocations where this asset is the parent (child assets allocated TO this asset)
                relevantAssetIds.includes(String(l.parentAssetId)),
            );

            // Include history for:
            // 1. The selected asset and its bulk children
            // 2. Any asset allocated TO this asset (chain allocations)
            const relevantHistory = assetHistory.filter(
              (h) =>
                relevantAssetIds.includes(String(h.assetId)) ||
                // Chain allocation: asset allocated TO this one
                relevantAssetIds.includes(String(h.parentAssetId)) ||
                // Chain allocation flagged by backend
                relevantAssetIds.includes(String(h.chainParentAssetId)),
            );

            const relevantMaintenance = maintenanceRecords.filter((m) =>
              relevantAssetIds.includes(String(m.assetId)),
            );

            return (
              <AssetDetail
                // Removed key to prevent full overlay remounts (flashes) on navigation; tab state is reset via useEffect internally.
                asset={selectedAsset}
                assets={isViewer ? scopedAssets : processedAssets}
                licenseAllocations={
                  isViewer ? scopedLicenseAllocations : licenseAllocations
                }
                assetHistory={isViewer ? scopedAssetHistory : assetHistory}
                maintenanceRecords={displayMaintenanceRecords}
                users={users}
                onClose={() => {
                  setShowAssetDetail(false);
                  setSelectedAssetId(null);
                  setForceViewerModeForDetail(false);
                }}
                onEdit={handleEditAsset}
                onDispose={handleDisposeAsset}
                onDeleteAsset={handleDeleteAsset}
                onUpdate={(updates: any) => handleSaveAsset(updates, true)}
                onAllocateLicense={handleAllocateLicense(selectedAsset.id)}
                onRevokeLicense={handleRevokeLicense}
                onBulkRevokeLicense={handleBulkRevoke}
                onAddMaintenance={(assetId: any) => {
                  const asset = processedAssets.find(
                    (a) => String(a.id) === String(assetId),
                  );
                  if (asset) {
                    setShowAssetDetail(false);
                    setSelectedAssetId(null);
                    setSelectedMaintenance({
                      assetId: asset.id,
                      assetCode: asset.assetCode,
                      assetName: asset.assetName,
                      status: MAINTENANCE_STATUS.SCHEDULED,
                      scheduledDate: new Date().toISOString().split("T")[0],
                    } as Partial<MaintenanceRecord> as MaintenanceRecord);
                    setShowMaintenanceForm(true);
                  }
                }}
                onEditMaintenance={handleEditMaintenance}
                userRole={forceViewerModeForDetail ? "Viewer" : (currentRole as UserRole)}
                currentUser={currentUser ?? undefined}
                onViewAsset={handleViewAsset}
              />
            );
          })()}

        {showMaintenanceForm && (
          <MaintenanceForm
            maintenance={selectedMaintenance}
            assets={processedAssets}
            users={users}
            maintenanceRecords={displayMaintenanceRecords}
            onSave={handleSaveMaintenance}
            onCancel={() => {
              setShowMaintenanceForm(false);
              setSelectedMaintenance(null);
            }}
          />
        )}

        {showMaintenanceDetail && selectedMaintenanceForView && (
          <MaintenanceDetail
            record={selectedMaintenanceForView}
            assets={isViewer ? scopedAssetsForMaintenance : processedAssets}
            maintenanceRecords={displayMaintenanceRecords}
            licenseAllocations={
              isViewer ? scopedLicenseAllocations : licenseAllocations
            }
            onClose={() => {
              setShowMaintenanceDetail(false);
              setSelectedMaintenanceForView(null);
            }}
            onEdit={(record: any) => {
              setShowMaintenanceDetail(false);
              handleEditMaintenance(record);
            }}
            onViewAsset={handleQuickViewAsset}
            userRole={currentRole as UserRole}
          />
        )}

        {/* Standalone UnitDetailModal — opened from maintenance for child units */}
        {standaloneUnitAsset && (
          <UnitDetailModal
            unit={standaloneUnitAsset}
            onClose={() => {
              setStandaloneUnitAsset(null);
              setForceViewerModeForDetail(false);
            }}
            onEdit={handleEditAsset}
            onViewAsset={(asset: any) => {
              setStandaloneUnitAsset(null);
              handleViewAsset(asset);
            }}
            onUpdateUnit={async (unitId: string, updates: any) => {
              try {
                await dataService.updateAsset(unitId, updates);
                // Unit edit only affects asset fields — use narrow scope
                const refreshedData = await refreshAllocationData(false, "asset");
                // Re-select directly from the fresh snapshot to avoid stale closure state.
                const updatedUnit = refreshedData?.assets?.find(
                  (a: Asset) => a.id === unitId,
                );
                if (updatedUnit) setStandaloneUnitAsset(updatedUnit);
                toast.success("Unit updated successfully!");
              } catch (err) {
                const msg =
                  err instanceof Error ? err.message : "Failed to update unit.";
                toast.error(msg);
                throw err;
              }
            }}
            onAllocateUnit={(unitId: string, data: any) =>
              handleAllocateLicense(standaloneUnitAsset.id)([
                {
                  employeeId: data.employeeId,
                  userName: data.userName,
                  department: data.department,
                  count: 1,
                  conditionAtAllocation: data.condition,
                  targetUnitId: unitId,
                  ...(data.parentAssetId && {
                    parentAssetId: data.parentAssetId,
                  }),
                  ...(data.installationLocation && {
                    installationLocation: data.installationLocation,
                  }),
                  ...(data.ipAddress && { ipAddress: data.ipAddress }),
                  ...(data.macAddress && { macAddress: data.macAddress }),
                  ...(data.operatingSystem && {
                    operatingSystem: data.operatingSystem,
                  }),
                  ...(data.serialNumber && { serialNumber: data.serialNumber }),
                },
              ])
            }
            onReturnUnit={(unitId: string, conditionAtReturn: any, notes: any) => {
              const allocation = licenseAllocations.find(
                (a) =>
                  String(a.assetId) === String(unitId) &&
                  a.status === ALLOCATION_STATUS_DISPLAY.ACTIVE,
              );
              if (allocation) {
                return handleRevokeLicense(allocation.id, conditionAtReturn, notes);
              }
              return Promise.resolve();
            }}
            onBulkReturnUnit={handleBulkRevoke}
            onAddMaintenance={(assetId: any) => {
              const asset = processedAssets.find(
                (a) => String(a.id) === String(assetId),
              );
              if (asset) {
                setStandaloneUnitAsset(null);
                setSelectedMaintenance({
                  assetId: asset.id,
                  assetCode: asset.assetCode,
                  assetName: asset.assetName,
                  status: MAINTENANCE_STATUS.SCHEDULED,
                  scheduledDate: new Date().toISOString().split("T")[0],
                } as Partial<MaintenanceRecord> as MaintenanceRecord);
                setShowMaintenanceForm(true);
              }
            }}
            onEditMaintenance={handleEditMaintenance}
            users={users}
            licenseAllocations={scopedLicenseAllocations}
            maintenanceRecords={displayMaintenanceRecords}
            assetHistory={scopedAssetHistory}
            userRole={forceViewerModeForDetail ? "Viewer" : (currentRole as UserRole)}
            allAssets={isViewer ? scopedAssets : processedAssets}
            assets={scopedAssets}
            onDispose={(unitId: string) => {
              const unitAsset = processedAssets.find(
                (a) => String(a.id) === String(unitId),
              );
              if (unitAsset) {
                setStandaloneUnitAsset(null);
                // Open the full AssetDetail view where the dispose confirmation dialog is available
                handleViewAsset(unitAsset);
              }
            }}
            onDelete={(unitId: string) => {
              const unitAsset = processedAssets.find(
                (a) => String(a.id) === String(unitId),
              );
              if (unitAsset) {
                setUnitToDeleteInApp(unitAsset);
                setShowDeleteConfirmInApp(true);
              }
            }}
          />
        )}

        {dataViewPayload && (
          <div className="fixed inset-0 z-[100] bg-white overflow-auto">
            <DataViewPage
              inlinePayload={dataViewPayload}
              onClose={() => setDataViewPayload(null)}
            />
          </div>
        )}
      </Suspense>

      {canApproveAnomalies &&
        isAnomalyOverlayOpen &&
        pendingAnomalies.length > 0 && (
          <div
            className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setIsAnomalyOverlayOpen(false)}>
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                      <ShieldAlert className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                        Intelligence Alert
                      </p>
                      <h2 className="text-lg font-bold text-slate-900">
                        Real-time Anomaly Alert
                      </h2>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsAnomalyOverlayOpen(false)}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5">
                  {(() => {
                    const alert = pendingAnomalies[0];
                    const timeLabel = formatAnomalyTimestamp(alert.createdAt);
                    const typeLabel = resolveAnomalyTypeLabel(alert);
                    const isBusy = anomalyActionIds.has(alert.id);
                    const autoSendLabel = formatAutoSendLabel(
                      alert.scheduledFor,
                    );
                    const trimmedMessage = stripAutoSendMessage(alert.message);
                    const messageText =
                      trimmedMessage || "A system anomaly has been detected.";

                    return (
                      <div className="flex flex-col gap-4">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-700 border border-amber-100">
                              {typeLabel}
                            </span>
                            <span className="text-sm font-bold text-slate-900">
                              {alert.title || "Anomaly detected"}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 leading-relaxed">
                            {messageText}
                          </p>
                          <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
                            {timeLabel && (
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5" />
                                <span>Queued: {timeLabel}</span>
                              </div>
                            )}
                            {autoSendLabel && (
                              <div className="flex items-center gap-1.5 text-indigo-500 font-medium">
                                <Send className="h-3.5 w-3.5" />
                                <span>{autoSendLabel}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                          <p className="text-[11px] text-slate-500 max-w-[240px]">
                            Dispatching will immediately notify the Admin(s) via
                            email.
                          </p>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleIgnoreAnomaly(alert.id)}
                              disabled={isBusy}
                              className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 border border-slate-200">
                              <EyeOff className="h-4 w-4" />
                              <span>Suppress Alert</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApproveAnomaly(alert.id)}
                              disabled={
                                isBusy ||
                                (controlSettings &&
                                  !controlSettings.enableManualDispatch)
                              }
                              title={
                                controlSettings &&
                                  !controlSettings.enableManualDispatch
                                  ? "Manual dispatch disabled"
                                  : "Dispatch Email"
                              }
                              className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-xs font-semibold text-white transition-all hover:bg-blue-700 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
                              <Send className="h-4 w-4" />
                              <span>Dispatch Email</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="bg-slate-50 px-5 py-3 text-[11px] text-slate-500 border-t border-slate-100 italic">
                  Auto-send occurs after the configured delay if no action is
                  taken.
                </div>
              </motion.div>
            </div>
          </div>
        )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirmInApp}
        onClose={() => {
          setShowDeleteConfirmInApp(false);
          setUnitToDeleteInApp(null);
        }}
        onConfirm={(reason, condition) => {
          if (unitToDeleteInApp) {
            handleDeleteAsset(String(unitToDeleteInApp.id), reason, condition);
            setStandaloneUnitAsset(null);
            setShowDeleteConfirmInApp(false);
            setUnitToDeleteInApp(null);
          }
        }}
        title="Delete Asset"
        message={
          HIDE_DELETE_UI
            ? `Are you sure you want to permanently delete "${unitToDeleteInApp?.assetName || unitToDeleteInApp?.assetCode}"? This is only allowed for assets with no prior history and cannot be undone.`
            : `Are you sure you want to permanently delete "${unitToDeleteInApp?.assetName || unitToDeleteInApp?.assetCode}"? This action cannot be undone.`
        }
        confirmText="Confirm Deletion"
        confirmColor="bg-red-600 hover:bg-red-700"
        requireReason={true}
        showCondition={true}
        initialCondition={unitToDeleteInApp?.condition ?? undefined}
      />

      {dataViewPayload && (
        <div className="fixed inset-0 z-[100] bg-white overflow-auto">
          <DataViewPage
            inlinePayload={dataViewPayload}
            onClose={() => setDataViewPayload(null)}
          />
        </div>
      )}
    </div>
  );
}
