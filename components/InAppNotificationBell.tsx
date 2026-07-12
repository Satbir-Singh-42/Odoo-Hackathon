'use client';

import React, { useState, useEffect, useRef } from "react";
import { Bell, CheckCircle, XCircle, Trash2, Settings, AlertTriangle, Box, KeyRound } from "lucide-react";
import { dataService, InAppNotification } from '@/lib/dataService';

let globalFetchPromise: Promise<InAppNotification[]> | null = null;
let globalLastFetchTime = 0;

export const InAppNotificationBell: React.FC = () => {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const maxSeenIdRef = useRef<number>(0);

  const fetchNotifications = async (forceRefresh = false) => {
    // Share the same fetch promise across all mounted instances of the Bell
    // to prevent duplicate simultaneous API calls (e.g. mobile vs desktop bell).
    if (globalFetchPromise) {
      try {
        const data = await globalFetchPromise;
        setNotifications(data);
        setUnreadCount(data.filter((n) => !n.isRead).length);
        return;
      } catch {
        // Fall through on error
      }
    }

    if (!forceRefresh && Date.now() - globalLastFetchTime < 2000) return;

    globalFetchPromise = dataService.getInAppNotifications(forceRefresh).then(data => {
      globalLastFetchTime = Date.now();
      return data;
    });

    try {
      const data = await globalFetchPromise;
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.isRead).length);

      let shouldReload = false;
      let newMaxId = maxSeenIdRef.current;

      data.forEach(n => {
        if (n.id > maxSeenIdRef.current) {
          if (!n.isRead && (n.type === "PROFILE" || n.type === "ROLE_CHANGE")) {
            shouldReload = true;
          }
          if (n.id > newMaxId) newMaxId = n.id;
        }
      });

      if (maxSeenIdRef.current > 0 && shouldReload) {
        // Update maxSeenIdRef BEFORE reloading to prevent a reload loop
        maxSeenIdRef.current = newMaxId;
        // Dispatch a soft session refresh instead of a hard page reload
        window.dispatchEvent(new CustomEvent("REFRESH_APP_DATA"));
        return;
      }

      maxSeenIdRef.current = newMaxId;
    } catch (error) {
      console.error("Failed to fetch in-app notifications:", error instanceof Error ? error.message : error);
    } finally {
      // Small timeout before clearing the promise to allow other synchronous listeners to hook into it
      setTimeout(() => {
        globalFetchPromise = null;
      }, 50);
    }
  };

  useEffect(() => {
    fetchNotifications();

    const handleRefresh = () => fetchNotifications(true);
    window.addEventListener("refreshNotifications", handleRefresh);

    // Synchronized app-wide tick: when App.tsx refreshes assets/maintenance/etc,
    // it dispatches APP_DATA_TICK so this bell re-fetches in lockstep.
    // This avoids the "notification first, record 3s later" lag the user observed.
    const handleAppDataTick = () => fetchNotifications(true);
    window.addEventListener("APP_DATA_TICK", handleAppDataTick);

    return () => {
      window.removeEventListener("refreshNotifications", handleRefresh);
      window.removeEventListener("APP_DATA_TICK", handleAppDataTick);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleRead = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Optimistic update
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));

      await dataService.readInAppNotification(id);
      fetchNotifications();
    } catch (error) {
      fetchNotifications(); // revert
      console.error("Failed to mark as read:", error instanceof Error ? error.message : error);
    }
  };

  const handleClear = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Optimistic update
      const notif = notifications.find(n => n.id === id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (notif && !notif.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }

      await dataService.clearInAppNotification(id);
      fetchNotifications();
    } catch (error) {
      fetchNotifications(); // revert
      console.error("Failed to clear notification:", error instanceof Error ? error.message : error);
    }
  };

  const handleClearAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Optimistic update
      setNotifications([]);
      setUnreadCount(0);

      await dataService.clearAllInAppNotifications();
      fetchNotifications();
    } catch (error) {
      fetchNotifications(); // revert
      console.error("Failed to clear all notifications:", error instanceof Error ? error.message : error);
    }
  };

  const handleNotificationClick = async (n: InAppNotification) => {
    if (!n.isRead) {
      // Optimistic update
      setNotifications(prev => prev.map(notif => notif.id === n.id ? { ...notif, isRead: true } : notif));
      setUnreadCount(prev => Math.max(0, prev - 1));

      await dataService.readInAppNotification(n.id);
      fetchNotifications();
    }

    if (n.linkPath) {
      if (n.linkPath.startsWith("/assets/")) {
        const assetId = n.linkPath.split("/")[2];
        if (assetId) {
          window.dispatchEvent(
            new CustomEvent("OPEN_ASSET_DETAIL", { detail: { assetId } })
          );
        }
      } else if (n.linkPath.startsWith("/maintenance/")) {
        const maintId = n.linkPath.split("/")[2];
        // Navigate to maintenance page first
        window.history.pushState(null, "", "/maintenance");
        window.dispatchEvent(new PopStateEvent("popstate"));
        // Fire OPEN_MAINTENANCE_DETAIL after a tick so the page is mounted
        if (maintId) {
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("OPEN_MAINTENANCE_DETAIL", { detail: { maintenanceId: maintId } })
            );
          }, 150);
        }
      } else {
        window.history.pushState(null, "", n.linkPath);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
      setIsOpen(false);
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case "LICENSE":
        return <KeyRound className="w-5 h-5 text-purple-500" />;
      case "SETTINGS":
        return <Settings className="w-5 h-5 text-blue-500" />;
      case "PROFILE":
        return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case "ALLOCATION":
        return <Box className="w-5 h-5 text-indigo-500" />;
      case "MAINTENANCE":
        return <Settings className="w-5 h-5 text-amber-500" />;
      case "ANOMALY":
        return <AlertTriangle className="w-5 h-5 text-rose-500" />;
      case "RETURN":
        return <Box className="w-5 h-5 text-orange-500" />;
      default:
        return <Bell className="w-5 h-5 text-slate-400" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className="relative p-2 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-bold text-white bg-rose-500 border-2 border-white rounded-full">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white border border-gray-200 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] z-50 overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-200 origin-top-right">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white shrink-0">
            <h3 className="text-base font-semibold text-gray-900 flex items-center">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </h3>
            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center font-medium"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear All
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-400 flex flex-col items-center">
                <Bell className="w-12 h-12 mb-3 text-gray-300 opacity-50" />
                <p className="text-sm font-medium text-gray-600">No notifications yet</p>
                <p className="text-xs text-gray-400 mt-1">When you get notifications, they'll show up here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {notifications.map((n) => {
                  const isUnread = !n.isRead;
                  return (
                    <li
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={"p-4 hover:bg-gray-50 transition-colors cursor-pointer flex items-start gap-3 " + (isUnread ? "bg-blue-50/30 relative" : "bg-white opacity-90")}
                    >
                      {isUnread && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-r"></div>
                      )}
                      <div className="shrink-0 mt-0.5">{getIconForType(n.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <p className={"text-sm font-medium leading-tight " + (isUnread ? "text-gray-900" : "text-gray-600")}>
                            {n.title}
                          </p>
                          <span className="text-[10px] font-medium text-gray-400 shrink-0 mt-0.5 whitespace-nowrap">
                            {new Date(n.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <p title={n.message} className={"text-xs leading-relaxed line-clamp-2 " + (isUnread ? "text-gray-600" : "text-gray-500")}>
                          {n.message}
                        </p>
                      </div>
                      <div className="shrink-0 flex flex-col gap-2 ml-2">
                        <button
                          onClick={(e) => handleClear(n.id, e)}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                          title="Clear notification"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {notifications.length > 5 && (
            <div className="p-3 border-t border-gray-100 bg-gray-50/50 text-center shrink-0">
              <span className="text-[11px] font-medium text-gray-500">Scroll to see more</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
