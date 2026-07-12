'use client';

import { useState, useEffect } from "react";
import { Package, Lock, User, AlertCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import dataService from '@/lib/dataService';
import { ForgotPassword } from "./ForgotPassword";

interface LoginProps {
  onLogin: (employeeId: string, userName: string, role: string, managedCategories?: string[]) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("showForgot") === "1",
  );

  // Show success toast if redirected back after a reset
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("passwordReset") === "1") {
      toast.success("Password updated! You can now sign in with your new password.");
      window.history.replaceState(null, "", "/");
    }
    if (new URLSearchParams(window.location.search).get("showForgot") === "1") {
      window.history.replaceState(null, "", "/");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // Authenticate with API
      const authResult = await dataService.authenticateUser(
        employeeId,
        password,
      );

      if (authResult.success && authResult.user) {
        // Store session
        const sessionData = {
          employeeId: authResult.user.employeeId,
          userName: authResult.user.userName,
          role: authResult.user.role ?? "Viewer",
          managedCategories: authResult.user.managedCategories,
          loginTime: new Date().toISOString(),
        };

        // Store JWT token
        const token = authResult.token;

        if (rememberMe) {
          localStorage.setItem("inventoryAuth", JSON.stringify(sessionData));
          if (token) localStorage.setItem("inventoryToken", token);
          // Clear sessionStorage to avoid stale data from a previous non-remembered login
          sessionStorage.removeItem("inventoryAuth");
          sessionStorage.removeItem("inventoryToken");
        } else {
          sessionStorage.setItem("inventoryAuth", JSON.stringify(sessionData));
          if (token) sessionStorage.setItem("inventoryToken", token);
          // Clear localStorage to avoid persisting a previous remembered session
          localStorage.removeItem("inventoryAuth");
          localStorage.removeItem("inventoryToken");
        }

        onLogin(
          authResult.user.employeeId,
          authResult.user.userName,
          authResult.user.role ?? "Viewer",
          authResult.user.managedCategories
        );
        setIsLoading(false);
      } else {
        setError(authResult.message || "Invalid Employee ID or Password");
        setIsLoading(false);
      }
    } catch (err) {
      setError(
        "Unable to connect to server. Please check your connection and try again.",
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh relative overflow-hidden bg-linear-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-3 sm:p-4 md:p-6">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>

      <div className="w-full max-w-md z-10 relative">
        {/* Logo and Title */}
        <div className="text-center mb-6 sm:mb-8">
          {/* <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-blue-600 rounded-2xl shadow-lg mb-3 sm:mb-4">
            <Package className="w-9 h-9 text-white" />
          </div> */}
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 mb-3 sm:mb-4 bg-white rounded-2xl shadow-sm overflow-hidden">
            <img src="/logo.svg" alt="Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2 px-2">
            {process.env.NEXT_PUBLIC_WEBSITE_NAME || "Inventory Management"}
          </h1>
          <p className="text-sm sm:text-base text-gray-600 px-2">
            Asset & Maintenance System
          </p>
        </div>

        {/* Login / Forgot Password Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          {showForgot ? (
            <ForgotPassword onBack={() => setShowForgot(false)} />
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-1">
                  Welcome Back
                </h2>
                <p className="text-gray-600 text-sm">
                  Please sign in to access the system
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 animate-in fade-in duration-200">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">{error}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Employee ID */}
                <div>
                  <label
                    htmlFor="employeeId"
                    className="block text-sm font-medium text-gray-700 mb-2">
                    Employee ID
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="employeeId"
                      type="text"
                      required
                      autoComplete="username"
                      value={employeeId}
                      onChange={(e) => {
                        setEmployeeId(e.target.value);
                        setError("");
                      }}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base transition-all"
                      placeholder="Enter your Employee ID"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError("");
                      }}
                      className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base transition-all"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      {showPassword ? (
                        <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                      ) : (
                        <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Remember Me */}
                <div className="flex flex-wrap gap-3 items-center justify-between">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="ml-2 text-sm text-gray-700">Remember me</span>
                  </label>
                  <button
                    type="button"
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap"
                    onClick={() => setShowForgot(true)}
                  >
                    Forgot password?
                  </button>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 font-medium text-base transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-gray-200 border-t-transparent rounded-full animate-spin"></div>
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-gray-600">
          <p>© 2026 {process.env.NEXT_PUBLIC_WEBSITE_NAME || "Inventory Management System"}. All rights reserved.</p>
        </div>
      </div>

      {/* Custom CSS for grid pattern */}
      <style>{`
        .bg-grid-pattern {
          background-image: 
            linear-gradient(to right, #e5e7eb 1px, transparent 1px),
            linear-gradient(to bottom, #e5e7eb 1px, transparent 1px);
          background-size: 24px 24px;
        }
      `}</style>

      {/* Custom Alert Dialog */}
      {/* Custom Alert Dialog - Removed in favor of Sonner */}
    </div>
  );
}
