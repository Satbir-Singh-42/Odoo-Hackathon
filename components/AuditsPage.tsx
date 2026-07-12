"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, AlertTriangle } from "lucide-react";

export function AuditsPage({ assets }: { assets: any[] }) {
  const [audits, setAudits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [status, setStatus] = useState("VERIFIED");
  const [notes, setNotes] = useState("");

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

  async function handleSubmit(e: any) {
    e.preventDefault();
    if (!selectedAssetId) return toast.error("Select an asset");
    try {
      const res = await fetch("/api/audit-cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: Number(selectedAssetId), status, notes })
      });
      if (res.ok) {
        toast.success("Audit logged");
        setSelectedAssetId(""); setNotes(""); fetchAudits();
      } else {
        toast.error("Failed to log audit");
      }
    } catch (e) { toast.error("Error logging audit"); }
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#12121A] p-6 rounded-xl border border-white/5">
        <h3 className="text-lg font-medium text-white mb-4">Log New Audit</h3>
        <form onSubmit={handleSubmit} className="flex gap-4">
          <select className="bg-white/5 border border-white/10 rounded-lg px-4 text-white" value={selectedAssetId} onChange={e => setSelectedAssetId(e.target.value)}>
            <option value="">Select Asset...</option>
            {assets.map(a => <option key={a.id} value={a.id}>{a.assetCode} - {a.assetName}</option>)}
          </select>
          <select className="bg-white/5 border border-white/10 rounded-lg px-4 text-white" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="VERIFIED">Verified</option>
            <option value="DISCREPANCY">Discrepancy</option>
          </select>
          <input placeholder="Notes..." className="bg-white/5 border border-white/10 rounded-lg px-4 text-white flex-1" value={notes} onChange={e => setNotes(e.target.value)} />
          <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg">Submit</button>
        </form>
      </div>
      <div className="bg-[#12121A] rounded-xl border border-white/5 overflow-hidden p-6">
        <h3 className="text-lg font-medium text-white mb-4">Recent Audits</h3>
        {isLoading ? <p className="text-gray-400">Loading...</p> : (
          <div className="space-y-2">
            {audits.map(a => (
              <div key={a.id} className="flex justify-between items-center bg-white/5 p-4 rounded-lg">
                <div>
                  <p className="text-white font-medium">{a.asset?.assetCode}</p>
                  <p className="text-sm text-gray-400">{a.notes}</p>
                </div>
                <div className="flex gap-2 items-center">
                  {a.actionType === "AUDIT_VERIFIED" ? <ShieldCheck className="text-emerald-400 w-5 h-5"/> : <AlertTriangle className="text-amber-400 w-5 h-5"/>}
                  <span className="text-xs text-gray-500">{new Date(a.createdAt || a.actionDate).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
