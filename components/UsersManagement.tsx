'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Search,
  Pencil,
  Trash2,
  X,
  Key,
  Check,
  RefreshCw,
  UserPlus,
  Users as UsersIcon,
  ChevronDown,
  Filter,
  Eye,
  MoreVertical,
  Package,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
  FileText,
  ShieldOff,
  ShieldCheck,
  Bell,
} from "lucide-react";
import { User, LicenseAllocation, Asset, Category } from '@/types';
import dataService from '@/lib/dataService';
import { useDebounce } from '@/hooks/useDebounce';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSmartDropdownPosition } from '@/hooks/useSmartDropdownPosition';
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { DeleteConfirmModal } from '@/components/ui/DeleteConfirmModal';
import { getErrorMessage } from '@/lib/utils/errorHelpers';
import { formatDisplayDate } from '@/lib/utils/dateHelpers';
import { downloadCSV } from '@/lib/utils/csvHelpers';
import { getPillBadgeClass } from '@/components/ui/StatusBadge';
import { Pagination, DEFAULT_PAGE_SIZE } from '@/components/ui/pagination';

// =============================================
// USER DETAIL MODAL (read-only)
// =============================================

export function UserDetailModal({
  user,
  onClose,
  onEdit,
  allocations = [],
  onViewAsset,
}: {
  user: User;
  onClose: () => void;
  onEdit?: () => void;
  allocations?: LicenseAllocation[];
  onViewAsset?: (asset: Asset) => void;
}) {
  const isManager = user.role === "Manager";

  // Filter allocations for this user AND sub-assets allocated to user's assets
  const userAllocations = useMemo(() => {
    // Direct allocations to this user
    const directAllocations = allocations.filter(
      (a) => a.employeeId === user.employeeId,
    );

    // Get asset IDs directly allocated (active) to this user
    const rootAssetIds = new Set(
      directAllocations
        .filter((a) => a.status === "Active")
        .map((a) => String(a.assetId)),
    );

    const chainAssetIds = new Set(rootAssetIds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const alloc of allocations) {
        if (alloc.status !== "Active") continue;
        const parentId = alloc.parentAssetId ? String(alloc.parentAssetId) : "";
        const allocAssetId = String(alloc.assetId);
        
        if (parentId && chainAssetIds.has(parentId)) {
          if (!chainAssetIds.has(allocAssetId)) {
            chainAssetIds.add(allocAssetId);
            changed = true;
          }
        }
      }
    }

    // Sub-assets: allocated to one of the user's assets via parentAssetId
    const childAllocations = allocations.filter(
      (a) =>
        a.parentAssetId &&
        chainAssetIds.has(String(a.parentAssetId)) &&
        a.employeeId !== user.employeeId,
    );

    return [...directAllocations, ...childAllocations].sort((a, b) => {
      if (a.status === "Active" && b.status !== "Active") return -1;
      if (a.status !== "Active" && b.status === "Active") return 1;
      return (
        new Date(b.allocationDate).getTime() -
        new Date(a.allocationDate).getTime()
      );
    });
  }, [allocations, user.employeeId]);

  const activeCount = userAllocations.filter(
    (a) => a.status === "Active",
  ).length;
  const returnedCount = userAllocations.length - activeCount;

  const [allocationsPage, setAllocationsPage] = useState(1);
  const [allocationsPageSize, setAllocationsPageSize] = useState(
    DEFAULT_PAGE_SIZE,
  );
  const allocationsTotalRecords = userAllocations.length;
  const allocationsTotalPages = Math.max(
    1,
    Math.ceil(allocationsTotalRecords / allocationsPageSize),
  );
  const safeAllocationsPage = Math.min(allocationsPage, allocationsTotalPages);

  const paginatedAllocations = useMemo(() => {
    const start = (safeAllocationsPage - 1) * allocationsPageSize;
    return userAllocations.slice(start, start + allocationsPageSize);
  }, [userAllocations, safeAllocationsPage, allocationsPageSize]);

  useEffect(() => {
    setAllocationsPage(1);
  }, [user.employeeId]);

  useEffect(() => {
    if (allocationsPage > allocationsTotalPages) {
      setAllocationsPage(allocationsTotalPages);
    }
  }, [allocationsPage, allocationsTotalPages]);


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
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95dvh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {user.userName}
            </h2>
            <p className="text-xs text-gray-500">
              {user.employeeId} · {user.department || "No department"}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {onEdit && (
              <button
                onClick={onEdit}
                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 transition-all flex items-center gap-1.5 focus:ring-2 focus:ring-blue-500/20 outline-none shadow-sm">
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-200 transition-all text-gray-500 focus:outline-none">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 modal-safe-bottom">
          {/* User Info Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="ui-caps-label">Employee ID</p>
              <p className="mt-1 text-sm font-mono font-semibold text-gray-900">
                {user.employeeId}
              </p>
            </div>
            <div>
              <p className="ui-caps-label">Full Name</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {user.userName}
              </p>
            </div>
            <div>
              <p className="ui-caps-label">Department</p>
              <p className="mt-1 text-sm text-gray-700">
                {user.department || "—"}
              </p>
            </div>
            <div>
              <p className="ui-caps-label">Role</p>
              <p className="mt-1">
                <span
                  className={getPillBadgeClass(
                    getRoleBadgeClass(user.role),
                    "sm",
                  )}>
                  {user.role || "Viewer"}
                </span>
              </p>
            </div>
            <div className="col-span-2 sm:col-span-4">
              <p className="ui-caps-label">Email</p>
              <p className="mt-1 text-sm text-gray-700">{user.email || "—"}</p>
            </div>
            {isManager && (
              <div className="col-span-2 sm:col-span-4">
                <p className="ui-caps-label">Managed Categories</p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {(!user.managedCategories || user.managedCategories.length === 0 || user.managedCategories.includes("ALL")) ? (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium border border-gray-200">All Categories (Full Access)</span>
                  ) : (
                    user.managedCategories.map((cat) => (
                      <span key={cat} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium border border-blue-100">{cat}</span>
                    ))
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Allocated Assets Section */}
          <div className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                Allocated Assets
              </h3>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full font-medium">
                  {userAllocations.length} total
                </span>
                {activeCount > 0 && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                    {activeCount} active
                  </span>
                )}
                {returnedCount > 0 && (
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">
                    {returnedCount} returned
                  </span>
                )}
              </div>
            </div>

            {userAllocations.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No assets allocated to this user
              </div>
            ) : (
              <div className="rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Asset Code
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Asset Name
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Allocated
                        </th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider hidden sm:table-cell">
                          Condition
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider hidden sm:table-cell">
                          Returned
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {paginatedAllocations.map((a) => (
                        <tr
                          key={a.id}
                          className={`hover:bg-gray-50/50 transition-all ${onViewAsset ? "cursor-pointer" : ""}`}
                          onClick={async () => {
                            if (!onViewAsset) return;
                            try {
                              const asset = await dataService.getAsset(
                                a.assetId,
                              );
                              if (asset) {
                                onClose();
                                onViewAsset(asset);
                              }
                            } catch {
                              toast.error("Could not load asset details");
                            }
                          }}
                          title={
                            onViewAsset
                              ? "Click to view asset details"
                              : undefined
                          }>
                          <td className="px-3 py-2 font-mono text-xs text-gray-700 font-medium">
                            {a.assetCode}
                          </td>
                          <td
                            className="px-3 py-2 text-sm text-gray-900 max-w-50 truncate"
                            title={a.assetName}>
                            {a.assetName}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">
                            {formatDisplayDate(a.allocationDate)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${a.status === "Active"
                                ? "bg-green-100 text-green-700"
                                : "bg-orange-100 text-orange-700"
                                }`}>
                              {a.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600 hidden sm:table-cell">
                            {a.status === "Active"
                              ? a.conditionAtAllocation || "—"
                              : a.conditionAtReturn ||
                              a.conditionAtAllocation ||
                              "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600 hidden sm:table-cell">
                            {formatDisplayDate(a.returnDate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  currentPage={safeAllocationsPage}
                  totalPages={allocationsTotalPages}
                  totalItems={allocationsTotalRecords}
                  itemsPerPage={allocationsPageSize}
                  onPageChange={setAllocationsPage}
                  onPageSizeChange={setAllocationsPageSize}
                  compact
                />
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// =============================================
// CATEGORY MANAGER MODAL
// =============================================

function CategoryManagerModal({
  user,
  categories,
  onSave,
  onClose,
}: {
  user: User;
  categories: Category[];
  onSave: (
    employeeId: string,
    managedCategories: string[],
    receiveNotifications: boolean,
    notificationEmail: string
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [selectedCats, setSelectedCats] = useState<string[]>(user.managedCategories || ["ALL"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [receiveNotifications, setReceiveNotifications] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState(user.email || "");
  const [loadingConfig, setLoadingConfig] = useState(true);

  useEffect(() => {
    const loadNotificationConfig = async () => {
      try {
        setLoadingConfig(true);
        const config = await dataService.getNotificationLogs();
        const email = user.email || "";
        if (email) {
          const parsedEmails = (config.managerEmails || "")
            .split(",")
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean);
          setReceiveNotifications(parsedEmails.includes(email.toLowerCase()));
        }
      } catch (err) {
        console.error("Failed to load notification settings", err);
      } finally {
        setLoadingConfig(false);
      }
    };
    loadNotificationConfig();
  }, [user.email]);

  const handleSave = async () => {
    if (receiveNotifications && !notificationEmail.trim()) {
      setError("Please enter a valid email address to receive notifications.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const finalCategories = selectedCats.length === 0 ? ["ALL"] : selectedCats;
      await onSave(
        user.employeeId,
        finalCategories,
        receiveNotifications,
        notificationEmail.trim()
      );
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Failed to update categories");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[95dvh] sm:max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            Manage Categories
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 modal-safe-bottom">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              Category Access for {user.userName}
            </h3>
            <p className="text-xs text-gray-500">
              Select the asset categories this manager is allowed to manage. Uncheck all to restrict entirely. If "All Categories" is unchecked and no categories are selected, it will automatically grant "All Categories" (Full Access).
            </p>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
            <label className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-gray-200">
              <input
                type="checkbox"
                checked={selectedCats.includes("ALL")}
                onChange={(e) => {
                  if (e.target.checked) setSelectedCats(["ALL"]);
                  else setSelectedCats([]);
                }}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-sm font-medium text-gray-900">All Categories (Full Access)</span>
            </label>
            
            <div className="pl-6 space-y-1">
              {categories.map(cat => {
                const isAll = selectedCats.includes("ALL");
                const isChecked = isAll || selectedCats.includes(cat.id);
                return (
                  <label key={cat.id} className={`flex items-center gap-2 p-1.5 rounded-lg transition-colors ${isAll ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isAll}
                      onChange={(e) => {
                        if (isAll) return;
                        const newCats = e.target.checked 
                          ? [...selectedCats, cat.id]
                          : selectedCats.filter(c => c !== cat.id);
                        
                        if (newCats.length === 0) setSelectedCats(["ALL"]);
                        else setSelectedCats(newCats);
                      }}
                      className={`w-4 h-4 rounded border-gray-300 focus:ring-blue-500 ${isAll ? 'cursor-not-allowed' : 'cursor-pointer text-blue-600'}`}
                    />
                    <span className="text-sm text-gray-700">{cat.name || cat.id}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-1.5">
              <Bell className="w-4 h-4 text-blue-600" />
              Notification Settings
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Configure if this manager should receive email alerts for maintenance tasks, anomaly alerts, and expiring licenses.
            </p>
            
            {loadingConfig ? (
              <div className="flex items-center gap-2 py-2 text-xs text-gray-400">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Loading notification preferences...</span>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-gray-200">
                  <input
                    type="checkbox"
                    checked={receiveNotifications}
                    onChange={(e) => {
                      setReceiveNotifications(e.target.checked);
                      if (e.target.checked && !notificationEmail) {
                        setNotificationEmail(user.email || "");
                      }
                    }}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-sm font-medium text-gray-900">Receive Email Notifications</span>
                </label>

                {receiveNotifications && (
                  <div className="pl-6 space-y-1">
                    <label className="block text-xs font-semibold text-gray-700">
                      Notification Email Contact
                    </label>
                    <input
                      type="email"
                      value={notificationEmail}
                      onChange={(e) => setNotificationEmail(e.target.value)}
                      placeholder="manager@example.com"
                      className="w-full max-w-md px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm transition-all"
                      required={receiveNotifications}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Categories"
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// =============================================
// USER FORM MODAL
// =============================================

interface UserFormData {
  employeeId: string;
  fullName: string;
  department: string;
  email: string;
  role: "Admin" | "Manager" | "Viewer";
  password: string;
}

function UserFormModal({
  user,
  existingUsers,
  onSave,
  onClose,
}: {
  user: User | null;
  existingUsers: User[];
  onSave: (data: UserFormData, isEdit: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const isEdit = !!user;
  const TEMP_PASSWORD = "Welcome@123";
  const [form, setForm] = useState<UserFormData>({
    employeeId: user?.employeeId || "",
    fullName: user?.userName || "",
    department: user?.department || "",
    email: user?.email || "",
    role: user?.role || "Viewer",
    password: isEdit ? "" : TEMP_PASSWORD,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showPassword, setShowPassword] = useState(false);

  const uniqueDepartments = useMemo(() => {
    const depts = new Set<string>();
    existingUsers.forEach(u => {
      if (u.department && u.department.trim() !== "") {
        depts.add(u.department.trim());
      }
    });
    return Array.from(depts).sort();
  }, [existingUsers]);

  const validateField = (field: string, value: string): string => {
    if (field === "employeeId") {
      if (!value.trim()) return "Employee ID is required";
      if (value.trim().length < 2) return "Must be at least 2 characters";
      if (/\s/.test(value.trim())) return "Must not contain spaces";
      if (
        !isEdit &&
        existingUsers.some(
          (u) => u.employeeId.toLowerCase() === value.trim().toLowerCase(),
        )
      ) {
        return "Employee ID already exists";
      }
    }
    if (field === "fullName") {
      if (!value.trim()) return "Full Name is required";
      if (value.trim().length < 2) return "Must be at least 2 characters";
    }
    if (field === "password") {
      if (!isEdit && !value) return "Password is required for new users";
      if (value && value.length < 8) return "Must be at least 8 characters";
    }
    if (field === "email") {
      const trimmedEmail = value.trim();
      if (!trimmedEmail) return "Email is required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail))
        return "Enter a valid email address";
      if (
        existingUsers.some(
          (u) =>
            u.email?.toLowerCase() === trimmedEmail.toLowerCase() &&
            (!isEdit || u.employeeId !== user?.employeeId)
        )
      ) {
        return "Email already exists in system";
      }
    }
    return "";
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    const idErr = validateField("employeeId", form.employeeId);
    if (idErr) errors.employeeId = idErr;
    const nameErr = validateField("fullName", form.fullName);
    if (nameErr) errors.fullName = nameErr;
    const pwErr = validateField("password", form.password);
    if (pwErr) errors.password = pwErr;
    const emailErr = validateField("email", form.email);
    if (emailErr) errors.email = emailErr;
    setFieldErrors(errors);
    setTouched({ employeeId: true, fullName: true, password: true, email: true });
    return Object.keys(errors).length === 0;
  };

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (touched[field]) {
      const err = validateField(field, value);
      if (err) {
        setFieldErrors((prev) => ({ ...prev, [field]: err }));
      } else {
        setFieldErrors((prev) => {
          const { [field]: _, ...rest } = prev;
          return rest;
        });
      }
    }
  };

  const handleBlur = (field: string, value: string) => {
    setTouched((p) => ({ ...p, [field]: true }));
    const err = validateField(field, value);
    if (err) {
      setFieldErrors((p) => ({ ...p, [field]: err }));
    } else {
      setFieldErrors((p) => {
        const { [field]: _, ...rest } = p;
        return rest;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      setSaving(true);
      setError("");
      await onSave(form, isEdit);
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Failed to save user");
    } finally {
      setSaving(false);
    }
  };

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
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[95dvh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? "Edit User" : "Add User"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 modal-safe-bottom">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Employee ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.employeeId}
              onChange={(e) => handleChange("employeeId", e.target.value)}
              onBlur={() => handleBlur("employeeId", form.employeeId)}
              disabled={isEdit}
              className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${isEdit
                ? "bg-gray-100 text-gray-500 cursor-not-allowed border-gray-300"
                : touched.employeeId && fieldErrors.employeeId
                  ? "border-red-400 bg-red-50/30"
                  : "border-gray-300"
                }`}
              placeholder="e.g., EMP001"
              autoFocus={!isEdit}
            />
            {touched.employeeId && fieldErrors.employeeId && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors.employeeId}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => handleChange("fullName", e.target.value)}
              onBlur={() => handleBlur("fullName", form.fullName)}
              className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${touched.fullName && fieldErrors.fullName
                ? "border-red-400 bg-red-50/30"
                : "border-gray-300"
                }`}
              placeholder="Full name"
              autoFocus={isEdit}
            />
            {touched.fullName && fieldErrors.fullName && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors.fullName}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Department
            </label>
            <SearchableSelect
              value={form.department}
              onChange={(val) => setForm({ ...form, department: val })}
              options={uniqueDepartments.map(dept => ({ value: dept, label: dept }))}
              placeholder="Select or type new department"
              creatable={true}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
              onBlur={() => handleBlur("email", form.email)}
              className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${touched.email && fieldErrors.email
                ? "border-red-400 bg-red-50/30"
                : "border-gray-300"
                }`}
              placeholder="user@example.com"
            />
            {touched.email && fieldErrors.email && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Role <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              value={form.role}
              onChange={(value) =>
                setForm({
                  ...form,
                  role: value as "Admin" | "Manager" | "Viewer",
                })
              }
              options={[
                { value: "Viewer", label: "Viewer" },
                { value: "Manager", label: "Manager" },
                { value: "Admin", label: "Admin" },
              ]}
              placeholder="Select role"
              required
            />
          </div>

          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Temporary Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => handleChange("password", e.target.value)}
                  onBlur={() => handleBlur("password", form.password)}
                  className={`w-full px-3 py-2.5 pr-10 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${touched.password && fieldErrors.password
                    ? "border-red-400 bg-red-50/30"
                    : "border-gray-300"
                    }`}
                  placeholder="Minimum 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {touched.password && fieldErrors.password && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
              )}
              <p className="mt-1.5 text-xs text-blue-600 flex items-start gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                This is a temporary password. The user will receive a welcome email with a link to set their own password.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-all">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2">
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {isEdit ? "Save Changes" : "Create User"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// =============================================
// PASSWORD RESET MODAL
// =============================================

function PasswordResetModal({
  user,
  onSave,
  onClose,
}: {
  user: User;
  onSave: (employeeId: string, password: string) => Promise<void>;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const EyeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
  const EyeOffIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    try {
      setSaving(true);
      setError("");
      await onSave(user.employeeId, password);
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Failed to reset password");
    } finally {
      setSaving(false);
    }
  };

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
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[95dvh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Reset Password
            </h2>
            <p className="text-xs text-gray-500">
              {user.userName} ({user.employeeId})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 modal-safe-bottom">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              New Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Minimum 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Confirm Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Repeat password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-all">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2">
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Key className="w-4 h-4" />
              )}
              Reset Password
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// =============================================
// ROLE BADGE
// =============================================

const getRoleBadgeClass = (role?: string) => {
  switch (role) {
    case "Admin":
      return "bg-red-100 text-red-700 border-red-200";
    case "Manager":
      return "bg-blue-100 text-blue-700 border-blue-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

// =============================================
// BULK ADD MODAL
// =============================================

const CSV_TEMPLATE = `EmployeeID,FullName,Department,Email,Role,Password
EMP001,Satbir Singh,IT,SATBIRSINGHUBHI@GMAIL.COM,Admin,Welcome@123
EMP002,Satbir Photo,Photography,PHOTO789008@GMAIL.COM,Manager,Welcome@456
`;

const REQUIRED_COLS = ["employeeId", "fullName", "email", "password"] as const;

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const header = lines[0].split(",").map((h) =>
    h.trim().replace(/^\uFEFF/, "") // strip BOM
      .toLowerCase()
      .replace(/\s+/g, "")
  );
  const colMap: Record<string, string> = {
    employeeid: "employeeId",
    fullname: "fullName",
    department: "department",
    email: "email",
    role: "role",
    password: "password",
  };
  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      const row: Record<string, string> = {};
      header.forEach((h, i) => {
        const key = colMap[h] || h;
        row[key] = cols[i] || "";
      });
      return row;
    });
}

type BulkRow = {
  employeeId: string;
  fullName: string;
  department: string;
  email: string;
  role: string;
  password: string;
  _error?: string;
};

function BulkAddModal({
  onClose,
  onDone,
  existingUsers,
}: {
  onClose: () => void;
  onDone: () => void;
  existingUsers: User[];
}) {
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build a set of existing IDs for O(1) lookup
  const existingIds = useMemo(
    () => new Set(existingUsers.map((u) => u.employeeId.toLowerCase())),
    [existingUsers],
  );

  // Build a set of existing emails for O(1) lookup
  const existingEmails = useMemo(
    () => new Set(existingUsers.map((u) => u.email?.toLowerCase()).filter(Boolean) as string[]),
    [existingUsers],
  );

  const downloadTemplate = () => {
    downloadCSV(CSV_TEMPLATE, "users_bulk_template.csv");
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCsv(text);

      // Track IDs seen within this CSV to catch intra-file duplicates
      const seenInFile = new Set<string>();
      // Track emails seen within this CSV
      const seenEmailsInFile = new Set<string>();

      const validated: BulkRow[] = parsed.map((r) => {
        const errors: string[] = [];
        const empIdNorm = (r.employeeId || "").trim().toLowerCase();

        // --- Required field checks ---
        if (!r.employeeId) {
          errors.push("Employee ID required");
        } else {
          // Duplicate: already in the database
          if (existingIds.has(empIdNorm))
            errors.push("Employee ID already exists in system");
          // Duplicate: appears earlier in this same CSV
          else if (seenInFile.has(empIdNorm))
            errors.push("Duplicate Employee ID in file");
        }
        seenInFile.add(empIdNorm);

        if (!r.fullName) errors.push("Full Name required");

        const emailNorm = (r.email || "").trim().toLowerCase();
        if (!r.email) {
          errors.push("Email required");
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
          errors.push("Invalid email format");
        } else {
          // Duplicate: already in the database
          if (existingEmails.has(emailNorm))
            errors.push("Email already exists in system");
          // Duplicate: appears earlier in this same CSV
          else if (seenEmailsInFile.has(emailNorm))
            errors.push("Duplicate Email in file");
        }
        if (emailNorm) seenEmailsInFile.add(emailNorm);

        if (!r.password) errors.push("Password required");
        else if (r.password.length < 8) errors.push("Password min 8 characters");

        return {
          employeeId: r.employeeId || "",
          fullName: r.fullName || "",
          department: r.department || "",
          email: r.email || "",
          role: ["Admin", "Manager", "Viewer"].includes(r.role) ? r.role : "Viewer",
          password: r.password || "",
          _error: errors.join("; ") || undefined,
        };
      });
      setRows(validated);
    };
    reader.readAsText(file);
  };

  const validRows = rows.filter((r) => !r._error);
  const errorRows = rows.filter((r) => !!r._error);

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const res = await dataService.bulkCreateUsers(validRows);
      setResult(res);
      onDone();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Bulk import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95dvh] sm:max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Bulk Add Users</h2>
            <p className="text-xs text-gray-500 mt-0.5">Upload a CSV file to create multiple users at once</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">

          {/* Step 1: Template */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-900 mb-1">Step 1 — Download the template</p>
                <p className="text-xs text-blue-700 mb-3">
                  Fill in the CSV with user details. Required columns: <code className="bg-blue-100 px-1 rounded">EmployeeID</code>,{" "}
                  <code className="bg-blue-100 px-1 rounded">FullName</code>,{" "}
                  <code className="bg-blue-100 px-1 rounded">Email</code>,{" "}
                  <code className="bg-blue-100 px-1 rounded">Password</code>.
                  Role defaults to <em>Viewer</em> if blank.
                </p>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 transition-all">
                  <Download className="w-4 h-4" />
                  Download users_bulk_template.csv
                </button>
              </div>
            </div>
          </div>

          {/* Step 2: Upload */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Step 2 — Upload your CSV</p>
            <label
              htmlFor="bulk-csv-upload"
              className={`flex flex-col items-center justify-center w-full border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all ${fileName ? "border-blue-400 bg-blue-50/40" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/20"
                }`}>
              <Upload className={`w-8 h-8 mb-2 ${fileName ? "text-blue-500" : "text-gray-400"}`} />
              <p className="text-sm font-medium text-gray-700">
                {fileName || "Click to upload CSV file"}
              </p>
              <p className="text-xs text-gray-400 mt-1">Max 1000 users per import</p>
              <input
                id="bulk-csv-upload"
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFile}
              />
            </label>
          </div>

          {/* Preview table */}
          {rows.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-700">
                  Preview — {rows.length} row{rows.length !== 1 ? "s" : ""}
                  {errorRows.length > 0 && (
                    <span className="ml-2 text-red-600 font-normal">({errorRows.length} invalid)</span>
                  )}
                </p>
                <span className="text-xs text-green-700 font-medium">{validRows.length} ready to import</span>
              </div>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto max-h-56">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {["Employee ID", "Full Name", "Email", "Department", "Role", "Status"].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((r, i) => (
                        <tr key={i} className={r._error ? "bg-red-50" : "hover:bg-gray-50"}>
                          <td className="px-3 py-2 font-mono text-gray-800">{r.employeeId || "—"}</td>
                          <td className="px-3 py-2 text-gray-800">{r.fullName || "—"}</td>
                          <td className="px-3 py-2 text-gray-600">{r.email || "—"}</td>
                          <td className="px-3 py-2 text-gray-500">{r.department || "—"}</td>
                          <td className="px-3 py-2 text-gray-600">{r.role}</td>
                          <td className="px-3 py-2">
                            {r._error ? (
                              <span className="flex items-center gap-1 text-red-600" title={r._error}>
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate max-w-28">{r._error}</span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-green-600">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Import result */}
          {result && (
            <div className={`rounded-lg p-4 border ${result.skipped > 0 ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200"
              }`}>
              <p className="text-sm font-semibold text-gray-800 mb-1">
                Import complete: <span className="text-green-700">{result.created} created</span>
                {result.skipped > 0 && (
                  <span className="text-yellow-700">, {result.skipped} skipped</span>
                )}
              </p>
              {result.errors.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {result.errors.map((e, i) => (
                    <li key={i} className="text-xs text-gray-600">• {e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-gray-200 bg-gray-50 shrink-0">
          <p className="text-xs text-gray-500">
            Welcome emails are sent to each user with their login credentials.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-all">
              {result ? "Close" : "Cancel"}
            </button>
            {!result && (
              <button
                onClick={handleImport}
                disabled={validRows.length === 0 || importing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all">
                {importing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Import {validRows.length > 0 ? `${validRows.length} Users` : "Users"}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// =============================================
// USER ACTION MENU
// =============================================

function UserActionMenu({
  user,
  isSelf,
  onView,
  onEdit,
  onPassword,
  onManageCategories,
  onDelete,
  onToggleBlock,
}: {
  user: User;
  isSelf: boolean;
  onView: (u: User) => void;
  onEdit: (u: User) => void;
  onPassword: (u: User) => void;
  onManageCategories: (u: User) => void;
  onDelete: (u: User) => void;
  onToggleBlock: (u: User) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = () => setIsOpen(false);
    const timer = setTimeout(
      () => document.addEventListener("click", handleClick),
      0,
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClick);
    };
  }, [isOpen]);

  const handleTrigger = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const r = window.innerWidth - rect.right;
      const menuW = 208;
      const safeR = Math.max(8, Math.min(r, window.innerWidth - menuW - 8));
      setMenuPos(
        spaceBelow < 240
          ? { bottom: window.innerHeight - rect.top + 5, right: safeR }
          : { top: rect.bottom + 5, right: safeR },
      );
    }
    setIsOpen(true);
  };

  return (
    <div className="relative flex items-center justify-center">
      <button
        ref={triggerRef}
        onClick={handleTrigger}
        className="p-2 hover:bg-gray-100 rounded-xl transition-all no-push group"
        title="Actions">
        <MoreVertical className="w-5 h-5 text-gray-500 group-hover:text-gray-700" />
      </button>
      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed w-52 bg-white rounded-2xl shadow-xl overflow-hidden z-50"
              style={{
                top: menuPos?.top,
                bottom: menuPos?.bottom,
                right: menuPos?.right,
                boxShadow:
                  "0 10px 40px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)",
              }}
              onClick={(e) => e.stopPropagation()}>
              <div className="py-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onView(user);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-all no-push">
                  <Eye className="w-4 h-4" />
                  View Details
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPassword(user);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-amber-50 hover:text-amber-700 transition-all no-push">
                  <Key className="w-4 h-4" />
                  Reset Password
                </button>
                {user.role === "Manager" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onManageCategories(user);
                      setIsOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-all no-push">
                    <ShieldCheck className="w-4 h-4" />
                    Manage Categories
                  </button>
                )}
                {!isSelf && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleBlock(user);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all no-push ${user.isBlocked
                      ? "text-green-700 hover:bg-green-50"
                      : "text-red-700 hover:bg-red-50"
                      }`}>
                    {user.isBlocked ? (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        Restore Access
                      </>
                    ) : (
                      <>
                        <ShieldOff className="w-4 h-4" />
                        Revoke Access
                      </>
                    )}
                  </button>
                )}
                {!isSelf && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(user);
                      setIsOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-700 transition-all no-push">
                    <Trash2 className="w-4 h-4" />
                    Delete User
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================
// MAIN COMPONENT
// =============================================

export function UsersManagement({
  onViewAsset,
}: { onViewAsset?: (asset: Asset) => void } = {}) {
  const [users, setUsers] = useState<User[]>([]);
  const [allocations, setAllocations] = useState<LicenseAllocation[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [activeDropdown, setActiveDropdown] = useState<"role" | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const debouncedSearch = useDebounce(searchQuery, 300);
  const isMobile = useIsMobile();
  const roleDropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const roleDropdownMenuRef = useRef<HTMLDivElement>(null);

  // Read logged-in user's employeeId so we can block self-deletion in the UI
  const selfEmployeeId = useMemo(() => {
    try {
      const raw =
        sessionStorage.getItem("inventoryAuth") ||
        localStorage.getItem("inventoryAuth");
      if (raw) return JSON.parse(raw)?.employeeId?.toLowerCase() ?? "";
    } catch { }
    return "";
  }, []);

  const { openUpward: openRoleUpward, maxHeight: roleDropdownMaxHeight } =
    useSmartDropdownPosition({
      isOpen: activeDropdown === "role",
      anchorRef: roleDropdownTriggerRef,
      menuRef: roleDropdownMenuRef,
      preferredMaxHeight: 240,
    });

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else {
        setSortKey(null);
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col)
      return (
        <ArrowUpDown className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-all no-push" />
      );
    return sortDir === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-blue-600" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
    );
  };

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [categoryUser, setCategoryUser] = useState<User | null>(null);
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [showBulkAdd, setShowBulkAdd] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const [usersData, allocsData, catsData] = await Promise.all([
        dataService.getUsers(),
        dataService.getLicenseAllocations(),
        dataService.getCategories()
      ]);
      const safeUsers = Array.isArray(usersData) ? usersData : [];
      setUsers(safeUsers);
      setAllocations(Array.isArray(allocsData) ? allocsData : []);
      setCategories(Array.isArray(catsData) ? catsData : []);
      window.dispatchEvent(
        new CustomEvent("USERS_UPDATED", { detail: safeUsers }),
      );
    } catch (err: unknown) {
      toast.error("Failed to load users: " + getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filtered = useMemo(() => {
    const list = (users || []).filter((u) => {
      // Role filter
      if (selectedRole !== "all" && u.role !== selectedRole) return false;
      // Search filter
      if (!debouncedSearch) return true;
      const q = debouncedSearch.toLowerCase();
      return (
        u.employeeId?.toLowerCase().includes(q) ||
        u.userName?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q)
      );
    });

    // Apply sorting
    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      list.sort((a, b) => {
        let aVal: string | number = "";
        let bVal: string | number = "";
        switch (sortKey) {
          case "employeeId":
            aVal = a.employeeId || "";
            bVal = b.employeeId || "";
            break;
          case "userName":
            aVal = (a.userName || "").toLowerCase();
            bVal = (b.userName || "").toLowerCase();
            break;
          case "department":
            aVal = (a.department || "").toLowerCase();
            bVal = (b.department || "").toLowerCase();
            break;
          case "role":
            aVal = (a.role || "Viewer").toLowerCase();
            bVal = (b.role || "Viewer").toLowerCase();
            break;
          case "createdAt":
            aVal = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            bVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            break;
        }
        if (aVal < bVal) return -1 * dir;
        if (aVal > bVal) return 1 * dir;
        return 0;
      });
    }
    return list;
  }, [users, selectedRole, debouncedSearch, sortKey, sortDir]);

  const totalRecords = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  const paginatedUsers = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filtered.slice(startIndex, startIndex + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedRole]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const roleOptions = [
    {
      value: "all",
      label: "All Roles",
      dot: "bg-gray-400",
      hl: "bg-gray-50 text-gray-700",
    },
    {
      value: "Admin",
      label: "Admin",
      dot: "bg-red-500",
      hl: "bg-red-50 text-red-700",
    },
    {
      value: "Manager",
      label: "Manager",
      dot: "bg-blue-500",
      hl: "bg-blue-50 text-blue-700",
    },
    {
      value: "Viewer",
      label: "Viewer",
      dot: "bg-gray-400",
      hl: "bg-gray-50 text-gray-700",
    },
  ];

  const handleSaveUser = async (data: UserFormData, isEdit: boolean) => {
    if (isEdit) {
      await dataService.updateUser(data.employeeId, {
        fullName: data.fullName,
        department: data.department,
        email: data.email || undefined,
        role: data.role,
      });
      toast.success("User updated successfully");
    } else {
      await dataService.createUser({
        employeeId: data.employeeId,
        fullName: data.fullName,
        department: data.department,
        email: data.email || undefined,
        password: data.password || undefined,
        role: data.role,
      });
      toast.success("User created successfully");
    }
    setShowForm(false);
    setEditingUser(null);
    fetchUsers();
  };
  const handleSaveCategories = async (
    employeeId: string,
    managedCategories: string[],
    receiveNotifications: boolean,
    notificationEmail: string
  ) => {
    const userToUpdate = users.find(u => u.employeeId === employeeId);
    if (!userToUpdate) return;
    
    const finalEmail = (notificationEmail || userToUpdate.email || "").trim();

    // 1. Update the user profile
    await dataService.updateUser(employeeId, {
      fullName: userToUpdate.userName,
      department: userToUpdate.department,
      email: finalEmail || undefined,
      role: userToUpdate.role,
      managedCategories: managedCategories
    });

    // 2. Sync with global notification email list
    try {
      const config = await dataService.getNotificationLogs();
      const currentAdmins = config.adminEmails || "";
      const currentManagers = config.managerEmails || "";
      
      let parsedManagers = currentManagers
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      
      const targetEmail = finalEmail.toLowerCase();
      const oldEmail = (userToUpdate.email || "").trim().toLowerCase();

      // Clean up old email if changed
      if (oldEmail && oldEmail !== targetEmail) {
        parsedManagers = parsedManagers.filter((e) => e !== oldEmail);
      }

      if (receiveNotifications && targetEmail) {
        if (!parsedManagers.includes(targetEmail)) {
          parsedManagers.push(targetEmail);
        }
      } else if (targetEmail) {
        parsedManagers = parsedManagers.filter((e) => e !== targetEmail);
      }

      // Also ensure we remove any admin emails matching old/new just to avoid conflicts
      let parsedAdmins = currentAdmins
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      
      if (oldEmail && oldEmail !== targetEmail) {
        parsedAdmins = parsedAdmins.filter((e) => e !== oldEmail);
      }

      await dataService.updateAdminEmails(
        parsedAdmins.join(", "),
        parsedManagers.join(", ")
      );
    } catch (notificationErr) {
      console.error("Failed to update notification settings", notificationErr);
      toast.warning("Categories updated, but failed to sync email notification list.");
    }
    
    toast.success("Categories updated successfully");
    setCategoryUser(null);
    fetchUsers();
  };

  const handleResetPassword = async (employeeId: string, password: string) => {
    await dataService.setUserPassword(employeeId, password);
    toast.success("Password reset successfully");
    setPasswordUser(null);
  };

  const handleDeleteUser = async () => {
    if (!deleteUser) return;
    try {
      await dataService.deleteUser(deleteUser.employeeId);
      toast.success("User deleted successfully");
      setDeleteUser(null);
      fetchUsers();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to delete user");
    }
  };

  const handleToggleBlock = async (u: User) => {
    try {
      const { isBlocked } = await dataService.toggleUserBlock(u.employeeId);
      toast.success(
        `Access ${isBlocked ? "revoked" : "restored"} for ${u.userName}`,
      );
      fetchUsers();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to update access status");
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Users
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Manage user accounts, roles & passwords
            {users.length > 0 && (
              <span className="ml-1 text-gray-400">({users.length} total)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowBulkAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all">
            <Upload className="w-4 h-4" />
            Bulk Add
          </button>
          <button
            onClick={() => {
              setEditingUser(null);
              setShowForm(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all shadow-sm">
            <UserPlus className="w-4 h-4" />
            Add User
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
        <div className="flex flex-row items-stretch gap-3 h-10">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users..."
              className="w-full h-full pl-9 pr-10 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Role Dropdown */}
          <div className="relative w-auto">
            <button
              ref={roleDropdownTriggerRef}
              onClick={() =>
                setActiveDropdown(activeDropdown === "role" ? null : "role")
              }
              className={`flex h-full items-center justify-center gap-2 px-2.5 sm:px-4 border rounded-lg transition-all text-sm font-semibold shadow-sm bg-white hover:border-gray-400 group whitespace-nowrap ${activeDropdown === "role"
                ? "ring-[0.5px] ring-blue-500 border-blue-500"
                : selectedRole !== "all"
                  ? "bg-blue-50 text-blue-700 border-blue-300"
                  : "border-gray-300"
                }`}>
              <Filter className="w-4 h-4 text-gray-500 sm:hidden" />
              <span className="hidden sm:inline">
                {roleOptions.find((opt) => opt.value === selectedRole)?.label}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-transform duration-200 hidden sm:block ${activeDropdown === "role" ? "rotate-180" : ""}`}
              />
            </button>
            <AnimatePresence>
              {activeDropdown === "role" && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setActiveDropdown(null)}
                  />
                  <motion.div
                    ref={roleDropdownMenuRef}
                    initial={{ opacity: 0, scale: 0.98, y: 2 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: 2 }}
                    className={`absolute right-0 z-50 w-48 bg-white rounded-xl shadow-xl overflow-hidden py-1 overflow-y-auto ${openRoleUpward ? "bottom-full mb-1" : "top-full mt-1"
                      }`}
                    style={{ maxHeight: `${roleDropdownMaxHeight}px` }}>
                    {roleOptions.map((opt) => {
                      const isSelected = selectedRole === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setSelectedRole(opt.value);
                            setActiveDropdown(null);
                          }}
                          className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium transition-all duration-150 ${isSelected ? opt.hl : "text-gray-700 hover:bg-gray-50"}`}>
                          <div className={`w-2 h-2 rounded-full ${opt.dot}`} />
                          <span>{opt.label}</span>
                          {isSelected && (
                            <div className="ml-auto bg-blue-600 rounded-full p-0.5">
                              <Check className="w-2.5 h-2.5 text-white" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Loading State */}
        {loading ? (
          <div className="animate-pulse">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex gap-4">
              {["w-20", "w-32", "w-24", "w-16", "w-24", "w-12"].map((w, i) => (
                <div key={i} className={`h-3 bg-gray-200 rounded ${w}`} />
              ))}
            </div>
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="px-4 py-3.5 border-b border-gray-50 flex items-center gap-4">
                <div className="h-3 w-16 bg-gray-100 rounded" />
                <div className="h-3 w-28 bg-gray-100 rounded" />
                <div className="h-3 w-20 bg-gray-100 rounded" />
                <div className="h-5 w-14 bg-gray-100 rounded-full" />
                <div className="h-3 w-20 bg-gray-100 rounded" />
                <div className="h-6 w-6 bg-gray-100 rounded-lg" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <UsersIcon className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">
                {searchQuery || selectedRole !== "all"
                  ? "No users found"
                  : "No users yet"}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            {!isMobile && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {[
                        { key: "employeeId", label: "Employee ID" },
                        { key: "userName", label: "Full Name" },
                        { key: "department", label: "Department" },
                        { key: "role", label: "Role" },
                        { key: "createdAt", label: "Created" },
                      ].map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none group transition-all hover:bg-gray-100 ${sortKey === col.key
                            ? "text-blue-700 bg-blue-50/50"
                            : "text-gray-600"
                            }`}>
                          <span className="inline-flex items-center gap-1.5">
                            {col.label}
                            <SortIcon col={col.key} />
                          </span>
                        </th>
                      ))}
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-20">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedUsers.map((u) => (
                      <tr
                        key={u.employeeId}
                        className="hover:bg-gray-50/50 transition-all cursor-pointer"
                        onClick={() => setViewingUser(u)}>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 font-medium">
                          {u.employeeId}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {u.userName}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {u.department || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className={getPillBadgeClass(
                                getRoleBadgeClass(u.role),
                                "sm",
                              )}>
                              {u.role || "Viewer"}
                            </span>
                            {u.isBlocked && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold uppercase rounded-full border border-red-200">
                                Blocked
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {formatDisplayDate(u.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <UserActionMenu
                            user={u}
                            isSelf={u.employeeId.toLowerCase() === selfEmployeeId}
                            onView={(u) => setViewingUser(u)}
                            onEdit={(u) => {
                              setEditingUser(u);
                              setShowForm(true);
                            }}
                            onPassword={(u) => setPasswordUser(u)}
                            onManageCategories={(u) => setCategoryUser(u)}
                            onDelete={(u) => setDeleteUser(u)}
                            onToggleBlock={handleToggleBlock}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Mobile Card View */}
            {isMobile && (
              <div className="divide-y divide-gray-100">
                {paginatedUsers.map((u) => (
                  <div
                    key={u.employeeId}
                    className="p-4 hover:bg-gray-50 transition-all cursor-pointer"
                    onClick={() => setViewingUser(u)}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {u.userName}
                        </h3>
                        <p className="text-sm text-gray-500 font-mono mt-0.5">
                          {u.employeeId}
                        </p>
                      </div>
                      <div
                        className="ml-2 shrink-0"
                        onClick={(e) => e.stopPropagation()}>
                        <UserActionMenu
                          user={u}
                          isSelf={u.employeeId.toLowerCase() === selfEmployeeId}
                          onView={(u) => setViewingUser(u)}
                          onEdit={(u) => {
                            setEditingUser(u);
                            setShowForm(true);
                          }}
                          onPassword={(u) => setPasswordUser(u)}
                          onManageCategories={(u) => setCategoryUser(u)}
                          onDelete={(u) => setDeleteUser(u)}
                          onToggleBlock={handleToggleBlock}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={getPillBadgeClass(
                          getRoleBadgeClass(u.role),
                          "sm",
                        )}>
                        {u.role || "Viewer"}
                      </span>
                      {u.isBlocked && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold uppercase rounded-full border border-red-200">
                          Blocked
                        </span>
                      )}
                      {u.department && (
                        <>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-500">
                            {u.department}
                          </span>
                        </>
                      )}
                      {u.createdAt && (
                        <>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-500">
                            {formatDisplayDate(u.createdAt)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        {!loading && filtered.length > 0 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalRecords}
            itemsPerPage={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {viewingUser && (
          <UserDetailModal
            user={viewingUser}
            allocations={allocations}
            onClose={() => setViewingUser(null)}
            onEdit={() => {
              setEditingUser(viewingUser);
              setViewingUser(null);
              setShowForm(true);
            }}
            onViewAsset={onViewAsset}
          />
        )}
      </AnimatePresence>

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <UserFormModal
            user={editingUser}
            existingUsers={users}
            onSave={handleSaveUser}
            onClose={() => {
              setShowForm(false);
              setEditingUser(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {categoryUser && (
          <CategoryManagerModal
            user={categoryUser}
            categories={categories}
            onSave={handleSaveCategories}
            onClose={() => setCategoryUser(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {passwordUser && (
          <PasswordResetModal
            user={passwordUser}
            onSave={handleResetPassword}
            onClose={() => setPasswordUser(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteUser && (
          <DeleteConfirmModal
            title="Delete User"
            message={`Are you sure you want to delete "${deleteUser.userName}" (${deleteUser.employeeId})? This action cannot be undone.`}
            onConfirm={handleDeleteUser}
            onClose={() => setDeleteUser(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBulkAdd && (
          <BulkAddModal
            existingUsers={users}
            onClose={() => setShowBulkAdd(false)}
            onDone={() => {
              setShowBulkAdd(false);
              fetchUsers();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}