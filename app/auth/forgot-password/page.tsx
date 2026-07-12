"use client";

import { ForgotPassword } from "@/components/ForgotPassword";

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-dvh relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-3 sm:p-4 md:p-6">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            "linear-gradient(to right,#e5e7eb 1px,transparent 1px),linear-gradient(to bottom,#e5e7eb 1px,transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="w-full max-w-md z-10 relative">
        {/* Logo and Title */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 mb-3 sm:mb-4 bg-white rounded-2xl shadow-sm overflow-hidden">
            <img src="/android-chrome-192x192.png" alt="Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2 px-2">
            {process.env.NEXT_PUBLIC_WEBSITE_NAME || "Inventory Management"}
          </h1>
          <p className="text-sm sm:text-base text-gray-600 px-2">
            Asset & Maintenance System
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          <ForgotPassword onBack={() => (window.location.href = "/auth/sign-in")} />
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-gray-600">
          <p>© {new Date().getFullYear()} {process.env.NEXT_PUBLIC_WEBSITE_NAME || "Inventory Management System"}. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
