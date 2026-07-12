"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Calendar, Package, Clock, Info } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createBookingSchema } from "@/lib/validations";
import { z } from "zod";

type BookingFormValues = z.infer<typeof createBookingSchema>;

export function BookingsPage({ assets }: { assets: any[] }) {
  const [bookings, setBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormValues>({
    resolver: zodResolver(createBookingSchema),
  });

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

  async function onSubmit(data: BookingFormValues) {
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: Number(data.assetId),
          startTime: new Date(data.startTime).toISOString(),
          endTime: new Date(data.endTime).toISOString(),
          purpose: data.purpose
        })
      });
      if (res.ok) {
        toast.success("Booking created successfully");
        reset();
        fetchBookings();
      } else {
        toast.error("Failed to create booking");
      }
    } catch (e) {
      toast.error("Error creating booking");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Bookings</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">Manage asset reservations and bookings</p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-600" /> New Booking
        </h3>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Asset</label>
              <div className="relative">
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select 
                  {...register("assetId")}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
                >
                  <option value="">Select Asset...</option>
                  {assets.map(a => <option key={a.id} value={a.id}>{a.assetCode} - {a.assetName}</option>)}
                </select>
              </div>
              {errors.assetId && <p className="text-xs text-red-500 mt-1">{errors.assetId.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="datetime-local" 
                  {...register("startTime")}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900" 
                />
              </div>
              {errors.startTime && <p className="text-xs text-red-500 mt-1">{errors.startTime.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="datetime-local" 
                  {...register("endTime")}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900" 
                />
              </div>
              {errors.endTime && <p className="text-xs text-red-500 mt-1">{errors.endTime.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
              <div className="relative">
                <Info className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  placeholder="Why do you need this?" 
                  {...register("purpose")}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900" 
                />
              </div>
              {errors.purpose && <p className="text-xs text-red-500 mt-1">{errors.purpose.message}</p>}
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-70 flex items-center gap-2"
            >
              {isSubmitting ? "Booking..." : "Create Booking"}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Upcoming Bookings</h3>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.length === 0 ? (
              <div className="text-center py-8 text-gray-500 flex flex-col items-center">
                <Calendar className="w-12 h-12 text-gray-300 mb-2" />
                <p>No bookings found</p>
              </div>
            ) : bookings.map(b => (
              <div key={b.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50 p-4 rounded-lg border border-gray-100 hover:shadow-sm transition-all gap-4">
                <div>
                  <p className="text-gray-900 font-semibold text-sm sm:text-base">{b.asset?.assetCode} - {b.purpose}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <p className="text-sm text-gray-600">
                      {new Date(b.startTime).toLocaleString()} to {new Date(b.endTime).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium border border-blue-200">
                  {b.status || "UPCOMING"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
