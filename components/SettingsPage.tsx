'use client';

import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Users,
  Store,
  ChevronRight,
  Bell,
  ShieldCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AuditLogPage } from "./AuditLog";
import { UsersManagement } from "./UsersManagement";
import { VendorsManagement } from "./VendorsManagement";
import { NotificationCenter } from "./NotificationCenter";
import { AdminControlPage } from "./AdminControlPage";
import type { Asset, User, LicenseAllocation } from '@/types';

type SettingsTab =
  | "audit-log"
  | "users"
  | "vendors"
  | "notifications"
  | "admin-control";

const sidebarItems: {
  id: SettingsTab;
  label: string;
  icon: typeof FileText;
  description: string;
}[] = [
    {
      id: "audit-log",
      label: "Audit Log",
      icon: FileText,
      description: "System activity trail",
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: Bell,
      description: "Emails & Reminders",
    },
    {
      id: "users",
      label: "Users",
      icon: Users,
      description: "Manage user accounts",
    },
    {
      id: "vendors",
      label: "Vendors",
      icon: Store,
      description: "Manage vendors",
    },
    {
      id: "admin-control",
      label: "Admin Control",
      icon: ShieldCheck,
      description: "Notification and system switches",
    },
  ];

const settingsTabToPath: Record<SettingsTab, string> = {
  "audit-log": "/settings/audit-log",
  users: "/settings/users",
  vendors: "/settings/vendors",
  notifications: "/settings/notifications",
  "admin-control": "/settings/control",
};

function getSettingsTabFromPath(pathname: string): SettingsTab {
  const p = pathname.toLowerCase();
  if (p.includes("notification")) return "notifications";
  if (p.includes("users")) return "users";
  if (p.includes("vendors")) return "vendors";
  if (p.includes("control")) return "admin-control";
  return "audit-log";
}

export function SettingsPage({
  onViewAsset,
  onViewMaintenance,
  users,
  licenseAllocations,
}: {
  onViewAsset?: (asset: Partial<Asset>) => void;
  onViewMaintenance?: (m: Partial<any>) => void;
  users?: User[];
  licenseAllocations?: LicenseAllocation[];
} = {}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(() =>
    getSettingsTabFromPath(window.location.pathname),
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  const setActiveTabWithRoute = (tab: SettingsTab) => {
    setActiveTab(tab);
    const nextPath = settingsTabToPath[tab];
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, "", nextPath);
    }
  };

  useEffect(() => {
    const syncFromPath = () => {
      setActiveTab(getSettingsTabFromPath(window.location.pathname));
      setMobileOpen(false);
    };

    window.addEventListener("popstate", syncFromPath);
    return () => window.removeEventListener("popstate", syncFromPath);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (!mobileOpen) return;

    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!mobileMenuRef.current?.contains(target)) {
        setMobileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [mobileOpen]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 min-h-[calc(100vh-180px)]">
      {/* Mobile Tab Selector */}
      <div className="lg:hidden" ref={mobileMenuRef}>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl shadow-sm text-sm font-medium text-gray-700 transition-all no-push">
          <div className="flex items-center gap-2">
            {(() => {
              const item = sidebarItems.find((i) => i.id === activeTab);
              const Icon = item?.icon || FileText;
              return (
                <>
                  <Icon className="w-5.5 h-5.5 shrink-0 text-blue-600" />
                  {item?.label}
                </>
              );
            })()}
          </div>
          <ChevronRight
            className={`w-5.5 h-5.5 shrink-0 transition-transform ${mobileOpen ? "rotate-90" : ""}`}
          />
        </button>
        {mobileOpen && (
          <div className="mt-2 bg-white rounded-xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTabWithRoute(item.id);
                    setMobileOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-all no-push ${activeTab === item.id
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-50"
                    }`}>
                  <Icon className="w-5.5 h-5.5 shrink-0" />
                  <div className="text-left">
                    <p
                      className={
                        activeTab === item.id ? "font-semibold" : "font-medium"
                      }>
                      {item.label}
                    </p>
                    <p
                      className={`text-xs ${activeTab === item.id
                          ? "text-blue-500 font-medium"
                          : "text-gray-500"
                        }`}>
                      {item.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden lg:block w-64 shrink-0">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden sticky top-24">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">Settings</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Admin Configuration
            </p>
          </div>
          <nav className="p-2 space-y-0.5">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTabWithRoute(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all no-push ${activeTab === item.id
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-gray-700 hover:bg-gray-100"
                    }`}>
                  <Icon className="w-4.5 h-4.5 shrink-0" />
                  <div className="text-left min-w-0">
                    <p className="font-medium truncate">{item.label}</p>
                    <p
                      className={`text-[10px] truncate ${activeTab === item.id
                          ? "text-blue-100"
                          : "text-gray-400"
                        }`}>
                      {item.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}>
            {activeTab === "audit-log" && (
              <AuditLogPage
                onViewAsset={onViewAsset}
                onViewMaintenance={onViewMaintenance}
              />
            )}
            {activeTab === "notifications" && (
              <NotificationCenter
                onViewAsset={onViewAsset}
                onViewMaintenance={onViewMaintenance}
                users={users}
                licenseAllocations={licenseAllocations}
              />
            )}
            {activeTab === "users" && (
              <UsersManagement onViewAsset={onViewAsset} />
            )}
            {activeTab === "vendors" && <VendorsManagement />}
            {activeTab === "admin-control" && <AdminControlPage />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
