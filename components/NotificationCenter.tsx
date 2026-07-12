'use client';

import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import {
  Search,
  X,
  Check,
  RefreshCw,
  Bell,
  Settings as SettingsIcon,
  AlertTriangle,
  Mail,
  Key,
  Calendar,
  ExternalLink,
  Target,
  Clock,
  Zap,
  Filter,
  ChevronDown,
  Users,
  Wrench,
  Copy,
  Ghost,
  ShieldAlert,
  ChevronRight,
  XCircle,
  Info,
} from "lucide-react";
import dataService, {
  NotificationLog,
  type PendingAnomalyAlert,
  type NotificationControlSettings,
} from '@/lib/dataService';
import type { Asset, User, LicenseAllocation } from '@/types';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useDebounce } from '@/hooks/useDebounce';
import { useSmartDropdownPosition } from '@/hooks/useSmartDropdownPosition';
import { UserDetailModal } from "./UsersManagement";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { getErrorMessage } from '@/lib/utils/errorHelpers';
import {
  formatDisplayDate,
  formatDisplayDateFull,
  formatDisplayDateWithWeekday,
} from '@/lib/utils/dateHelpers';
import { Play } from "lucide-react";
import { Pagination, DEFAULT_PAGE_SIZE } from '@/components/ui/pagination';

// =============================================
// NOTIFICATION AUDIT MODAL
// =============================================

function NotificationAuditModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4">
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
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
              <Info className="w-4 h-4 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              Notification & Audit Report Logic
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 transition-all text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-gray-50/50">
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-gray-700 shadow-sm">
            <h3 className="font-bold text-blue-900 flex items-center gap-2 text-base mb-2">
              <Clock className="w-5 h-5 text-blue-600" /> Active Time Window Enforcement
            </h3>
            <p className="mb-2">
              If the <strong className="font-semibold text-gray-900">Enable Active Time Window</strong> setting is ON, scheduled emails will only dispatch during designated active hours. Emails triggered outside this window remain in the queue and auto-dispatch when the window opens.
            </p>
            <p className="mb-4">
              <strong className="font-semibold text-gray-900">When Disabled:</strong> Notifications and manual dispatches are allowed 24/7 without queuing delays.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-blue-200/60">
              <div className="bg-white/60 p-3 rounded-lg border border-blue-100">
                <span className="font-semibold text-green-700 block mb-1.5 flex items-center gap-1.5"><Zap className="w-4 h-4"/> Bypasses Window (Immediate)</span>
                <ul className="list-disc pl-5 text-gray-600 space-y-0.5 text-xs">
                  <li>Password Resets & User Welcome</li>
                  <li>Troubleshooting Reports</li>
                  <li>System & Hardware Anomalies</li>
                </ul>
              </div>
              <div className="bg-white/60 p-3 rounded-lg border border-blue-100">
                <span className="font-semibold text-orange-700 block mb-1.5 flex items-center gap-1.5"><Calendar className="w-4 h-4"/> Follows Window (Queued)</span>
                <ul className="list-disc pl-5 text-gray-600 space-y-0.5 text-xs">
                  <li>Maintenance Reminders</li>
                  <li>Action Today Alerts</li>
                  <li>Overdue Maintenance</li>
                  <li>Software License Expiry</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-700 min-w-[180px]">Event / Notification Type</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 min-w-[200px]">Trigger Condition</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 min-w-[160px]">Timing / Dispatch Delay</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 min-w-[160px]">To (Primary)</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 min-w-[100px]">CC</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 min-w-[100px]">Fallback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 leading-snug">User Welcome <span className="text-gray-500 font-normal block sm:inline">(Account Creation)</span></td>
                  <td className="px-4 py-3 text-gray-600 leading-snug">A new user account is created by an Admin</td>
                  <td className="px-4 py-3 text-gray-600 font-medium whitespace-nowrap">Immediate <span className="text-gray-400 font-normal text-xs">(0 min delay)</span></td>
                  <td className="px-4 py-3 text-gray-600">The New User</td>
                  <td className="px-4 py-3 text-gray-400">-</td>
                  <td className="px-4 py-3 text-gray-400">-</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 leading-snug">Password Reset</td>
                  <td className="px-4 py-3 text-gray-600 leading-snug">A user requests a password reset link</td>
                  <td className="px-4 py-3 text-gray-600 font-medium whitespace-nowrap">Immediate <span className="text-gray-400 font-normal text-xs">(0 min delay)</span></td>
                  <td className="px-4 py-3 text-gray-600">The Requesting User</td>
                  <td className="px-4 py-3 text-gray-400">-</td>
                  <td className="px-4 py-3 text-gray-400">-</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 leading-snug">Troubleshooting Report</td>
                  <td className="px-4 py-3 text-gray-600 leading-snug">A user reports an issue with their assigned asset</td>
                  <td className="px-4 py-3 text-gray-600 font-medium whitespace-nowrap">Immediate <span className="text-gray-400 font-normal text-xs">(0 min delay)</span></td>
                  <td className="px-4 py-3 text-gray-600">Operations Manager</td>
                  <td className="px-4 py-3 text-gray-400">-</td>
                  <td className="px-4 py-3 text-gray-600">Admin</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 leading-snug">Maintenance Reminder <span className="text-gray-500 font-normal block sm:inline">(Assigned)</span></td>
                  <td className="px-4 py-3 text-gray-600 leading-snug">Maintenance scheduled for tomorrow</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">1 day before</td>
                  <td className="px-4 py-3 text-gray-600">Technician</td>
                  <td className="px-4 py-3 text-gray-400">-</td>
                  <td className="px-4 py-3 text-gray-400">-</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 leading-snug">Maintenance Reminder <span className="text-gray-500 font-normal block sm:inline">(Unassigned)</span></td>
                  <td className="px-4 py-3 text-gray-600 leading-snug">Maintenance scheduled for tomorrow</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">1 day before</td>
                  <td className="px-4 py-3 text-gray-600">Operations Manager</td>
                  <td className="px-4 py-3 text-gray-400">-</td>
                  <td className="px-4 py-3 text-gray-600">Admin</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 leading-snug">Action Today <span className="text-gray-500 font-normal block sm:inline">(Assigned)</span></td>
                  <td className="px-4 py-3 text-gray-600 leading-snug">Maintenance scheduled for today</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">Day of</td>
                  <td className="px-4 py-3 text-gray-600">Technician</td>
                  <td className="px-4 py-3 text-gray-600">Operations Manager</td>
                  <td className="px-4 py-3 text-gray-600">Admin</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 leading-snug">Action Today <span className="text-gray-500 font-normal block sm:inline">(Unassigned)</span></td>
                  <td className="px-4 py-3 text-gray-600 leading-snug">Maintenance scheduled for today</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">Day of</td>
                  <td className="px-4 py-3 text-gray-600">Operations Manager</td>
                  <td className="px-4 py-3 text-gray-400">-</td>
                  <td className="px-4 py-3 text-gray-600">Admin</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 leading-snug">Overdue Maintenance <span className="text-gray-500 font-normal block sm:inline">(Assigned)</span></td>
                  <td className="px-4 py-3 text-gray-600 leading-snug">Maintenance is past due and 'Scheduled'</td>
                  <td className="px-4 py-3 text-gray-600 leading-snug">Continuously every day while overdue</td>
                  <td className="px-4 py-3 text-gray-600">Technician</td>
                  <td className="px-4 py-3 text-gray-600">Operations Manager</td>
                  <td className="px-4 py-3 text-gray-600">Admin</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 leading-snug">Overdue Maintenance <span className="text-gray-500 font-normal block sm:inline">(Unassigned)</span></td>
                  <td className="px-4 py-3 text-gray-600 leading-snug">Maintenance is past due and 'Scheduled'</td>
                  <td className="px-4 py-3 text-gray-600 leading-snug">Continuously every day while overdue</td>
                  <td className="px-4 py-3 text-gray-600">Operations Manager</td>
                  <td className="px-4 py-3 text-gray-400">-</td>
                  <td className="px-4 py-3 text-gray-600">Admin</td>
                </tr>
                <tr className="hover:bg-gray-50 bg-orange-50/30">
                  <td className="px-4 py-3 font-medium text-orange-800 leading-snug">Software License Expiry</td>
                  <td className="px-4 py-3 text-gray-600 leading-snug">License nearing expiration</td>
                  <td className="px-4 py-3 text-gray-600 leading-snug">Mondays during final 30 days, 1 day out, and continuously when expired</td>
                  <td className="px-4 py-3 text-gray-600">Operations Manager</td>
                  <td className="px-4 py-3 text-gray-600">Admin</td>
                  <td className="px-4 py-3 text-gray-600">Admin</td>
                </tr>
                <tr className="hover:bg-gray-50 bg-red-50/20">
                  <td className="px-4 py-3 font-medium text-red-700 leading-snug flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/> <span>Hoarder Anomaly</span></td>
                  <td className="px-4 py-3 text-gray-600 leading-snug">User accumulates active assets of the exact same type</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">Immediate <span className="text-gray-400 font-normal text-xs">(+ 5m delay)</span></td>
                  <td className="px-4 py-3 text-gray-600">Admin</td>
                  <td className="px-4 py-3 text-gray-400">-</td>
                  <td className="px-4 py-3 text-gray-400">-</td>
                </tr>
                <tr className="hover:bg-gray-50 bg-red-50/20">
                  <td className="px-4 py-3 font-medium text-red-700 leading-snug flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/> <span>Software Duplicate Anomaly</span></td>
                  <td className="px-4 py-3 text-gray-600 leading-snug">User has multiple active licenses of the same software</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">Immediate <span className="text-gray-400 font-normal text-xs">(+ 5m delay)</span></td>
                  <td className="px-4 py-3 text-gray-600">Admin</td>
                  <td className="px-4 py-3 text-gray-400">-</td>
                  <td className="px-4 py-3 text-gray-400">-</td>
                </tr>
                <tr className="hover:bg-gray-50 bg-red-50/20">
                  <td className="px-4 py-3 font-medium text-red-700 leading-snug flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/> <span>Lemon Hardware Anomaly</span></td>
                  <td className="px-4 py-3 text-gray-600 leading-snug">Asset requires repair shortly after its last repair</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">Immediate <span className="text-gray-400 font-normal text-xs">(+ 5m delay)</span></td>
                  <td className="px-4 py-3 text-gray-600">Admin</td>
                  <td className="px-4 py-3 text-gray-400">-</td>
                  <td className="px-4 py-3 text-gray-400">-</td>
                </tr>
                <tr className="hover:bg-gray-50 bg-red-50/20">
                  <td className="px-4 py-3 font-medium text-red-700 leading-snug flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/> <span>Ghost Asset Anomaly</span></td>
                  <td className="px-4 py-3 text-gray-600 leading-snug">Asset dormant / unused with no activity</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">Weekly Scan <span className="text-gray-400 font-normal text-xs">(Mon 08:00 AM)</span></td>
                  <td className="px-4 py-3 text-gray-600">Admin</td>
                  <td className="px-4 py-3 text-gray-400">-</td>
                  <td className="px-4 py-3 text-gray-400">-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// =============================================
// ADMIN SETTINGS MODAL
// =============================================

type AdminRow = {
  employeeId: string;
  userName: string;
  role: string;
  email: string;
  editedEmail: string;
  selected: boolean;

};

function AdminFormModal({
  currentAdminEmails,
  currentManagerEmails,
  onSave,
  onClose,
  isMandatory = false,
}: {
  currentAdminEmails: string;
  currentManagerEmails: string;
  onSave: (adminEmails: string, managerEmails: string) => Promise<void>;
  onClose: () => void;
  isMandatory?: boolean;
}) {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showAuditModal, setShowAuditModal] = useState(false);

  useEffect(() => {
    const loadAdmins = async () => {
      try {
        setLoadingAdmins(true);
        const allUsers = await dataService.getUsers();
        const admins = allUsers.filter((u) => {
          const role = String(u.role || "").toLowerCase();
          return role === "admin" || role === "manager";
        });

        const parsedAdminEmails = currentAdminEmails
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);
        const parsedManagerEmails = currentManagerEmails
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);

        const initialRows = admins
          .map((u) => {
            const userEmail = u.email || "";
            const isSelected =
              u.role?.toLowerCase() === "admin"
                ? parsedAdminEmails.includes(userEmail.toLowerCase())
                : parsedManagerEmails.includes(userEmail.toLowerCase());
            return {
              employeeId: u.employeeId,
              userName: u.userName,
              role: u.role || "Admin",
              email: userEmail,
              editedEmail: userEmail,
              selected: isSelected,
            };
          })
          .sort((a, b) => {
            if (a.role === "Admin" && b.role !== "Admin") return -1;
            if (a.role !== "Admin" && b.role === "Admin") return 1;
            return a.userName.localeCompare(b.userName);
          });

        setRows(initialRows);
      } catch (err) {
        setError(getErrorMessage(err) || "Failed to load admin/manager users.");
      } finally {
        setLoadingAdmins(false);
      }
    };
    loadAdmins();
  }, [currentAdminEmails, currentManagerEmails]);

  const toggleRow = (index: number) => {
    setRows((prev) => {
      const next = [...prev];
      next[index].selected = !next[index].selected;
      return next;
    });
  };

  const updateEditedEmail = (index: number, val: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[index].editedEmail = val;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedRows = rows.filter((r) => r.selected);

    if (selectedRows.length === 0) {
      setError(
        "Please select at least one admin or manager to receive notifications.",
      );
      return;
    }

    for (const r of selectedRows) {
      if (!r.editedEmail.trim()) {
        setError(`Please provide a valid email address for ${r.userName}.`);
        return;
      }
    }

    try {
      setSaving(true);
      setError("");

      const adminEmailsToSave: string[] = [];
      const managerEmailsToSave: string[] = [];

      for (const r of selectedRows) {
        const finalEmail = r.editedEmail.trim();

        if (r.role.toLowerCase() === "admin") {
          adminEmailsToSave.push(finalEmail);
        } else {
          managerEmailsToSave.push(finalEmail);
        }

        // If they modified or added an email, sync it to their User profile natively!
        if (finalEmail !== r.email) {
          try {
            await dataService.updateUser(r.employeeId, { email: finalEmail });
          } catch (updateErr: any) {
            // Blocking: If email is duplicate or invalid, stop the save
            const msg =
              updateErr?.response?.data?.message ||
              updateErr?.message ||
              "Failed to update user profile email.";
            throw new Error(`Failed to update ${r.userName}: ${msg}`);
          }
        }
      }

      await onSave(
        adminEmailsToSave.join(", "),
        managerEmailsToSave.join(", "),
      );
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Failed to save admin configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={!isMandatory ? onClose : undefined}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95dvh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {isMandatory
              ? "Setup Required: Admin Configuration"
              : "Manage Notification Recipients"}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAuditModal(true)}
              title="View Notification Routing Logic"
              className="p-2 rounded-lg hover:bg-gray-200 transition-all text-gray-500">
              <Info className="w-5 h-5" />
            </button>
            {!isMandatory && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-200 transition-all text-gray-500">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-gray-50/50">
          {error && (
            <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {loadingAdmins ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <RefreshCw className="w-8 h-8 animate-spin mb-4" />
              <p className="text-sm">Loading admin/manager directory...</p>
            </div>
          ) : (
            <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl shadow-sm">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-3.5 w-12 text-center">
                      <div className="flex items-center justify-center">
                        <Check className="w-4 h-4 text-gray-400" />
                      </div>
                    </th>
                    <th className="px-5 py-3.5 font-semibold text-gray-700">
                      Admin / Manager
                    </th>
                    <th className="px-5 py-3.5 font-semibold text-gray-700">
                      System Role
                    </th>
                    <th className="px-5 py-3.5 font-semibold text-gray-700">
                      Email Contact
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-5 py-8 text-center text-gray-500">
                        No admin or manager users found in the system.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, idx) => {
                      const isFirstOfRole =
                        idx === 0 || rows[idx - 1].role !== row.role;
                      return (
                        <Fragment key={row.employeeId}>
                          {isFirstOfRole && (
                            <tr className="bg-gray-100/80">
                              <td
                                colSpan={4}
                                className="px-5 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider border-t border-b border-gray-200">
                                {row.role === "Admin"
                                  ? "System Administrators"
                                  : "Department Managers"}
                              </td>
                            </tr>
                          )}
                          <tr
                            className={`transition-all ${row.selected ? "bg-blue-50/20" : "hover:bg-gray-50"}`}>
                            <td className="px-5 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={row.selected}
                                onChange={() => toggleRow(idx)}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-5 py-3 font-medium text-gray-900">
                              {row.userName}
                              <span className="block text-xs font-normal text-gray-500 mt-0.5">
                                ID: {row.employeeId}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                {row.role}
                              </span>
                            </td>
                            <td className="px-5 py-3 w-1/3">
                              {row.selected ? (
                                <input
                                  type="email"
                                  value={row.editedEmail}
                                  onChange={(e) =>
                                    updateEditedEmail(idx, e.target.value)
                                  }
                                  className="w-full px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm placeholder-gray-400"
                                  placeholder="Enter email to subscribe"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <span className="text-gray-500">
                                  {row.email ? (
                                    row.email
                                  ) : (
                                    <span className="text-gray-400 italic font-light">
                                      No email configured
                                    </span>
                                  )}
                                </span>
                              )}
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-t border-gray-200 bg-white shrink-0">
          <p className="text-xs text-gray-500 hidden sm:block">
            {rows.filter((r) => r.selected).length} recipient(s) selected
          </p>
          <div className="flex justify-end gap-3 w-full sm:w-auto">
            {!isMandatory && (
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all">
                Cancel
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={saving || loadingAdmins || rows.length === 0}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 flex-1 sm:flex-none">
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {isMandatory ? "Save Recipients" : "Save Changes"}
            </button>
          </div>
        </div>
      </motion.div>
      <AnimatePresence>
        {showAuditModal && (
          <NotificationAuditModal onClose={() => setShowAuditModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================
// NOTIFICATION DETAIL MODAL
// =============================================

function NotificationDetailModal({
  log,
  onClose,
  onViewAsset,
  onViewMaintenance,
  adminNames,
  adminEmails,
}: {
  log: NotificationLog;
  onClose: () => void;
  onViewAsset?: (asset: Partial<Asset>) => void;
  onViewMaintenance?: (m: Partial<any>) => void;
  adminNames?: string | null;
  adminEmails?: string | null;
}) {
  const isMaintenance = log.category === "MAINTENANCE";
  const isSystemAudit = log.category === "SYSTEM_AUDIT";
  const isSuppressed =
    log.recipientType === "Suppressed" ||
    Boolean((log as any).anomalyMeta?.suppressedBy);
  const isMerged =
    log.recipientType === "Merged" ||
    Boolean((log as any).anomalyMeta?.mergedBy);
  const isInactive = isSuppressed || isMerged;

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
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isInactive ? "bg-amber-100" : isSystemAudit ? "bg-gray-100" : isMaintenance ? "bg-blue-100" : "bg-orange-100"}`}>
              {isInactive ? (
                <XCircle className="w-4 h-4 text-red-600" />
              ) : isSystemAudit ? (
                <Target className="w-4 h-4 text-gray-600" />
              ) : (
                <Mail
                  className={`w-4 h-4 ${isMaintenance ? "text-blue-600" : "text-orange-600"}`}
                />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                {isMerged
                  ? "Notification Merged"
                  : isSuppressed
                    ? "Notification Suppressed"
                    : isSystemAudit
                      ? "System Event Logged"
                      : "Notification Sent"}
              </h2>
              <p className="text-sm text-gray-500">
                {log.type.replace("_", " ")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 transition-all text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Target className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Asset Context
                </span>
              </div>
              <p className="text-sm font-medium text-gray-900 whitespace-pre-wrap mt-1">
                {log.assetName}
              </p>
              {log.assetCode && (
                <p className="text-xs text-gray-500 font-mono mt-1">
                  {log.assetCode}
                </p>
              )}
            </div>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                {isInactive ? (
                  <XCircle className="w-4 h-4" />
                ) : isSystemAudit ? (
                  <Users className="w-4 h-4" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {isInactive
                    ? "Status"
                    : isSystemAudit
                      ? "Actor"
                      : "Recipient"}
                </span>
              </div>
              {isInactive ? (
                <p className="text-sm font-medium text-gray-500 italic mt-1">
                  {isMerged
                    ? "Replaced by a newer alert — only the latest email is sent"
                    : "Skipped before dispatch — email was not sent"}
                </p>
              ) : (
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {getDisplayRecipient(log, adminNames)}
                </p>
              )}
              <div className="mt-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isMerged
                    ? "bg-amber-100 text-amber-700"
                    : log.recipientType === "Cancelled"
                      ? "bg-red-100 text-red-700"
                      : log.recipientType === "Technician & Manager" || log.recipientType === "Manager & Admin"
                        ? "bg-purple-100 text-purple-700"
                        : log.recipientType === "Technician"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-amber-100 text-amber-700"
                    }`}>
                  {isMerged ? "Merged" : log.recipientType}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
            <div className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50/50 transition-all">
              <div className="w-8 shrink-0 flex justify-center text-gray-400">
                <Calendar className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Target Date
                </p>
                <p className="text-sm font-medium text-gray-900 mt-0.5">
                  {log.targetDate
                    ? formatDisplayDateFull(log.targetDate)
                    : "No specific date"}
                </p>
              </div>
            </div>
            <div className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50/50 transition-all">
              <div className="w-8 shrink-0 flex justify-center text-gray-400">
                <Clock className="w-4 h-4 text-green-500" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  {isMerged
                    ? "Merged At"
                    : isSuppressed
                      ? "Suppressed At"
                      : isSystemAudit
                        ? "Event Timestamp"
                        : "Sent Timestamp"}
                </p>
                <p className="text-sm font-medium text-gray-900 mt-0.5">
                  {new Date(log.sentAt).toLocaleString("en-IN", {
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 shrink-0 modal-safe-bottom">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all focus:ring-2 focus:ring-blue-500/20 outline-none">
            Close
          </button>
          {(log.assetId || log.maintenanceId) &&
            (onViewAsset || onViewMaintenance) && (
              <button
                onClick={() => {
                  if (
                    log.category === "MAINTENANCE" &&
                    onViewMaintenance &&
                    log.maintenanceId
                  ) {
                    onViewMaintenance({
                      id: String(log.maintenanceId),
                      assetId: String(log.assetId),
                      assetCode: log.assetCode,
                      assetName: log.assetName,
                    });
                  } else if (onViewAsset && log.assetId) {
                    onViewAsset({
                      id: String(log.assetId),
                      assetCode: log.assetCode,
                    });
                  }
                  onClose();
                }}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 transition-all focus:ring-2 focus:ring-blue-500/20 outline-none shadow-sm">
                <ExternalLink className="w-4 h-4" />
                View {log.category === "MAINTENANCE" ? "Maintenance" : "Asset"}
              </button>
            )}
        </div>
      </motion.div>
    </div>
  );
}

function parseRecipientTokens(value?: string) {
  if (!value) return [];
  return value
    .split(/\s*(?:\+|,)\s*/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function getDisplayRecipient(
  log: NotificationLog,
  adminNames?: string | null,
  adminEmails?: string | null,
  showRoleOnly: boolean = false
) {
  if (showRoleOnly) {
    return log.recipientType || log.recipient || "Admin";
  }

  const recipient = log.recipient?.trim() || "";
  const recipientTokens = parseRecipientTokens(recipient);
  const adminTokens = parseRecipientTokens(adminNames?.trim());

  if (recipient === "Admin" && adminTokens.length > 0) {
    return adminTokens.join(" + ");
  }

  if (
    recipient === "Technician" &&
    log.recipientType === "Technician & Manager" &&
    adminTokens.length > 0
  ) {
    return [...new Set([recipient, ...adminTokens])].join(" + ");
  }

  if (recipientTokens.length > 0) {
    return [...new Set(recipientTokens)].join(" + ");
  }

  return recipient || log.recipientType || "Admin";
}

function getAnomalyTargetDateLabel(log: NotificationLog) {
  if (!log.targetDate) {
    return log.category === "ANOMALY"
      ? "No target date for anomaly alerts"
      : "—";
  }

  return formatDisplayDateWithWeekday(log.targetDate);
}

function getSuppressionLabel(log: NotificationLog) {
  const suppressionActor =
    (log.recipient || "").trim() ||
    ((log as any).anomalyMeta?.suppressedBy as string | undefined)?.trim() ||
    ((log as any).anomalyMeta?.SuppressedBy as string | undefined)?.trim();

  if (!suppressionActor) {
    return "Suppressed";
  }

  return suppressionActor.toLowerCase() === "suppressed"
    ? "Suppressed"
    : `Suppressed by ${suppressionActor}`;
}

function getAnomalyCardStatus(log: NotificationLog) {
  if (log.recipientType === "Merged") {
    return "Merged";
  }

  if (log.recipientType === "Suppressed") {
    return getSuppressionLabel(log);
  }

  return `To: ${getDisplayRecipient(log, null, null, true)}`;
}

function getRecipientBadgeClass(recipientType?: string | null) {
  switch (recipientType) {
    case "Admin":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "Manager":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    case "Technician & Manager":
    case "Manager & Admin":
      return "bg-green-50 text-green-700 border-green-200";
    case "Suppressed":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "Merged":
      return "bg-orange-50 text-orange-700 border-orange-200";
    default:
      return "bg-blue-50 text-blue-700 border-blue-200";
  }
}

function getRecipientBadgeLabel(log: NotificationLog) {
  switch (log.recipientType) {
    case "Admin":
      return "Admin";
    case "Manager":
      return "Manager";
    case "Manager & Admin":
      return "Manager + Admin";
    case "Technician & Manager":
      return "Technician + Manager";
    case "Suppressed":
      return "Suppressed";
    case "Merged":
      return "Merged";
    default:
      return "Technician";
  }
}

function AnomalyDetailModal({
  log,
  onClose,
  onViewAsset,
  onViewUser,
  adminNames,
  adminEmails,
}: {
  log: NotificationLog & { anomalyMeta?: Record<string, unknown> | null };
  onClose: () => void;
  onViewAsset?: (asset: Partial<Asset>) => void;
  onViewUser?: (employeeId: string) => void;
  adminNames?: string | null;
  adminEmails?: string | null;
}) {
  const rawMeta = (log as any).anomalyMeta;
  const meta: Record<string, unknown> =
    rawMeta && typeof rawMeta === "object" ? rawMeta : {};

  const readMetaValue = (keys: string[]): unknown => {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(meta, key)) {
        return meta[key];
      }
    }
    return null;
  };

  const readMetaString = (keys: string[]): string | null => {
    const value = readMetaValue(keys);
    if (value == null) return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  };

  const readMetaNumber = (keys: string[]): number | null => {
    const value = readMetaValue(keys);
    if (value == null) return null;
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  const isSuppressed =
    log.recipientType === "Suppressed" ||
    Boolean(readMetaValue(["suppressedBy"]));
  const isMerged =
    log.recipientType === "Merged" || Boolean(readMetaValue(["mergedBy"]));
  const isInactive = isSuppressed || isMerged;
  const suppressionActor =
    readMetaString([
      "suppressedBy",
      "SuppressedBy",
      "suppressedByName",
      "suppressedByUser",
      "suppressedByUserName",
    ]) || (isSuppressed ? log.recipient?.trim() || null : null);
  const anomalyTargetDateLabel = log.targetDate
    ? formatDisplayDateFull(log.targetDate)
    : "No target date assigned";

  const formatDayCount = (value: number | null): string =>
    value == null ? "—" : `${Math.max(0, value)} day(s)`;

  const lemonDaysSinceLast = readMetaNumber([
    "daysSinceLast",
    "daysSinceLastRepair",
  ]);
  const ghostDaysDormant = readMetaNumber(["daysDormant", "dormantDays"]);

  // ── Per-type config ────────────────────────────────────────────────────────
  const typeConfig: Record<
    string,
    {
      label: string;
      subtitle: string;
      iconBg: string;
      iconColor: string;
      icon: any;
    }
  > = {
    HOARDER: {
      label: "Anomaly Alert",
      subtitle: "Allocation Anomaly — Hoarder",
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
      icon: Users,
    },
    LEMON: {
      label: "Anomaly Alert",
      subtitle: "Maintenance Anomaly — Lemon Hardware",
      iconBg: "bg-orange-100",
      iconColor: "text-orange-600",
      icon: Wrench,
    },
    SOFTWARE_DUPLICATE: {
      label: "Anomaly Alert",
      subtitle: "Allocation Anomaly — Duplicate Software",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
      icon: Copy,
    },
    GHOST_ASSET: {
      label: "Anomaly Alert",
      subtitle: "Audit Anomaly — Ghost Asset",
      iconBg: "bg-purple-100",
      iconColor: "text-purple-600",
      icon: Ghost,
    },
  };
  const cfg = typeConfig[log.type] ?? {
    label: "Anomaly Alert",
    subtitle: log.type.replace(/_/g, " "),
    iconBg: "bg-gray-100",
    iconColor: "text-gray-600",
    icon: ShieldAlert,
  };
  const Icon = cfg.icon;

  // ── Build 2-column cards per type ────────────────────────────────────────
  type CardDef = { icon: any; label: string; value: string; sub?: string };
  let card1: CardDef, card2: CardDef, card3: CardDef;
  type DetailRow = {
    icon: any;
    iconColor: string;
    label: string;
    value: string;
  };
  const detailRows: DetailRow[] = [];

  if (log.type === "HOARDER") {
    card1 = {
      icon: Users,
      label: "Employee",
      value: readMetaString(["userName"]) || "Unknown",
      sub: undefined,
    };
    card2 = {
      icon: Target,
      label: "Asset Type",
      value: readMetaString(["assetType"]) || log.assetName || "—",
    };
    detailRows.push({
      icon: AlertTriangle,
      iconColor: "text-red-500",
      label: "Active Allocations",
      value: `${readMetaNumber(["alertCount"]) ?? "—"} (milestone alert)`,
    });
  } else if (log.type === "LEMON") {
    card1 = {
      icon: Target,
      label: "Asset",
      value: log.assetName || readMetaString(["assetName"]) || "—",
      sub: log.assetCode || readMetaString(["assetCode"]) || undefined,
    };
    card2 = {
      icon: Wrench,
      label: "Days Since Last Repair",
      value: formatDayCount(lemonDaysSinceLast),
    };
    detailRows.push({
      icon: AlertTriangle,
      iconColor: "text-orange-500",
      label: "Recommendation",
      value: "Consider retiring instead of repairing again",
    });
  } else if (log.type === "SOFTWARE_DUPLICATE") {
    card1 = {
      icon: Users,
      label: "Employee",
      value: readMetaString(["userName"]) || "Unknown",
    };
    card2 = {
      icon: Copy,
      label: "Software Type",
      value: readMetaString(["assetType", "softwareType"]) || "—",
    };
    detailRows.push({
      icon: Copy,
      iconColor: "text-amber-500",
      label: "Duplicate Copies Active",
      value: `${readMetaNumber(["duplicateCount"]) ?? "—"}`,
    });
    const softwareName = readMetaString(["softwareName"]);
    if (softwareName) {
      detailRows.push({
        icon: Key,
        iconColor: "text-amber-400",
        label: "Software Name",
        value: softwareName,
      });
    }
  } else if (log.type === "GHOST_ASSET") {
    card1 = {
      icon: Target,
      label: "Asset",
      value: log.assetName || readMetaString(["assetCode", "assetName"]) || "—",
      sub: log.assetCode || readMetaString(["assetCode"]) || undefined,
    };
    card2 = {
      icon: Ghost,
      label: "Dormant For",
      value: formatDayCount(ghostDaysDormant),
    };
    detailRows.push({
      icon: AlertTriangle,
      iconColor: "text-purple-500",
      label: "Status",
      value: "Available — no activity for over 1 year",
    });
  } else {
    card1 = {
      icon: Target,
      label: "Context",
      value: log.assetName || "—",
      sub: log.assetCode,
    };
    card2 = { icon: Bell, label: "Type", value: log.type };
  }

  // Define universal 3rd card for anomalies
  card3 = {
    icon: Mail,
    label: isInactive ? "Status" : "Recipient",
    value: isMerged
      ? "Replaced by a newer alert"
      : isSuppressed
        ? `Suppressed by ${suppressionActor || "Unknown"}`
        : getDisplayRecipient(log, adminNames, adminEmails),
  };

  // "View Asset/User" button for anomaly types
  const canViewAsset =
    !!log.assetId &&
    !!onViewAsset &&
    (log.type === "LEMON" || log.type === "GHOST_ASSET");
  const anomalyEmployeeId = readMetaString(["employeeId"]);
  const canViewUser =
    !!anomalyEmployeeId &&
    !!onViewUser &&
    (log.type === "HOARDER" || log.type === "SOFTWARE_DUPLICATE");

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
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header — matches NotificationDetailModal exactly */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${cfg.iconBg}`}>
              <Icon className={`w-4 h-4 ${cfg.iconColor}`} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                {cfg.label}
              </h2>
              <p className="text-sm text-gray-500">{cfg.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 transition-all text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* 3-column context cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Card 1 */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex flex-col justify-start">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <card1.icon className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {card1.label}
                </span>
              </div>
              <p
                className="text-sm font-medium text-gray-900 mt-1 truncate"
                title={card1.value}>
                {card1.value}
              </p>
              {card1.sub && (
                <p className="text-xs text-gray-500 font-mono mt-1 truncate">
                  {card1.sub}
                </p>
              )}
            </div>
            {/* Card 2 */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex flex-col justify-start">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <card2.icon className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {card2.label}
                </span>
              </div>
              <p
                className="text-sm font-medium text-gray-900 mt-1 truncate"
                title={card2.value}>
                {card2.value}
              </p>
              {card2.sub && (
                <p className="text-xs text-gray-500 font-mono mt-1 truncate">
                  {card2.sub}
                </p>
              )}
            </div>
            {/* Card 3 */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex flex-col justify-start">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <card3.icon className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {card3.label}
                </span>
              </div>
              <p
                className="text-sm font-medium text-gray-900 mt-1 truncate"
                title={card3.value}>
                {card3.value}
              </p>
              {card3.sub && (
                <p className="text-xs text-gray-500 font-mono mt-1 truncate">
                  {card3.sub}
                </p>
              )}
            </div>
          </div>

          {/* Detail rows — matches the bordered card with divide-y */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
            {detailRows.map((row, i) => (
              <div
                key={i}
                className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50/50 transition-all">
                <div className="w-8 shrink-0 flex justify-center">
                  <row.icon className={`w-4 h-4 ${row.iconColor}`} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">
                    {row.label}
                  </p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">
                    {row.value}
                  </p>
                </div>
              </div>
            ))}
            {/* Sent timestamp always last */}
            <div className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50/50 transition-all">
              <div className="w-8 shrink-0 flex justify-center">
                <Clock className="w-4 h-4 text-green-500" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  {isMerged
                    ? "Merged At"
                    : isSuppressed
                      ? "Suppressed At"
                      : "Alert Sent"}
                </p>
                <p className="text-sm font-medium text-gray-900 mt-0.5">
                  {new Date(log.sentAt).toLocaleString("en-IN", {
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer — same as NotificationDetailModal */}
        <div className="px-4 sm:px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 shrink-0 modal-safe-bottom">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all focus:ring-2 focus:ring-blue-500/20 outline-none">
            Close
          </button>
          {canViewAsset && (
            <button
              onClick={() => {
                onViewAsset!({
                  id: String(log.assetId),
                  assetCode: log.assetCode ?? undefined,
                });
                onClose();
              }}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 transition-all focus:ring-2 focus:ring-blue-500/20 outline-none shadow-sm">
              <ExternalLink className="w-4 h-4" />
              View Asset
            </button>
          )}
          {canViewUser && (
            <button
              onClick={() => {
                if (anomalyEmployeeId) {
                  onViewUser!(anomalyEmployeeId);
                }
                onClose();
              }}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 transition-all focus:ring-2 focus:ring-blue-500/20 outline-none shadow-sm">
              <ExternalLink className="w-4 h-4" />
              View Employee
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function ScheduledMailsModal({
  onClose,
  onViewAsset,
  onViewMaintenance,
  onLogGenerated,
}: {
  onClose: () => void;
  onViewAsset?: (asset: Partial<Asset>) => void;
  onViewMaintenance?: (m: Partial<any>) => void;
  onLogGenerated?: () => void;
}) {
  const [cancellingKey, setCancellingKey] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<NotificationLog[]>([]);
  const [pendingAnomalies, setPendingAnomalies] = useState<
    PendingAnomalyAlert[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [anomalyActionId, setAnomalyActionId] = useState<number | null>(null);
  const [controlSettings, setControlSettings] =
    useState<NotificationControlSettings | null>(null);
  const [forecastDays, setForecastDays] = useState<number>(60);
  const [showAllForecast, setShowAllForecast] = useState(false);

  const getUpcomingRowKey = (log: NotificationLog, index: number = 0) =>
    `${log.category}-${log.id}-${log.type}-${log.milestoneAction || "none"}-${log.targetDate || "none"}-${index}`;

  const fetchUpcoming = async () => {
    try {
      setLoading(true);
      const [data, controls, anomalies] = await Promise.all([
        dataService.getUpcomingNotifications(),
        dataService.getNotificationControlSettings().catch(() => null),
        dataService.getPendingAnomalyApprovals().catch(() => []),
      ]);
      setUpcoming(data);
      setControlSettings(controls);
      setPendingAnomalies(anomalies || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUpcoming();
  }, []);

  const isEmailDeliveryDisabled =
    controlSettings != null && !controlSettings.enableEmailNotifications;
  const isManualDispatchDisabled =
    controlSettings != null && !controlSettings.enableManualDispatch;

  const isOutsideActiveTimeWindow = useMemo(() => {
    if (!controlSettings?.enableActiveTimeWindow) return false;

    const parseMinutes = (value: string) => {
      const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ""));
      if (!match) return null;
      return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
    };

    const startMinutes = parseMinutes(controlSettings.activeHoursStart);
    const endMinutes = parseMinutes(controlSettings.activeHoursEnd);
    if (
      startMinutes == null ||
      endMinutes == null ||
      startMinutes === endMinutes
    ) {
      return false;
    }

    const localNow = new Date(
      new Date().toLocaleString("en-US", {
        timeZone:
          controlSettings.activeHoursTimezone ||
          Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    );
    const nowMinutes = localNow.getHours() * 60 + localNow.getMinutes();

    let isWithinActiveWindow;
    if (startMinutes < endMinutes) {
      isWithinActiveWindow =
        nowMinutes >= startMinutes && nowMinutes < endMinutes;
    } else {
      isWithinActiveWindow =
        nowMinutes >= startMinutes || nowMinutes < endMinutes;
    }

    return !isWithinActiveWindow;
  }, [controlSettings]);

  const isChannelDispatchDisabled = (log: NotificationLog) => {
    if (!controlSettings) return false;

    if (log.category === "MAINTENANCE") {
      return !controlSettings.enableMaintenanceAlerts;
    }

    if (log.category === "LICENSE") {
      return !controlSettings.enableLicenseExpiryAlerts;
    }

    return true;
  };

  const normalizeAnomalyMessage = (message?: string | null) => {
    if (!message) return "";
    return String(message)
      .replace(/\s*Auto-send.*$/i, "")
      .trim();
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

  const getAnomalyLabel = (anomalyType?: string | null) => {
    const raw = String(anomalyType || "").toUpperCase();
    if (raw === "SOFTWARE_DUPLICATE") return "Software Duplicate";
    if (raw === "HOARDER") return "Hoarder";
    if (raw === "LEMON") return "Lemon Hardware";
    if (raw === "GHOST_ASSET") return "Ghost Asset";
    return "Anomaly";
  };

  const handleSendNow = async (e: React.MouseEvent, log: NotificationLog) => {
    e.stopPropagation();
    if (isEmailDeliveryDisabled) {
      toast.info(
        "Email delivery is disabled in Admin Control. Notifications remain visible in the website.",
      );
      return;
    }

    if (isManualDispatchDisabled) {
      toast.info("Manual dispatch is disabled in Admin Control.");
      return;
    }


    if (isChannelDispatchDisabled(log)) {
      toast.info(
        log.category === "LICENSE"
          ? "License expiry notifications are disabled in Admin Control."
          : "Maintenance notifications are disabled in Admin Control.",
      );
      return;
    }

    const rowKey = getUpcomingRowKey(log);
    try {
      setSendingKey(rowKey);

      // Optimistically remove from view
      setUpcoming((prev) => prev.filter((item) => getUpcomingRowKey(item) !== rowKey));

      await dataService.sendNotificationNow(log);
      toast.success(
        log.category === "LICENSE"
          ? "License email dispatched successfully!"
          : "Notification dispatched successfully!",
      );
      onLogGenerated?.(); // Trigger main table refresh
    } catch (err) {
      const message = getErrorMessage(err) || "Failed to dispatch notification";
      if (
        message.toLowerCase().includes("disabled in admin control") ||
        message.toLowerCase().includes("quiet hours") ||
        message.toLowerCase().includes("active time window")
      ) {
        toast.info(message);
      } else {
        toast.error(message);
      }
      await fetchUpcoming(); // Refresh list to bring it back on failure
    } finally {
      setSendingKey(null);
    }
  };

  const handleCancel = async (e: React.MouseEvent, log: NotificationLog) => {
    e.stopPropagation();
    if (
      !window.confirm(
        "Are you sure you want to cancel this scheduled notification? It will not be sent.",
      )
    ) {
      return;
    }

    const rowKey = getUpcomingRowKey(log);
    try {
      setCancellingKey(rowKey);

      // Optimistically remove from view
      setUpcoming((prev) => prev.filter((item) => getUpcomingRowKey(item) !== rowKey));

      await dataService.cancelNotification(log);
      toast.success("Notification cancelled successfully");
      onLogGenerated?.();
    } catch (err) {
      toast.error(getErrorMessage(err) || "Failed to cancel notification");
      await fetchUpcoming(); // Refresh list to bring it back on failure
    } finally {
      setCancellingKey(null);
    }
  };

  const handleAnomalySendNow = async (alertId: number) => {
    if (anomalyActionId === alertId) return;

    try {
      setAnomalyActionId(alertId);

      // Optimistically remove from view
      setPendingAnomalies((prev) => prev.filter((a) => a.id !== alertId));

      await dataService.approveAnomalyAlert(alertId);
      toast.success("Anomaly email dispatched");
      onLogGenerated?.();
    } catch (err) {
      toast.error(getErrorMessage(err) || "Failed to send anomaly email");
      await fetchUpcoming(); // Refresh list to bring it back on failure
    } finally {
      setAnomalyActionId(null);
    }
  };

  const handleAnomalyIgnore = async (alertId: number) => {
    if (anomalyActionId === alertId) return;

    try {
      setAnomalyActionId(alertId);

      // Optimistically remove from view
      setPendingAnomalies((prev) => prev.filter((a) => a.id !== alertId));

      await dataService.ignoreAnomalyAlert(alertId);
      toast.success("Anomaly notification suppressed");
      onLogGenerated?.();
    } catch (err) {
      toast.error(getErrorMessage(err) || "Failed to suppress anomaly");
      await fetchUpcoming(); // Refresh list to bring it back on failure
    } finally {
      setAnomalyActionId(null);
    }
  };

  const getTypeStyle = (log: NotificationLog) => {
    if (log.category === "SYSTEM_AUDIT") {
      switch (log.type) {
        case "CREATE":
          return {
            icon: Zap,
            color: "text-green-700",
            bg: "bg-green-100",
            label: "Asset Created",
          };
        case "DELETE":
          return {
            icon: XCircle,
            color: "text-red-700",
            bg: "bg-red-100",
            label: "Asset Deleted",
          };
        case "STATUS_CHANGE":
          return {
            icon: RefreshCw,
            color: "text-purple-700",
            bg: "bg-purple-100",
            label: "Status Updated",
          };
        default:
          return {
            icon: Target,
            color: "text-gray-700",
            bg: "bg-gray-100",
            label: "System Audit",
          };
      }
    }

    if (log.category === "LICENSE") {
      const milestone = log.milestoneLabel ? ` (${log.milestoneLabel})` : "";
      switch (log.type) {
        case "OVERDUE_CATCHUP":
          return {
            icon: AlertTriangle,
            color: "text-red-700",
            bg: "bg-red-100",
            label: `License Catch-up${milestone}`,
          };
        case "ACTION_TODAY":
          return {
            icon: Key,
            color: "text-orange-700",
            bg: "bg-orange-100",
            label: `License Trigger Today${milestone}`,
          };
        default:
          return {
            icon: Key,
            color: "text-blue-700",
            bg: "bg-blue-100",
            label: `License Scheduled${milestone}`,
          };
      }
    }

    const type = log.type;
    switch (type) {
      case "OVERDUE_CATCHUP":
        return {
          icon: AlertTriangle,
          color: "text-red-700",
          bg: "bg-red-100",
          label: "Overdue Alert",
        };
      case "ACTION_TODAY":
        return {
          icon: Zap,
          color: "text-orange-700",
          bg: "bg-orange-100",
          label: "Action Today",
        };
      case "REMINDER":
        return {
          icon: Bell,
          color: "text-blue-700",
          bg: "bg-blue-100",
          label: "Reminder",
        };
      case "TROUBLESHOOT":
        return {
          icon: AlertTriangle,
          color: "text-red-600",
          bg: "bg-red-100",
          label: "User Reported Issue",
        };
      default:
        return {
          icon: Calendar,
          color: "text-gray-700",
          bg: "bg-gray-100",
          label: "Upcoming",
        };
    }
  };

  const canSendNow = (log: NotificationLog) => {
    if (
      isEmailDeliveryDisabled ||
      isManualDispatchDisabled ||
      isOutsideActiveTimeWindow ||
      isChannelDispatchDisabled(log)
    ) {
      return false;
    }

    if (log.category === "MAINTENANCE") {
      return true;
    }

    if (log.category !== "LICENSE") {
      return false;
    }

    return (
      !!log.milestoneAction &&
      !!log.licenseExpiryDate &&
      (log.milestoneDays === 30 ||
        log.milestoneDays === 7 ||
        log.milestoneDays === 1)
    );
  };

  const filteredUpcoming = useMemo(() => {
    if (showAllForecast) return upcoming;

    const now = new Date();
    const limitDate = new Date();
    limitDate.setDate(now.getDate() + forecastDays);

    return upcoming.filter((log) => {
      if (!log.targetDate) return true; // Keep items without date (anomalies usually don't have target date but upcoming items should)
      const target = new Date(log.targetDate);
      return target <= limitDate;
    });
  }, [upcoming, showAllForecast, forecastDays]);

  const filteredPendingAnomalies = useMemo(() => {
    if (showAllForecast) return pendingAnomalies;

    const now = new Date();
    const limitDate = new Date();
    limitDate.setDate(now.getDate() + forecastDays);

    return pendingAnomalies.filter((alert) => {
      if (!alert.scheduledFor) return true;
      const scheduled = new Date(alert.scheduledFor);
      if (Number.isNaN(scheduled.getTime())) return true;
      return scheduled <= limitDate;
    });
  }, [pendingAnomalies, showAllForecast, forecastDays]);

  const hiddenCount = upcoming.length - filteredUpcoming.length;
  const hasForecastItems =
    filteredUpcoming.length > 0 || filteredPendingAnomalies.length > 0;

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
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Scheduled Mails Forecast
              </h2>
              <p className="text-sm text-gray-500">
                Next {forecastDays} days of maintenance, license, and anomaly
                alerts
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!showAllForecast && hiddenCount > 0 && (
              <button
                onClick={() => setShowAllForecast(true)}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg transition-all border border-indigo-100">
                Show all (+{hiddenCount} more)
              </button>
            )}
            {showAllForecast && (
              <button
                onClick={() => setShowAllForecast(false)}
                className="text-xs font-medium text-gray-600 hover:text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg transition-all border border-gray-200">
                Show next {forecastDays} days
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-200 transition-all text-gray-500">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50/50">
          {isEmailDeliveryDisabled && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-sm">
                Email delivery is disabled from Admin Control. Scheduled items
                are still visible here for website tracking.
              </p>
            </div>
          )}

          {!isEmailDeliveryDisabled && isManualDispatchDisabled && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-sm">
                Manual dispatch is disabled in Admin Control. Scheduled items
                are visible for monitoring only.
              </p>
            </div>
          )}


          {error && (
            <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <RefreshCw className="w-8 h-8 animate-spin mb-4" />
              <p className="text-sm">Calculating future schedules...</p>
            </div>
          ) : !hasForecastItems ? (
            <div className="text-center py-16 bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Calendar className="w-6 h-6 text-gray-400" />
              </div>
              <h3 className="text-base font-medium text-gray-900">
                No alerts in next {forecastDays} days
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {hiddenCount > 0
                  ? `There are ${hiddenCount} alerts scheduled further in the future.`
                  : "There are currently no pending maintenance or license email schedules."}
              </p>
              {hiddenCount > 0 && (
                <button
                  onClick={() => setShowAllForecast(true)}
                  className="mt-4 text-sm font-medium text-indigo-600 hover:underline">
                  View full forecast
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden text-sm">
              <div className="divide-y divide-gray-100">
                {/* Desktop Table Header */}
                <div className="hidden lg:flex items-center bg-gray-50 border-b border-gray-200 px-5 py-3.5 font-semibold text-gray-700">
                  <div className="w-40 shrink-0">Schedule Date</div>
                  <div className="w-36 shrink-0">Alert Type</div>
                  <div className="flex-1 min-w-0">Asset Context</div>
                  <div className="w-48 shrink-0">Recipient</div>
                  <div className="w-10 ml-2 shrink-0"></div>
                </div>

                {filteredPendingAnomalies.length > 0 && (
                  <div className="bg-red-50/30">
                    <div className="flex items-center justify-between bg-red-50/50 px-4 py-2 border-b border-red-100">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                        <span className="text-xs font-bold text-red-800 uppercase tracking-wider">
                          Anomaly queue
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                        {filteredPendingAnomalies.length} QUEUED
                      </span>
                    </div>
                    <div className="divide-y divide-red-100">
                      {filteredPendingAnomalies.map((alert) => {
                        const label = getAnomalyLabel(alert.anomalyType);
                        const summary =
                          normalizeAnomalyMessage(alert.message) ||
                          "An anomaly alert is pending approval.";
                        const scheduledText = formatAutoSendLabel(
                          alert.scheduledFor,
                        );

                        return (
                          <div
                            key={`anomaly-${alert.id}`}
                            className="flex flex-col lg:flex-row lg:items-center px-4 py-4 lg:px-5 hover:bg-red-50/80 transition-all group relative gap-3 lg:gap-4">
                            {/* Mobile Only Header */}
                            <div className="flex items-center justify-between lg:hidden w-full">
                              <span className="text-xs font-bold text-red-700">
                                {scheduledText}
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleAnomalyIgnore(alert.id)}
                                  disabled={anomalyActionId === alert.id}
                                  className="p-2 rounded-lg bg-gray-100 text-gray-600 transition-all hover:bg-gray-200 disabled:opacity-50">
                                  <X className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleAnomalySendNow(alert.id)}
                                  disabled={anomalyActionId === alert.id}
                                  className="p-2 rounded-lg bg-blue-600 text-white transition-all hover:bg-blue-700 disabled:opacity-50">
                                  <Play className="w-4 h-4 ml-0.5" />
                                </button>
                              </div>
                            </div>

                            {/* Desktop Columns */}
                            <div className="hidden lg:block w-40 shrink-0 text-xs font-semibold text-red-600 uppercase">
                              {scheduledText}
                            </div>

                            <div className="w-36 shrink-0 flex items-center gap-2">
                              <div className="p-1.5 rounded-md bg-red-100 text-red-700 shrink-0">
                                <ShieldAlert className="w-4 h-4" />
                              </div>
                              <span className="font-semibold text-xs text-red-700">
                                {label}
                              </span>
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate">
                                {alert.title || "Anomaly alert"}
                              </p>
                              <p className="text-xs text-gray-600 mt-1 line-clamp-1">
                                {summary}
                              </p>
                            </div>

                            <div className="w-48 shrink-0 flex items-center">
                              <span className="inline-flex px-2.5 py-1 rounded-md text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                                Admin
                              </span>
                            </div>

                            <div className="hidden lg:flex items-center gap-2 ml-2 shrink-0 justify-end">
                              <button
                                onClick={() => handleAnomalyIgnore(alert.id)}
                                disabled={anomalyActionId === alert.id}
                                title="Ignore/Suppress"
                                className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-all disabled:opacity-50">
                                {anomalyActionId === alert.id ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <X className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={() => handleAnomalySendNow(alert.id)}
                                disabled={anomalyActionId === alert.id || isManualDispatchDisabled}
                                title={isManualDispatchDisabled ? "Manual dispatch disabled" : "Approve & Send Now"}
                                className="bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white p-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                                {anomalyActionId === alert.id ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Play className="w-4 h-4 ml-0.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {filteredUpcoming.map((log, index) => {
                  const style = getTypeStyle(log);
                  const Icon = style.icon;
                  const rowKey = getUpcomingRowKey(log, index);
                  const isSending = sendingKey === rowKey;
                  const showSendNow = canSendNow(log);
                  const recipientLabel = getRecipientBadgeLabel(log);
                  const recipientBadgeClass = getRecipientBadgeClass(
                    log.recipientType,
                  );

                  return (
                    <div
                      key={rowKey}
                      className="flex flex-col lg:flex-row lg:items-center px-4 py-4 lg:px-5 hover:bg-gray-50 transition-all group relative gap-3 lg:gap-4">
                      {/* Mobile Only: Date + Action */}
                      <div className="flex items-center justify-between lg:hidden w-full">
                        <span className="font-medium text-gray-900 text-base">
                          {formatDisplayDateWithWeekday(log.targetDate)}
                        </span>
                        {showSendNow ? (
                          <button
                            onClick={(e) => handleSendNow(e, log)}
                            disabled={isSending || isManualDispatchDisabled}
                            title={isManualDispatchDisabled ? "Manual dispatch disabled" : "Dispatch Immediately"}
                            className="bg-blue-50 text-blue-600 active:bg-blue-600 active:text-white p-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shrink-0">
                            {isSending ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Play className="w-4 h-4 ml-0.5" />
                            )}
                          </button>
                        ) : (
                          <span className="inline-flex px-2 py-1 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                            Auto
                          </span>
                        )}
                      </div>

                      {/* Desktop Date */}
                      <div className="hidden lg:block w-40 shrink-0 font-medium text-gray-900">
                        {formatDisplayDateWithWeekday(log.targetDate)}
                      </div>

                      {/* Alert Type */}
                      <div className="w-36 shrink-0 flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-500 lg:hidden w-16">
                          Type:
                        </span>
                        <div
                          className={`p-1.5 rounded-md ${style.bg} ${style.color} shrink-0`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span
                          className={`font-semibold text-xs ${style.color}`}>
                          {style.label}
                        </span>
                      </div>

                      {/* Asset Context */}
                      <div className="flex-1 min-w-0 flex items-start lg:items-center gap-2 overflow-hidden">
                        <span className="text-xs font-semibold text-gray-500 lg:hidden w-16 pt-0.5 shrink-0">
                          Asset:
                        </span>
                        <div className="flex-1 flex items-center justify-between gap-3 min-w-0">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">
                              {log.assetName}
                            </p>
                            {log.assetCode && (
                              <p className="text-xs text-gray-500 font-mono mt-0.5 truncate">
                                {log.assetCode}
                              </p>
                            )}
                            {log.category === "LICENSE" &&
                              log.licenseExpiryDate && (
                                <p className="text-[11px] text-orange-600 mt-0.5 truncate">
                                  Expires:{" "}
                                  {formatDisplayDate(log.licenseExpiryDate)}
                                </p>
                              )}
                          </div>
                          {(onViewAsset || onViewMaintenance) &&
                            (log.assetId || log.maintenanceId) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (
                                    log.category === "MAINTENANCE" &&
                                    onViewMaintenance &&
                                    log.maintenanceId
                                  ) {
                                    onViewMaintenance({
                                      id: String(log.maintenanceId),
                                      assetId: String(log.assetId),
                                      assetCode: log.assetCode,
                                      assetName: log.assetName,
                                    });
                                  } else if (onViewAsset && log.assetId) {
                                    onViewAsset({
                                      id: String(log.assetId),
                                      assetCode: log.assetCode,
                                    });
                                  }
                                  onClose();
                                }}
                                className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1.5 lg:p-1 text-blue-600 hover:bg-blue-50 rounded transition-all shrink-0 ml-1">
                                <ExternalLink className="w-4 h-4" />
                              </button>
                            )}
                        </div>
                      </div>

                      {/* Recipient */}
                      <div className="w-48 shrink-0 flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-500 lg:hidden w-16 shrink-0">
                          {log.recipientType === "Suppressed" ||
                            log.recipientType === "Merged"
                            ? "Status:"
                            : "To:"}
                        </span>
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium border truncate min-w-0 ${recipientBadgeClass}`}>
                          <span className="truncate">{recipientLabel}</span>
                        </span>
                      </div>

                      {/* Desktop Action */}
                      <div className="hidden lg:flex items-center gap-2 ml-2 shrink-0 justify-end">
                        <button
                          onClick={(e) => handleCancel(e, log)}
                          disabled={cancellingKey === rowKey || isSending}
                          title="Cancel/Skip Notification"
                          className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-all disabled:opacity-50">
                          {cancellingKey === rowKey ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                        </button>
                        {showSendNow ? (
                          <button
                            onClick={(e) => handleSendNow(e, log)}
                            disabled={isSending || cancellingKey === rowKey || isManualDispatchDisabled}
                            title={isManualDispatchDisabled ? "Manual dispatch disabled" : "Dispatch Immediately"}
                            className="bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white p-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-50 disabled:hover:text-blue-600 flex items-center justify-center">
                            {isSending ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Play className="w-4 h-4 ml-0.5" />
                            )}
                          </button>
                        ) : (
                          <div className="w-9"></div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// =============================================
// MAIN NOTIFICATION CENTER COMPONENT
// =============================================

export function NotificationCenter({
  onViewAsset,
  onViewMaintenance,
  users,
  licenseAllocations,
}: {
  onViewAsset?: (asset: Partial<Asset>) => void;
  onViewMaintenance?: (m: Partial<any>) => void;
  users?: User[];
  licenseAllocations?: LicenseAllocation[];
}) {
  const isMobile = useIsMobile();
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [adminEmails, setAdminEmails] = useState<string | null>(null);
  const [managerEmails, setManagerEmails] = useState<string | null>(null);
  const [adminNames, setAdminNames] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 250);
  const [filterType, setFilterType] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const typeDropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const typeDropdownMenuRef = useRef<HTMLDivElement>(null);

  const { openUpward: openTypeUpward, maxHeight: typeDropdownMaxHeight } =
    useSmartDropdownPosition({
      isOpen: isTypeDropdownOpen,
      anchorRef: typeDropdownTriggerRef,
      menuRef: typeDropdownMenuRef,
      preferredMaxHeight: 240,
    });

  const [viewingLog, setViewingLog] = useState<NotificationLog | null>(null);
  const [viewingAnomaly, setViewingAnomaly] = useState<
    (NotificationLog & { anomalyMeta?: any }) | null
  >(null);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isMandatorySetup, setIsMandatorySetup] = useState(false);
  const [showScheduledModal, setShowScheduledModal] = useState(false);

  // Live anomaly state (current database state, not just email log)
  const [liveAnomalies, setLiveAnomalies] = useState<{
    hoarders: any[];
    lemons: any[];
    softwareDuplicates: any[];
    ghostAssets: any[];
    totalIssues: number;
  } | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [liveExpanded, setLiveExpanded] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await dataService.getNotificationLogs();
      setLogs(data.logs);
      setAdminEmails(data.adminEmails);
      setManagerEmails(data.managerEmails);
      setAdminNames(data.adminNames);

      if (!data.adminEmails || data.adminEmails.trim() === "") {
        setIsMandatorySetup(true);
        setShowSettingsModal(true);
      } else {
        setIsMandatorySetup(false);
      }
    } catch (err) {
      setError(getErrorMessage(err));
      toast.error("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  const [anomalyUsers, setAnomalyUsers] = useState<User[]>([]);
  const [anomalyAllocations, setAnomalyAllocations] = useState<
    LicenseAllocation[]
  >([]);
  const [selectedAnomalyUser, setSelectedAnomalyUser] = useState<User | null>(
    null,
  );

  useEffect(() => {
    if (users && users.length > 0) {
      setAnomalyUsers(users);
    }
  }, [users]);

  useEffect(() => {
    if (licenseAllocations && licenseAllocations.length > 0) {
      setAnomalyAllocations(licenseAllocations);
    }
  }, [licenseAllocations]);

  const fetchLiveAnomalies = async () => {
    try {
      setLiveLoading(true);
      const [data, usersData, allocationsData] = await Promise.all([
        dataService.getAnomalies(),
        users && users.length > 0
          ? Promise.resolve(users)
          : dataService.getUsers(),
        licenseAllocations && licenseAllocations.length > 0
          ? Promise.resolve(licenseAllocations)
          : dataService.getLicenseAllocations(),
      ]);
      setLiveAnomalies(data);
      setAnomalyUsers(usersData);
      setAnomalyAllocations(allocationsData);
    } catch (_) {
      // Non-fatal — live panel just won't show
    } finally {
      setLiveLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchLiveAnomalies();
  }, []);

  const handleUpdateAdmins = async (
    adminEmails: string,
    managerEmails: string,
  ) => {
    const result = await dataService.updateAdminEmails(
      adminEmails,
      managerEmails,
    );
    setAdminEmails(result.emails);
    setManagerEmails(managerEmails);
    setAdminNames(result.names);
    setShowSettingsModal(false);
    setIsMandatorySetup(false);
    toast.success("Admin configuration successfully updated");
  };

  const types = useMemo(() => {
    return Array.from(new Set(logs.map((l) => l.type))).sort();
  }, [logs]);

  const searchPoolByLogKey = useMemo(() => {
    const normalizedAdmins = (adminEmails || "")
      .toLowerCase()
      .replace(/\s+/g, "");
    const normalizedManagers = (managerEmails || "")
      .toLowerCase()
      .replace(/\s+/g, "");

    const map = new Map<string, string>();
    for (const log of logs) {
      const key = `${log.category}-${log.id}`;
      const searchPool = [
        log.assetName,
        log.assetCode,
        log.type.replace(/_/g, " "),
        log.recipient,
        log.recipientType,
        log.technicianEmail,
        log.recipientType === "Admin" || log.recipientType === "Manager & Admin"
          ? normalizedAdmins
          : "",
        log.recipientType === "Manager" || log.recipientType === "Manager & Admin" || log.recipientType === "Technician & Manager"
          ? normalizedManagers
          : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .replace(/\s+/g, "");

      map.set(key, searchPool);
    }

    return map;
  }, [logs, adminEmails, managerEmails]);

  const filtered = useMemo(() => {
    let result = logs;

    if (filterType !== "all") {
      result = result.filter((l) => l.type === filterType);
    }

    if (debouncedSearchQuery) {
      const lowerQuery = debouncedSearchQuery.toLowerCase().replace(/\s+/g, "");
      result = result.filter((l) => {
        const key = `${l.category}-${l.id}`;
        const targetPool = searchPoolByLogKey.get(key) || "";
        return targetPool.includes(lowerQuery);
      });
    }
    return result;
  }, [logs, debouncedSearchQuery, filterType, searchPoolByLogKey]);

  const totalRecords = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  const paginatedLogs = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filtered.slice(startIndex, startIndex + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearchQuery, filterType]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const refreshAllNotificationData = () => {
    fetchData();
    fetchLiveAnomalies();
  };

  const getTypeStyle = (type: string) => {
    switch (type) {
      case "OVERDUE":
        return {
          icon: AlertTriangle,
          color: "text-red-600",
          bg: "bg-red-100",
          label: "Overdue",
        };
      case "LICENSE_EXPIRY":
        return {
          icon: Key,
          color: "text-orange-600",
          bg: "bg-orange-100",
          label: "License Expiry",
        };
      case "ACTION_TODAY":
        return {
          icon: Zap,
          color: "text-yellow-600",
          bg: "bg-yellow-100",
          label: "Action Today",
        };
      // Anomaly types
      case "HOARDER":
        return {
          icon: Users,
          color: "text-red-700",
          bg: "bg-red-100",
          label: "Hoarder",
        };
      case "LEMON":
        return {
          icon: Wrench,
          color: "text-orange-700",
          bg: "bg-orange-100",
          label: "Lemon Hardware",
        };
      case "SOFTWARE_DUPLICATE":
        return {
          icon: Copy,
          color: "text-amber-700",
          bg: "bg-amber-100",
          label: "Duplicate Software",
        };
      case "GHOST_ASSET":
        return {
          icon: Ghost,
          color: "text-purple-700",
          bg: "bg-purple-100",
          label: "Ghost Asset",
        };
      case "REMINDER":
      default:
        return {
          icon: Bell,
          color: "text-blue-600",
          bg: "bg-blue-100",
          label: "Reminder",
        };
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Notification Center
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Tracking recent automated system emails & alerts
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-start md:justify-end gap-2 w-full md:w-auto shrink-0">
          <button
            onClick={refreshAllNotificationData}
            disabled={loading}
            className="flex-1 md:flex-none justify-center flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all shadow-sm whitespace-nowrap">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowScheduledModal(true)}
            className="flex-1 md:flex-none justify-center flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-all shadow-sm whitespace-nowrap">
            <Calendar className="w-4 h-4 hidden sm:block" />
            Scheduled Mails
          </button>
          <button
            onClick={() => {
              setIsMandatorySetup(false);
              setShowSettingsModal(true);
            }}
            className="flex-1 md:flex-none justify-center flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all shadow-sm whitespace-nowrap">
            <SettingsIcon className="w-4 h-4 hidden sm:block" />
            Email Settings
          </button>
        </div>
      </div>

      {/* Recipient Overview Card */}
      {!loading && !error && adminEmails && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Admin Recipients
            </p>
            <p
              className="text-sm font-medium text-gray-900 truncate mt-0.5"
              title={adminNames || adminEmails || ""}>
              {adminNames || adminEmails}
            </p>
          </div>
        </div>
      )}

      {/* Live Anomaly Intelligence Panel */}
      {!liveLoading && liveAnomalies && liveAnomalies.totalIssues > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <button
            onClick={() => setLiveExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100 hover:bg-gray-100 focus:outline-none no-push">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              <span className="text-sm font-semibold text-gray-900">
                Live Anomaly Intelligence
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">
                {liveAnomalies.totalIssues} active
              </span>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-gray-400 ${liveExpanded ? "rotate-180" : ""}`}
            />
          </button>

          <AnimatePresence initial={false}>
            {liveExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-visible">
                <div className="divide-y divide-gray-100 p-4 space-y-4">
                  {/* Hoarders */}
                  {liveAnomalies.hoarders.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1 rounded bg-red-100">
                          <Users className="w-3.5 h-3.5 text-red-700" />
                        </div>
                        <span className="text-xs font-bold text-red-700 uppercase tracking-wide">
                          Hoarder — Excessive Asset Possession
                        </span>
                        <span className="ml-auto text-xs text-red-500 font-semibold">
                          {liveAnomalies.hoarders.length} employee(s)
                        </span>
                      </div>
                      <div className="rounded-lg border border-red-100 overflow-hidden text-xs">
                        <div className="grid grid-cols-3 bg-red-50 px-3 py-1.5 font-semibold text-red-600">
                          <span>Employee</span>
                          <span>Asset Type</span>
                          <span className="text-right">Active Count</span>
                        </div>
                        {liveAnomalies.hoarders.map((h: any, i: number) => (
                          <button
                            key={i}
                            onClick={() => {
                              const user = anomalyUsers.find(
                                (u) => u.employeeId === h.employeeId,
                              );
                              if (user) setSelectedAnomalyUser(user);
                            }}
                            className="w-full text-left grid grid-cols-3 px-3 py-2 border-t border-red-50 hover:bg-red-50/50 cursor-pointer focus:bg-red-50 outline-none no-push transition-colors disabled:opacity-50">
                            <span className="font-medium text-gray-900 truncate">
                              {h.userName}
                            </span>
                            <span className="text-gray-600">{h.assetType}</span>
                            <span className="text-right font-bold text-red-600">
                              {h.activeCount}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lemons */}
                  {liveAnomalies.lemons.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1 rounded bg-orange-100">
                          <Wrench className="w-3.5 h-3.5 text-orange-700" />
                        </div>
                        <span className="text-xs font-bold text-orange-700 uppercase tracking-wide">
                          Lemon Hardware — Rapid Re-Failure
                        </span>
                        <span className="ml-auto text-xs text-orange-500 font-semibold">
                          {liveAnomalies.lemons.length} asset(s)
                        </span>
                      </div>
                      <div className="rounded-lg border border-orange-100 overflow-hidden text-xs">
                        <div className="grid grid-cols-3 bg-orange-50 px-3 py-1.5 font-semibold text-orange-600">
                          <span>Asset Code</span>
                          <span>Asset Name</span>
                          <span className="text-right">Days Since Repair</span>
                        </div>
                        {liveAnomalies.lemons.map((l: any, i: number) => (
                          <button
                            key={i}
                            onClick={() =>
                              onViewAsset &&
                              l.assetId &&
                              onViewAsset({
                                id: String(l.assetId),
                                assetCode: l.AssetCode || l.assetCode,
                              })
                            }
                            disabled={!onViewAsset || !l.assetId}
                            className="w-full text-left grid grid-cols-3 px-3 py-2 border-t border-orange-50 hover:bg-orange-50/50 cursor-pointer focus:bg-orange-50 outline-none no-push transition-colors disabled:opacity-50">
                            <span className="font-mono font-medium text-gray-900">
                              {l.AssetCode || l.assetCode}
                            </span>
                            <span className="text-gray-600 truncate">
                              {l.AssetName || l.assetName}
                            </span>
                            <span className="text-right font-bold text-orange-600">
                              {l.daysSinceLast}d
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Software Duplicates */}
                  {liveAnomalies.softwareDuplicates.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1 rounded bg-amber-100">
                          <Copy className="w-3.5 h-3.5 text-amber-700" />
                        </div>
                        <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                          Duplicate Software License
                        </span>
                        <span className="ml-auto text-xs text-amber-500 font-semibold">
                          {liveAnomalies.softwareDuplicates.length} case(s)
                        </span>
                      </div>
                      <div className="rounded-lg border border-amber-100 overflow-hidden text-xs">
                        <div className="grid grid-cols-3 bg-amber-50 px-3 py-1.5 font-semibold text-amber-600">
                          <span>Employee</span>
                          <span>Software Type</span>
                          <span className="text-right">Copies</span>
                        </div>
                        {liveAnomalies.softwareDuplicates.map(
                          (s: any, i: number) => (
                            <button
                              key={i}
                              onClick={() => {
                                const user = anomalyUsers.find(
                                  (u) => u.employeeId === s.employeeId,
                                );
                                if (user) setSelectedAnomalyUser(user);
                              }}
                              className="w-full text-left grid grid-cols-3 px-3 py-2 border-t border-amber-50 hover:bg-amber-50/50 cursor-pointer focus:bg-amber-50 outline-none no-push transition-colors disabled:opacity-50">
                              <span className="font-medium text-gray-900 truncate">
                                {s.userName}
                              </span>
                              <span className="text-gray-600">
                                {s.softwareType}
                              </span>
                              <span className="text-right font-bold text-amber-600">
                                {s.duplicateCount}
                              </span>
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {/* Ghost Assets */}
                  {liveAnomalies.ghostAssets.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1 rounded bg-purple-100">
                          <Ghost className="w-3.5 h-3.5 text-purple-700" />
                        </div>
                        <span className="text-xs font-bold text-purple-700 uppercase tracking-wide">
                          Ghost Assets — Dormant &gt; 1 Year
                        </span>
                        <span className="ml-auto text-xs text-purple-500 font-semibold">
                          {liveAnomalies.ghostAssets.length} asset(s)
                        </span>
                      </div>
                      <div className="rounded-lg border border-purple-100 overflow-hidden text-xs">
                        <div className="grid grid-cols-3 bg-purple-50 px-3 py-1.5 font-semibold text-purple-600">
                          <span>Asset Code</span>
                          <span>Asset Name</span>
                          <span className="text-right">Dormant Days</span>
                        </div>
                        {liveAnomalies.ghostAssets
                          .slice(0, 10)
                          .map((g: any, i: number) => (
                            <button
                              key={i}
                              onClick={() =>
                                onViewAsset &&
                                g.assetId &&
                                onViewAsset({
                                  id: String(g.assetId),
                                  assetCode: g.AssetCode || g.assetCode,
                                })
                              }
                              disabled={!onViewAsset || !g.assetId}
                              className="w-full text-left grid grid-cols-3 px-3 py-2 border-t border-purple-50 hover:bg-purple-50/50 cursor-pointer focus:bg-purple-50 outline-none no-push transition-colors disabled:opacity-50">
                              <span className="font-mono font-medium text-gray-900">
                                {g.AssetCode || g.assetCode}
                              </span>
                              <span className="text-gray-600 truncate">
                                {g.AssetName || g.assetName}
                              </span>
                              <span className="text-right font-bold text-purple-600">
                                {g.daysDormant}d
                              </span>
                            </button>
                          ))}
                        {liveAnomalies.ghostAssets.length > 10 && (
                          <div className="px-3 py-2 text-center text-purple-400 border-t border-purple-50">
                            +{liveAnomalies.ghostAssets.length - 10} more —
                            check email for full list
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Search Bar & Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
        <div className="flex flex-row items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by asset name, code, or recipient..."
              className="w-full pl-9 pr-10 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="relative shrink-0">
            {/* Custom Dropdown Button */}
            <button
              ref={typeDropdownTriggerRef}
              onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
              className="flex items-center justify-center gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 border-[0.25px] border-gray-300 rounded-lg focus:ring-[0.5px] focus:ring-blue-500 focus:border-blue-500 bg-white cursor-pointer hover:border-gray-400 hover:shadow-sm transition-all shadow-sm font-semibold text-gray-700 text-sm whitespace-nowrap"
              title="Filter by Type">
              <Filter className="w-4 h-4 text-gray-500 sm:hidden" />
              <span className="hidden sm:inline">
                {filterType === "all"
                  ? "All Types"
                  : filterType.replace(/_/g, " ")}
              </span>
              <motion.div
                animate={{
                  rotate: isTypeDropdownOpen ? 180 : 0,
                }}
                transition={{ duration: 0.2 }}
                className="hidden sm:block">
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </motion.div>
            </button>

            {/* Custom Dropdown Menu */}
            <AnimatePresence>
              {isTypeDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsTypeDropdownOpen(false)}
                  />
                  <motion.div
                    ref={typeDropdownMenuRef}
                    initial={{ opacity: 0, scale: 0.98, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: -5 }}
                    transition={{
                      duration: 0.2,
                      ease: "easeOut",
                    }}
                    className={`absolute right-0 bg-white rounded-xl shadow-xl z-20 w-48 overflow-y-auto custom-scrollbar ${openTypeUpward ? "bottom-full mb-1" : "top-full mt-1"
                      }`}
                    style={{
                      maxHeight: `${typeDropdownMaxHeight}px`,
                      boxShadow:
                        "0 10px 30px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)",
                    }}>
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setFilterType("all");
                          setIsTypeDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-4 py-2 text-sm font-medium transition-all duration-150 ${filterType === "all"
                          ? "bg-gray-50 text-gray-700"
                          : "text-gray-700 hover:bg-gray-50"
                          }`}>
                        <span>All Types</span>
                        {filterType === "all" && (
                          <div className="ml-auto bg-blue-600 rounded-full p-0.5">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                      </button>
                      {types.map((type) => (
                        <button
                          key={type}
                          onClick={() => {
                            setFilterType(type);
                            setIsTypeDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-4 py-2 text-sm font-medium transition-all duration-150 ${filterType === type
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-700 hover:bg-gray-50"
                            }`}>
                          <span className="capitalize text-left">
                            {type.replace(/_/g, " ").toLowerCase()}
                          </span>
                          {filterType === type && (
                            <div className="ml-auto bg-blue-600 rounded-full p-0.5">
                              <Check className="w-2.5 h-2.5 text-white" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="animate-pulse">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex gap-4">
              {["w-20", "w-32", "w-24", "w-16", "w-24"].map((w, i) => (
                <div key={i} className={`h-3 bg-gray-200 rounded ${w}`} />
              ))}
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="px-4 py-3.5 border-b border-gray-50 flex items-center gap-4">
                <div className="h-4 w-4 bg-gray-200 rounded-full" />
                <div className="h-3 w-40 bg-gray-100 rounded" />
                <div className="h-3 w-28 bg-gray-100 rounded" />
                <div className="h-3 w-20 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-10 text-red-600">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">Failed to load notifications</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <Bell className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">
                {searchQuery
                  ? "No alerts match your search"
                  : "No recent alerts sent"}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden xl:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Type
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Asset
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Sent To
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Sent Date
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Target Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedLogs.map((log) => {
                    const style = getTypeStyle(log.type);
                    const Icon = style.icon;
                    const isAnomaly = log.category === "ANOMALY";
                    return (
                      <tr
                        key={`${log.category}-${log.id}`}
                        onClick={() => {
                          if ((log as any).category === "ANOMALY") {
                            setViewingAnomaly(log as any);
                          } else {
                            setViewingLog(log);
                          }
                        }}
                        className="hover:bg-gray-50/50 transition-all cursor-pointer">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className={`p-1.5 rounded-md ${style.bg} ${style.color}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className="font-semibold text-gray-900 text-xs">
                              {(style as any).label ??
                                log.type.replace(/_/g, " ")}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 min-w-50">
                          <p className="text-sm font-medium text-gray-900">
                            {log.assetName}
                          </p>
                          {log.assetCode && (
                            <p className="text-xs text-gray-500 font-mono mt-0.5">
                              {log.assetCode}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium border ${getRecipientBadgeClass(log.recipientType || (log.recipient === "Admin" ? "Admin" : null))}`}>
                            {log.recipientType === "Suppressed"
                              ? "Suppressed"
                              : getDisplayRecipient(
                                log,
                                adminNames,
                                adminEmails,
                                true
                              )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(log.sentAt).toLocaleString("en-IN", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {log.category === "ANOMALY"
                            ? getAnomalyTargetDateLabel(log)
                            : formatDisplayDate(log.targetDate)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="xl:hidden divide-y divide-gray-100">
              {paginatedLogs.map((log) => {
                const style = getTypeStyle(log.type);
                const Icon = style.icon;
                const isAnomaly = log.category === "ANOMALY";
                return (
                  <div
                    key={`${log.category}-${log.id}`}
                    onClick={() => {
                      if ((log as any).category === "ANOMALY") {
                        setViewingAnomaly(log as any);
                      } else {
                        setViewingLog(log);
                      }
                    }}
                    className="p-4 hover:bg-gray-50 transition-all cursor-pointer">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`p-1.5 rounded-md ${style.bg} ${style.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="font-semibold text-gray-900 text-xs tracking-wide">
                          {(style as any).label ?? log.type.replace(/_/g, " ")}
                        </span>
                      </div>
                      <span
                        className={`text-[11px] font-medium px-2 py-1 rounded-md border ${log.recipientType === "Suppressed"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : log.recipientType === "Merged"
                            ? "bg-orange-50 text-orange-700 border-orange-200"
                            : "bg-gray-50 text-gray-500 border-gray-200"
                          }`}>
                        {isAnomaly
                          ? log.recipientType === "Suppressed"
                            ? "Suppressed"
                            : log.recipientType === "Merged"
                              ? "Merged"
                              : "Anomaly"
                          : log.assetCode || ""}
                      </span>
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 mb-1">
                      {log.assetName}
                    </h3>
                    <div className="flex flex-col gap-1 text-xs text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        Target Date:{" "}
                        {log.category === "ANOMALY"
                          ? getAnomalyTargetDateLabel(log)
                          : formatDisplayDate(log.targetDate)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-gray-400" />
                        Sent:{" "}
                        {new Date(log.sentAt).toLocaleString("en-IN", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-500 mt-0.5">
                        <span className="text-xs font-medium">
                          {log.recipientType === "Suppressed" ||
                            log.recipientType === "Merged"
                            ? `Status: ${getAnomalyCardStatus(log)}`
                            : `To: ${getDisplayRecipient(log, adminNames, adminEmails, true)}`}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalRecords}
              itemsPerPage={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <AdminFormModal
            currentAdminEmails={adminEmails || ""}
            currentManagerEmails={managerEmails || ""}
            isMandatory={isMandatorySetup}
            onSave={handleUpdateAdmins}
            onClose={() => setShowSettingsModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Anomaly Detail Modal for ANOMALY category rows */}
      <AnimatePresence>
        {viewingAnomaly && (
          <AnomalyDetailModal
            log={viewingAnomaly}
            onClose={() => setViewingAnomaly(null)}
            onViewAsset={onViewAsset}
            onViewUser={(empId) => {
              const u = anomalyUsers.find(
                (x) => String(x.employeeId) === String(empId),
              );
              if (u) {
                setSelectedAnomalyUser(u);
              } else {
                toast.error("Employee details not found.");
              }
            }}
            adminNames={adminNames}
            adminEmails={adminEmails}
          />
        )}
      </AnimatePresence>

      {/* Standard Notification Detail Modal */}
      <AnimatePresence>
        {viewingLog && (
          <NotificationDetailModal
            log={viewingLog}
            onClose={() => setViewingLog(null)}
            onViewAsset={onViewAsset}
            onViewMaintenance={onViewMaintenance}
            adminNames={adminNames}
            adminEmails={adminEmails}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showScheduledModal && (
          <ScheduledMailsModal
            onClose={() => setShowScheduledModal(false)}
            onViewAsset={onViewAsset}
            onViewMaintenance={onViewMaintenance}
            onLogGenerated={refreshAllNotificationData}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedAnomalyUser && (
          <UserDetailModal
            user={selectedAnomalyUser}
            allocations={anomalyAllocations}
            onClose={() => setSelectedAnomalyUser(null)}
            onViewAsset={onViewAsset}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
