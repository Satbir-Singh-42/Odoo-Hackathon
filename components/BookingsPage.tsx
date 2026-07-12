"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Calendar } from "lucide-react";

export function BookingsPage({ assets }: { assets: any[] }) {
  const [bookings, setBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [assetId, setAssetId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [purpose, setPurpose] = useState("");

  async function fetchBookings() {
    try {
      const res = await fetch("/api/bookings");
      if (res.ok) {
        const data = await res.json();
        setBookings(data.data || data || []);
      }
    } catch (err) {
      toast.error("Failed to load bookings");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { fetchBookings(); }, []);

  async function handleSubmit(e: any) {
    e.preventDefault();
    if (!assetId || !startTime || !endTime) return toast.error("Fill required fields");
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: Number(assetId), startTime: new Date(startTime).toISOString(), endTime: new Date(endTime).toISOString(), purpose })
      });
      if (res.ok) {
        toast.success("Booking created");
        setAssetId(""); setStartTime(""); setEndTime(""); setPurpose("");
        fetchBookings();
      } else {
        toast.error("Failed to create booking");
      }
    } catch (e) { toast.error("Error creating booking"); }
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#12121A] p-6 rounded-xl border border-white/5">
        <h3 className="text-lg font-medium text-white mb-4">New Booking</h3>
        <form onSubmit={handleSubmit} className="flex gap-4 flex-wrap">
          <select className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white" value={assetId} onChange={e => setAssetId(e.target.value)}>
            <option value="">Select Asset...</option>
            {assets.map(a => <option key={a.id} value={a.id}>{a.assetCode}</option>)}
          </select>
          <input type="datetime-local" className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white" value={startTime} onChange={e => setStartTime(e.target.value)} />
          <input type="datetime-local" className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white" value={endTime} onChange={e => setEndTime(e.target.value)} />
          <input placeholder="Purpose..." className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white flex-1 min-w-[200px]" value={purpose} onChange={e => setPurpose(e.target.value)} />
          <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg">Book</button>
        </form>
      </div>
      <div className="bg-[#12121A] rounded-xl border border-white/5 p-6">
        <h3 className="text-lg font-medium text-white mb-4">Upcoming Bookings</h3>
        {isLoading ? <p className="text-gray-400">Loading...</p> : (
          <div className="space-y-2">
            {bookings.length === 0 ? <p className="text-gray-500">No bookings found</p> : bookings.map(b => (
              <div key={b.id} className="flex justify-between items-center bg-white/5 p-4 rounded-lg">
                <div>
                  <p className="text-white font-medium">{b.asset?.assetCode} - {b.purpose}</p>
                  <p className="text-sm text-gray-400">{new Date(b.startTime).toLocaleString()} to {new Date(b.endTime).toLocaleString()}</p>
                </div>
                <Calendar className="text-indigo-400 w-5 h-5"/>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
