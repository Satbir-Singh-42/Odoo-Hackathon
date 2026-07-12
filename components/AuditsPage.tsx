"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, AlertTriangle, Package, FileText, CheckCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createAuditSchema } from "@/lib/validations";
import { z } from "zod";

type AuditFormValues = z.infer<typeof createAuditSchema>;

export function AuditsPage({ assets }: { assets: any[] }) {
  const [audits, setAudits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AuditFormValues>({
    resolver: zodResolver(createAuditSchema),
    defaultValues: {
      status: "VERIFIED"
    }
  });

  async function fetchAudits() {
    try {
      const res = await fetch("/api/audit-cycles");
      if (res.ok) {
        const data = await res.json();
        setAudits(data.data || []);
      }
    } catch (err) {
      toast.error("Failed to load audits");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { fetchAudits(); }, []);

  async function onSubmit(data: AuditFormValues) {
    try {
      const res = await fetch("/api/audit-cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          assetId: Number(data.assetId), 
          status: data.status, 
          notes: data.notes 
        })
      });
      if (res.ok) {
        toast.success("Audit logged successfully");
        reset();
        fetchAudits();
      } else {
        toast.error("Failed to log audit");
      }
    } catch (e) { 
      toast.error("Error logging audit"); 
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Audits</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">Track and manage asset physical verifications</p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-600" /> Log New Audit
        </h3>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Asset</label>
              <div className="relative">
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select 
                  {...register("assetId")}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900"
                >
                  <option value="">Select Asset...</option>
                  {assets.map(a => <option key={a.id} value={a.id}>{a.assetCode} - {a.assetName}</option>)}
                </select>
              </div>
              {errors.assetId && <p className="text-xs text-red-500 mt-1">{errors.assetId.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <div className="relative">
                <CheckCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select 
                  {...register("status")}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900"
                >
                  <option value="VERIFIED">Verified (Present & Correct)</option>
                  <option value="DISCREPANCY">Discrepancy Found</option>
                </select>
              </div>
              {errors.status && <p className="text-xs text-red-500 mt-1">{errors.status.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  placeholder="Additional observations..." 
                  {...register("notes")}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900" 
                />
              </div>
              {errors.notes && <p className="text-xs text-red-500 mt-1">{errors.notes.message}</p>}
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-70 flex items-center gap-2"
            >
              {isSubmitting ? "Submitting..." : "Submit Audit"}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Audits</h3>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="space-y-3">
            {audits.length === 0 ? (
              <div className="text-center py-8 text-gray-500 flex flex-col items-center">
                <ShieldCheck className="w-12 h-12 text-gray-300 mb-2" />
                <p>No audits recorded yet</p>
              </div>
            ) : audits.map(a => (
              <div key={a.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50 p-4 rounded-lg border border-gray-100 hover:shadow-sm transition-all gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-gray-900 font-semibold text-sm sm:text-base">{a.asset?.assetCode}</p>
                    <span className="text-gray-400 mx-1">•</span>
                    <p className="text-sm text-gray-600 truncate max-w-[200px] sm:max-w-[400px]">
                      {a.notes || "No notes provided"}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">
                    Logged by {a.employee?.fullName || "System"} on {new Date(a.createdAt || a.actionDate).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {a.actionType === "AUDIT_VERIFIED" ? (
                    <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-medium border border-emerald-200">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Verified
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-xs font-medium border border-amber-200">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Discrepancy
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
