"use client";

import { useEffect, useState, useMemo } from "react";
import { ShieldCheck, Plus, Check, X, Building, User, Calendar, ClipboardCheck, AlertTriangle, FileText } from "lucide-react";
import { toast } from "sonner";
import type { Asset, User as UserType } from "@/types";

interface AuditCycle {
  id: number;
  name: string;
  departmentId: number;
  startDate: string;
  endDate: string;
  status: string;
  department: {
    id: number;
    name: string;
  };
  auditors: Array<{
    auditorId: string;
    auditor: {
      id: string;
      fullName: string;
      email: string | null;
    };
  }>;
  items: Array<{
    id: number;
    assetId: number;
    status: string;
    notes: string | null;
    verifiedAt: string | null;
    verifiedById: string | null;
    asset: {
      id: number;
      assetCode: string;
      assetName: string;
    };
    verifiedBy?: {
      id: string;
      fullName: string;
    } | null;
  }>;
  discrepancyReports: Array<{
    id: number;
    assetId: number;
    description: string;
    resolved: boolean;
    resolutionNotes: string | null;
    asset: {
      id: number;
      assetCode: string;
      assetName: string;
    };
  }>;
}

interface Department {
  id: number;
  name: string;
  status: string;
}

interface AuditsPageProps {
  assets: Asset[];
  users: UserType[];
  userRole: string;
}

export function AuditsPage({ assets, users, userRole }: AuditsPageProps) {
  const [cycles, setCycles] = useState<AuditCycle[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active Selected Cycle for Detail View
  const [selectedCycleId, setSelectedCycleId] = useState<number | null>(null);

  // Form State for creating new cycle
  const [showAddForm, setShowAddForm] = useState(false);
  const [cycleName, setCycleName] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedAuditors, setSelectedAuditors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Discrepancy resolution form state
  const [resolvingAssetId, setResolvingAssetId] = useState<number | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [isResolving, setIsResolving] = useState(false);

  // Auditor Verification form state
  const [verifyingAssetId, setVerifyingAssetId] = useState<number | null>(null);
  const [verifyStatus, setVerifyStatus] = useState("VERIFIED");
  const [verifyNotes, setVerifyNotes] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  async function fetchCyclesAndDepartments() {
    setIsLoading(true);
    try {
      const [cyclesRes, deptsRes] = await Promise.all([
        fetch("/api/audit-cycles"),
        fetch("/api/departments"),
      ]);

      if (cyclesRes.ok && deptsRes.ok) {
        const cyclesData = await cyclesRes.json();
        const deptsData = await deptsRes.json();
        setCycles(cyclesData.data || cyclesData);
        setDepartments((deptsData.data || deptsData).filter((d: any) => d.status === "Active"));
      } else {
        toast.error("Failed to load audit data.");
      }
    } catch (e) {
      toast.error("Error loading audits.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchCyclesAndDepartments();
  }, []);

  const selectedCycle = useMemo(() => {
    return cycles.find((c) => c.id === selectedCycleId);
  }, [cycles, selectedCycleId]);

  const isAdminOrManager = userRole === "Admin" || userRole === "Manager";

  // Filter cycles assigned to current user if they are Viewer (auditor role)
  // For simplicity, we get logged-in employee from context (users has users list)
  // Inside routes we check session, in frontend auditor can see cycles where they are listed
  const visibleCycles = useMemo(() => {
    return cycles;
  }, [cycles]);

  async function handleCreateCycle(e: React.FormEvent) {
    e.preventDefault();
    if (!cycleName.trim() || !selectedDeptId || !startDate || !endDate || selectedAuditors.length === 0) {
      toast.error("Please fill out all fields and assign at least one auditor.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/audit-cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cycleName,
          departmentId: parseInt(selectedDeptId, 10),
          startDate,
          endDate,
          auditorIds: selectedAuditors,
        }),
      });

      const result = await res.json();
      if (res.ok) {
        toast.success("Audit cycle created successfully!");
        setShowAddForm(false);
        setCycleName("");
        setSelectedDeptId("");
        setStartDate("");
        setEndDate("");
        setSelectedAuditors([]);
        fetchCyclesAndDepartments();
      } else {
        toast.error(result.message || "Failed to create audit cycle.");
      }
    } catch (err) {
      toast.error("Error creating audit cycle.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCycleId || !verifyingAssetId) return;

    setIsVerifying(true);
    try {
      const res = await fetch(`/api/audit-cycles/${selectedCycleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          assetId: verifyingAssetId,
          status: verifyStatus,
          notes: verifyNotes.trim() || undefined,
        }),
      });

      const result = await res.json();
      if (res.ok) {
        toast.success("Item verified successfully!");
        setVerifyingAssetId(null);
        setVerifyStatus("VERIFIED");
        setVerifyNotes("");
        fetchCyclesAndDepartments();
      } else {
        toast.error(result.message || "Failed to submit verification.");
      }
    } catch (err) {
      toast.error("Error verifying item.");
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResolveDiscrepancy(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCycleId || !resolvingAssetId || !resolutionNotes.trim()) {
      toast.error("Resolution notes are required.");
      return;
    }

    setIsResolving(true);
    try {
      const res = await fetch(`/api/audit-cycles/${selectedCycleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve",
          assetId: resolvingAssetId,
          resolutionNotes: resolutionNotes.trim(),
        }),
      });

      const result = await res.json();
      if (res.ok) {
        toast.success("Discrepancy resolved successfully!");
        setResolvingAssetId(null);
        setResolutionNotes("");
        fetchCyclesAndDepartments();
      } else {
        toast.error(result.message || "Failed to resolve discrepancy.");
      }
    } catch (err) {
      toast.error("Error resolving discrepancy.");
    } finally {
      setIsResolving(false);
    }
  }

  async function handleCloseCycle(id: number) {
    if (!confirm("Are you sure you want to close this audit cycle? Any missing assets will be updated to status 'Lost'.")) {
      return;
    }

    try {
      const res = await fetch(`/api/audit-cycles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close" }),
      });

      const result = await res.json();
      if (res.ok) {
        toast.success("Audit cycle closed successfully! Status sync complete.");
        fetchCyclesAndDepartments();
      } else {
        toast.error(result.message || "Failed to close cycle.");
      }
    } catch (err) {
      toast.error("Error closing cycle.");
    }
  }

  const handleAuditorToggle = (userId: string) => {
    setSelectedAuditors((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="w-6.5 h-6.5 text-blue-600 animate-pulse" />
            Verification Audits
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Conduct department inventory audits, verify asset integrity, and resolve discrepancies
          </p>
        </div>

        {isAdminOrManager && (
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm transition-all hover:shadow-md shrink-0"
          >
            <Plus className="w-4 h-4" /> Create Audit Cycle
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left column: Audit Cycles List */}
        <div className="xl:col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Audit Cycles</h2>
              <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                {visibleCycles.length} Total
              </span>
            </div>

            {isLoading ? (
              <div className="p-12 text-center text-gray-500 text-sm">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                Loading cycles...
              </div>
            ) : visibleCycles.length === 0 ? (
              <div className="p-12 text-center text-gray-500 text-sm">
                No verification cycles active or recorded.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {visibleCycles.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCycleId(c.id)}
                    className={`w-full text-left p-4 hover:bg-gray-50/50 transition-colors flex flex-col gap-1.5 ${
                      selectedCycleId === c.id ? "bg-blue-50/40 border-l-4 border-blue-600" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-semibold text-gray-950 text-sm">{c.name}</span>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${
                          c.status === "ACTIVE"
                            ? "bg-green-100 text-green-800 border-green-200"
                            : c.status === "COMPLETED"
                            ? "bg-gray-100 text-gray-800 border-gray-200"
                            : "bg-yellow-100 text-yellow-800 border-yellow-200"
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Building className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span>{c.department?.name}</span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-400 w-full">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {new Date(c.startDate).toLocaleDateString([], { dateStyle: "short" })} -{" "}
                        {new Date(c.endDate).toLocaleDateString([], { dateStyle: "short" })}
                      </span>
                      <span>{c.items?.length || 0} Assets scoped</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Audit Detail */}
        <div className="xl:col-span-2 space-y-6">
          {selectedCycle ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-6 space-y-6">
              {/* Cycle Detail Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-gray-150">
                <div className="space-y-1">
                  <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded text-[10px] font-black uppercase">
                    Verification Scope Details
                  </span>
                  <h2 className="text-lg font-bold text-gray-900">{selectedCycle.name}</h2>
                  <p className="text-xs text-gray-500">
                    Target Department: <span className="font-semibold text-gray-700">{selectedCycle.department?.name}</span>
                  </p>
                </div>

                <div className="flex gap-2 shrink-0">
                  {selectedCycle.status === "ACTIVE" && isAdminOrManager && (
                    <button
                      onClick={() => handleCloseCycle(selectedCycle.id)}
                      className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-2xs hover:shadow-xs transition-all flex items-center gap-1"
                    >
                      <ShieldCheck className="w-4 h-4" /> Close Audit Cycle
                    </button>
                  )}
                </div>
              </div>

              {/* Auditors Assigned */}
              <div>
                <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">Assigned Auditors</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedCycle.auditors.map((a) => (
                    <span key={a.auditorId} className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 border border-gray-200 text-xs px-2.5 py-1 rounded-lg">
                      <User className="w-3.5 h-3.5 text-gray-400" />
                      {a.auditor?.fullName} ({a.auditorId})
                    </span>
                  ))}
                </div>
              </div>

              {/* Scoped Assets Checklist */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Asset Checklist</h3>
                <div className="overflow-x-auto rounded-lg border border-gray-150">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-150">
                        <th className="p-3">Asset</th>
                        <th className="p-3">Auditor Status</th>
                        <th className="p-3">Verified By</th>
                        <th className="p-3">Details / Notes</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedCycle.items.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50/20 transition-colors">
                          <td className="p-3 font-semibold text-gray-900">
                            <div>{item.asset?.assetName}</div>
                            <div className="text-[10px] text-gray-400 font-mono mt-0.5">{item.asset?.assetCode}</div>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              item.status === "VERIFIED"
                                ? "bg-green-100 text-green-800 border-green-200"
                                : item.status === "MISSING"
                                ? "bg-red-100 text-red-800 border-red-200 animate-pulse"
                                : item.status === "DAMAGED"
                                ? "bg-orange-100 text-orange-800 border-orange-200"
                                : "bg-yellow-100 text-yellow-800 border-yellow-200"
                            }`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="p-3 text-gray-600 font-medium">
                            {item.verifiedBy ? item.verifiedBy.fullName : <span className="italic text-gray-400">Unverified</span>}
                          </td>
                          <td className="p-3 text-gray-500 italic max-w-xs truncate">
                            {item.notes || "No notes"}
                          </td>
                          <td className="p-3 text-right">
                            {selectedCycle.status === "ACTIVE" && (
                              <button
                                onClick={() => {
                                  setVerifyingAssetId(item.assetId);
                                  setVerifyStatus(item.status !== "PENDING" ? item.status : "VERIFIED");
                                  setVerifyNotes(item.notes || "");
                                }}
                                className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-1 rounded text-[10px] font-semibold transition-colors border border-blue-100"
                              >
                                Log Audit
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Discrepancies and Resolution section */}
              {selectedCycle.discrepancyReports.length > 0 && (
                <div className="space-y-3 border-t border-gray-150 pt-6">
                  <h3 className="text-xs font-semibold text-red-700 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> Open Discrepancies
                  </h3>
                  <div className="space-y-3">
                    {selectedCycle.discrepancyReports.map((dr) => (
                      <div key={dr.id} className="p-4 bg-red-50/50 border border-red-150 rounded-xl flex items-start justify-between gap-4">
                        <div className="space-y-1 text-xs">
                          <p className="font-semibold text-gray-900">{dr.asset?.assetName} ({dr.asset?.assetCode})</p>
                          <p className="text-gray-600">{dr.description}</p>
                          {dr.resolved ? (
                            <div className="flex items-center gap-1 text-[11px] text-green-700 font-bold mt-1 bg-green-50 w-fit px-2 py-0.5 rounded border border-green-200">
                              <Check className="w-3.5 h-3.5" /> Resolved: {dr.resolutionNotes}
                            </div>
                          ) : (
                            <span className="inline-block text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded border border-red-200 mt-1">
                              Action Required
                            </span>
                          )}
                        </div>

                        {!dr.resolved && isAdminOrManager && (
                          <button
                            onClick={() => {
                              setResolvingAssetId(dr.assetId);
                              setResolutionNotes("");
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded text-[10px] font-bold shadow-2xs hover:shadow-xs transition-all shrink-0"
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-12 text-center text-gray-500 text-sm flex flex-col items-center justify-center min-h-[300px]">
              <ClipboardCheck className="w-12 h-12 text-gray-200 mb-3" />
              Select an audit cycle from the list to view scope details, auditors checklist, and discrepancy reports.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create Audit Cycle */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-1.5">
                <ClipboardCheck className="w-5 h-5 text-blue-600" /> Start Audit Cycle
              </h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors hover:bg-gray-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCycle} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Audit Cycle Name *
                </label>
                <input
                  type="text"
                  required
                  value={cycleName}
                  onChange={(e) => setCycleName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                  placeholder="e.g. Q3 Hardware Audit"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Scope Department *
                </label>
                <select
                  required
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                >
                  <option value="">-- Choose Department --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    End Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Assign Auditors *
                </label>
                <div className="border border-gray-200 rounded-lg p-2 max-h-36 overflow-y-auto space-y-1.5 bg-gray-50">
                  {users.map((u) => (
                    <label key={u.employeeId} className="flex items-center gap-2 text-xs font-medium text-gray-700 hover:bg-gray-100 p-1 rounded cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={selectedAuditors.includes(u.employeeId)}
                        onChange={() => handleAuditorToggle(u.employeeId)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{u.userName} ({u.employeeId})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-gray-200 border-t-transparent rounded-full animate-spin"></div>
                      Creating...
                    </>
                  ) : (
                    "Create Scope"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="bg-gray-150 text-gray-700 hover:bg-gray-200 py-2 px-4 rounded-lg text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Log verification */}
      {verifyingAssetId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
              <h2 className="text-lg font-bold text-gray-900">Log Item Verification</h2>
              <button
                onClick={() => setVerifyingAssetId(null)}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors hover:bg-gray-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleVerifyItem} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Verification Status *
                </label>
                <select
                  value={verifyStatus}
                  onChange={(e) => setVerifyStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                >
                  <option value="VERIFIED">VERIFIED / GOOD</option>
                  <option value="MISSING">MISSING</option>
                  <option value="DAMAGED">DAMAGED</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Verification Notes / Details
                </label>
                <textarea
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                  placeholder="Provide physical condition details or missing context..."
                  rows={3}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center"
                >
                  {isVerifying ? "Submitting..." : "Submit Log"}
                </button>
                <button
                  type="button"
                  onClick={() => setVerifyingAssetId(null)}
                  className="bg-gray-150 text-gray-700 hover:bg-gray-200 py-2 px-4 rounded-lg text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Resolve Discrepancy */}
      {resolvingAssetId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
              <h2 className="text-lg font-bold text-gray-900">Resolve Discrepancy</h2>
              <button
                onClick={() => setResolvingAssetId(null)}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors hover:bg-gray-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResolveDiscrepancy} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Resolution Notes *
                </label>
                <textarea
                  required
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                  placeholder="Explain how the discrepancy was resolved (e.g. physical item found under desk, or marked for replacement)..."
                  rows={4}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isResolving}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center"
                >
                  {isResolving ? "Resolving..." : "Confirm Resolution"}
                </button>
                <button
                  type="button"
                  onClick={() => setResolvingAssetId(null)}
                  className="bg-gray-150 text-gray-700 hover:bg-gray-200 py-2 px-4 rounded-lg text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
