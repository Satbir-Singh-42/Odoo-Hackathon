"use client";

import { useEffect, useState, useMemo } from "react";
import { Calendar, Clock, User, Plus, X, Search, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { Asset, User as UserType } from "@/types";

interface Booking {
  id: number;
  assetId: number;
  userId: string;
  startTime: string;
  endTime: string;
  status: string;
  purpose: string | null;
  createdAt: string;
  updatedAt: string;
  asset: {
    id: number;
    assetCode: string;
    assetName: string;
  };
  user: {
    id: string;
    fullName: string;
    email: string | null;
  };
}

interface BookingsPageProps {
  assets: Asset[];
  users: UserType[];
  userRole: string;
}

export function BookingsPage({ assets, users, userRole }: BookingsPageProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");

  // Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [purpose, setPurpose] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get current logged-in employee ID (from first active session context or let user select, but API resolves it using session.user.employeeId)
  async function fetchBookings() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/bookings");
      if (res.ok) {
        const data = await res.json();
        setBookings(data.data || data);
      } else {
        toast.error("Failed to load bookings.");
      }
    } catch (err) {
      toast.error("Error loading bookings.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchBookings();
  }, []);

  const availableAssetsForBooking = useMemo(() => {
    return assets.filter(
      (a) =>
        a.status !== "Disposed" &&
        !a.isBulkOrder &&
        (a.category === "Rooms" || a.category === "Vehicles" || a.category === "Hardware" || a.category === "Networking")
    );
  }, [assets]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAssetId) {
      toast.error("Please select a resource to book.");
      return;
    }
    if (!startTime || !endTime) {
      toast.error("Please select start and end times.");
      return;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      toast.error("Start time must be before end time.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: parseInt(selectedAssetId, 10),
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          purpose: purpose.trim() || undefined,
        }),
      });

      const result = await res.json();

      if (res.ok) {
        toast.success("Resource booked successfully!");
        setShowAddForm(false);
        setSelectedAssetId("");
        setStartTime("");
        setEndTime("");
        setPurpose("");
        fetchBookings();
      } else {
        toast.error(result.message || "Failed to book resource. Overlap detected.");
      }
    } catch (err) {
      toast.error("An error occurred during booking.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel(id: number) {
    if (!confirm("Are you sure you want to cancel this booking?")) return;

    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: "DELETE",
      });

      const result = await res.json();

      if (res.ok) {
        toast.success("Booking cancelled successfully.");
        fetchBookings();
      } else {
        toast.error(result.message || "Failed to cancel booking.");
      }
    } catch (err) {
      toast.error("Error cancelling booking.");
    }
  }

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      const q = searchQuery.toLowerCase();
      return (
        b.asset?.assetName.toLowerCase().includes(q) ||
        b.asset?.assetCode.toLowerCase().includes(q) ||
        b.user?.fullName.toLowerCase().includes(q) ||
        (b.purpose && b.purpose.toLowerCase().includes(q))
      );
    });
  }, [bookings, searchQuery]);

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "UPCOMING":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "ONGOING":
        return "bg-green-100 text-green-800 border-green-200";
      case "COMPLETED":
        return "bg-gray-100 text-gray-800 border-gray-200";
      case "CANCELLED":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-6.5 h-6.5 text-blue-600 animate-pulse" />
            Resource Bookings
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Book shared enterprise resources like rooms, vehicles, and staging hardware
          </p>
        </div>

        <button
          onClick={() => setShowAddForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm transition-all hover:shadow-md shrink-0"
        >
          <Plus className="w-4 h-4" /> Book a Resource
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left/Main Column: Bookings list */}
        <div className="lg:col-span-2 space-y-4">
          {/* Controls Bar */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex flex-col sm:flex-row items-center gap-3 justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Filter bookings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              />
            </div>

            <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200 select-none">
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  viewMode === "list"
                    ? "bg-white text-blue-600 shadow-2xs"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                List View
              </button>
              <button
                onClick={() => setViewMode("calendar")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  viewMode === "calendar"
                    ? "bg-white text-blue-600 shadow-2xs"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                Timeline View
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="bg-white p-12 text-center border border-gray-200 rounded-xl">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-sm text-gray-500">Loading bookings history...</p>
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="bg-white p-12 text-center border border-gray-200 rounded-xl text-gray-500 text-sm">
              <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              No resource bookings matching your search.
            </div>
          ) : viewMode === "list" ? (
            <div className="grid grid-cols-1 gap-4">
              {filteredBookings.map((b) => (
                <div
                  key={b.id}
                  className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs hover:shadow-xs transition-shadow flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{b.asset?.assetName}</h3>
                      <span className="text-xs text-gray-400 font-mono">({b.asset?.assetCode})</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusStyle(
                          b.status
                        )}`}
                      >
                        {b.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span>
                          {new Date(b.startTime).toLocaleString([], {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}{" "}
                          -{" "}
                          {new Date(b.endTime).toLocaleString([], {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <User className="w-4 h-4 text-gray-400" />
                        <span>
                          {b.user?.fullName} ({b.userId})
                        </span>
                      </div>
                    </div>

                    {b.purpose && (
                      <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded-lg border border-gray-150 flex items-start gap-1.5">
                        <FileText className="w-3.5 h-3.5 mt-0.5 text-gray-400 shrink-0" />
                        <span>{b.purpose}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    {b.status !== "CANCELLED" && b.status !== "COMPLETED" && (
                      <button
                        onClick={() => handleCancel(b.id)}
                        className="px-3 py-1.5 border border-red-200 hover:bg-red-50 text-red-600 rounded-lg text-xs font-semibold transition-colors"
                      >
                        Cancel Booking
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Timeline view - sorted groups of upcoming bookings
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-2xs space-y-6">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" /> Schedule Grid
              </h3>
              <div className="space-y-4">
                {filteredBookings.map((b) => (
                  <div key={b.id} className="relative pl-4 border-l-2 border-blue-500 py-1">
                    <p className="text-xs font-semibold text-gray-400">
                      {new Date(b.startTime).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                    <p className="text-sm font-bold text-gray-800">
                      {new Date(b.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                      {new Date(b.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <p className="text-xs text-gray-600">
                      {b.asset?.assetName} booked by {b.user?.fullName}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Help / Stats info */}
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs">
            <h3 className="font-semibold text-gray-950 mb-3 flex items-center gap-1.5 text-sm">
              <CheckCircle2 className="w-4.5 h-4.5 text-blue-600" /> Bookable Assets
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Below are the resources configured for dynamic booking across the enterprise:
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {availableAssetsForBooking.map((asset) => (
                <div key={asset.id} className="flex justify-between items-center text-xs p-2 bg-gray-50 rounded border border-gray-150">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{asset.assetName}</p>
                    <p className="text-[10px] text-gray-400 font-mono truncate">{asset.assetCode} • {asset.category}</p>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    asset.status === "Available" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"
                  }`}>
                    {asset.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Add Booking Form */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-1.5">
                <Calendar className="w-5 h-5 text-blue-600" /> Book Resource
              </h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors hover:bg-gray-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Select Resource *
                </label>
                <select
                  required
                  value={selectedAssetId}
                  onChange={(e) => setSelectedAssetId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                >
                  <option value="">-- Choose Bookable Asset --</option>
                  {availableAssetsForBooking.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.assetName} ({asset.assetCode}) [{asset.category}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Start Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    End Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Purpose / Notes
                </label>
                <textarea
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                  placeholder="Reason for booking..."
                  rows={3}
                />
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
                      Booking...
                    </>
                  ) : (
                    "Confirm Booking"
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
    </div>
  );
}
