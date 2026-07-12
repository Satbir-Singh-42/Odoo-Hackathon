'use client';

import { useState, useEffect } from "react";
import {
  Package,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import dataService from '@/lib/dataService';
import { getErrorMessage } from '@/lib/utils/errorHelpers';

// Reads ?token= from the current URL
function getTokenFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") || "";
}

type PageState = "validating" | "ready" | "submitting" | "success" | "error";

export function ResetPassword() {
  const [token, setToken] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pageState, setPageState] = useState<PageState>("validating");
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldError, setFieldError] = useState("");

  // Validate token on mount
  useEffect(() => {
    const t = getTokenFromUrl();
    if (!t) {
      setErrorMessage("No reset token found in the URL. Please request a new password reset link.");
      setPageState("error");
      return;
    }
    setToken(t);

    dataService
      .validateResetToken(t)
      .then((data) => {
        setFullName(data.fullName || "");
        setPageState("ready");
      })
      .catch((err: unknown) => {
        setErrorMessage(getErrorMessage(err) || "Invalid or expired reset link.");
        setPageState("error");
      });
  }, []);

  const validate = (): boolean => {
    if (password.length < 8) {
      setFieldError("Password must be at least 8 characters.");
      return false;
    }
    if (password !== confirm) {
      setFieldError("Passwords do not match.");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError("");
    if (!validate()) return;

    setPageState("submitting");
    try {
      await dataService.resetPassword(token, password);
      setPageState("success");
    } catch (err: unknown) {
      setErrorMessage(getErrorMessage(err) || "Failed to reset password.");
      setPageState("error");
    }
  };

  const goToLogin = () => {
    window.location.href = "/auth/sign-in?passwordReset=1";
  };

  const goToForgot = () => {
    window.location.href = "/auth/forgot-password";
  };

  // ─── Password strength indicator ─────────────────
  const getStrength = (pw: string): { level: number; label: string; color: string } => {
    if (!pw) return { level: 0, label: "", color: "" };
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { level: 1, label: "Weak", color: "bg-red-500" };
    if (score <= 3) return { level: 2, label: "Fair", color: "bg-yellow-400" };
    return { level: 3, label: "Strong", color: "bg-green-500" };
  };

  const strength = getStrength(password);

  // ─── Render states ──────────────────────────────

  const renderContent = () => {
    if (pageState === "validating") {
      return (
        <div className="flex flex-col items-center py-10 gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm text-gray-500">Verifying your reset link…</p>
        </div>
      );
    }

    if (pageState === "error") {
      return (
        <div className="flex flex-col items-center text-center py-6 gap-4">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Link Invalid or Expired</h3>
            <p className="text-sm text-gray-600">{errorMessage}</p>
          </div>
          <button
            onClick={goToForgot}
            className="mt-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Request a New Link
          </button>
          <button
            onClick={goToLogin}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Back to Sign In
          </button>
        </div>
      );
    }

    if (pageState === "success") {
      return (
        <div className="flex flex-col items-center text-center py-6 gap-4 animate-in fade-in duration-300">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">Password Updated!</h3>
            <p className="text-sm text-gray-600">
              Your password has been changed successfully.
              {fullName ? ` Welcome back, ${fullName}!` : ""}
            </p>
          </div>
          <button
            onClick={goToLogin}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 font-medium text-sm transition-all shadow-md"
          >
            Sign In with New Password
          </button>
        </div>
      );
    }

    // ready / submitting
    return (
      <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in duration-200">
        {fullName && (
          <p className="text-sm text-gray-600">
            Hi <strong className="text-gray-900">{fullName}</strong>, choose a new password below.
          </p>
        )}

        {/* New Password */}
        <div>
          <label htmlFor="rp-password" className="block text-sm font-medium text-gray-700 mb-1.5">
            New Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="h-4 w-4 text-gray-400" />
            </div>
            <input
              id="rp-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => { setPassword(e.target.value); setFieldError(""); }}
              className="w-full pl-9 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
              placeholder="At least 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Strength bar */}
          {password && (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1">
                {[1, 2, 3].map((level) => (
                  <div
                    key={level}
                    className={`h-1 flex-1 rounded-full transition-all duration-300 ${strength.level >= level ? strength.color : "bg-gray-200"
                      }`}
                  />
                ))}
              </div>
              <p className="text-xs text-gray-500">
                Strength: <span className="font-medium text-gray-700">{strength.label}</span>
              </p>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label htmlFor="rp-confirm" className="block text-sm font-medium text-gray-700 mb-1.5">
            Confirm New Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <ShieldCheck className="h-4 w-4 text-gray-400" />
            </div>
            <input
              id="rp-confirm"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setFieldError(""); }}
              className={`w-full pl-9 pr-10 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all ${fieldError ? "border-red-300 bg-red-50" : "border-gray-300"
                }`}
              placeholder="Re-enter new password"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Match indicator */}
          {confirm && password && (
            <p className={`text-xs mt-1 ${password === confirm ? "text-green-600" : "text-red-500"}`}>
              {password === confirm ? "✓ Passwords match" : "✗ Passwords do not match"}
            </p>
          )}
        </div>

        {fieldError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{fieldError}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={pageState === "submitting"}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 font-medium text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {pageState === "submitting" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Updating password…
            </>
          ) : (
            "Update Password"
          )}
        </button>

        <p className="text-center text-xs text-gray-500">
          Remember it?{" "}
          <button
            type="button"
            onClick={goToLogin}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Sign in instead
          </button>
        </p>
      </form>
    );
  };

  return (
    <div className="min-h-dvh relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
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
        {/* Header */}
        <div className="text-center mb-6">
          {/* <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl shadow-lg mb-3">
            <Package className="w-8 h-8 text-white" />
          </div> */}
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white rounded-2xl shadow-sm overflow-hidden mb-3">
            <img src="/logo.svg" alt="Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Inventory Management</h1>
          <p className="text-sm text-gray-600">Asset &amp; Maintenance System</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Reset Your Password</h2>
            <p className="text-gray-500 text-sm">
              {pageState === "validating"
                ? "Please wait while we verify your link."
                : pageState === "success"
                  ? "Your account is secure."
                  : pageState === "error"
                    ? "There was a problem with your link."
                    : "Create a new secure password for your account."}
            </p>
          </div>

          {renderContent()}
        </div>

        <div className="text-center mt-6 text-xs text-gray-500">
          © 2026 {process.env.NEXT_PUBLIC_WEBSITE_NAME || "Inventory Management System"}. All rights reserved.
        </div>
      </div>
    </div>
  );
}
