'use client';

import { useState, useEffect } from "react";
import { Mail, ArrowLeft, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import dataService from '@/lib/dataService';

interface ForgotPasswordProps {
  onBack: () => void;
}

export function ForgotPassword({ onBack }: ForgotPasswordProps) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter your email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsLoading(true);
    try {
      await dataService.requestPasswordReset(trimmed);
      setSent(true);
    } catch (err: any) {
      setError(err?.message || "Unable to connect to the server. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  /* ── Sent confirmation ── */
  if (sent) {
    return (
      <div className="animate-in fade-in duration-200">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Check your inbox</h2>
          <p className="text-sm text-gray-500">A reset link has been sent</p>
        </div>

        <div className="flex flex-col items-center text-center py-2 gap-4">
          <div className="w-16 h-16 bg-green-50 border-2 border-green-100 rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-gray-600">
              We sent a reset link to
            </p>
            <p className="text-sm font-semibold text-gray-900 break-all">{email}</p>
          </div>
          <p className="text-xs text-gray-400 max-w-xs">
            The link expires in 1 hour. If you don't see it, check your spam folder.
          </p>
        </div>

        <button
          onClick={onBack}
          className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sign In
        </button>
      </div>
    );
  }

  /* ── Email input form ── */
  return (
    <div className="animate-in fade-in duration-200">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Forgot password?</h2>
        <p className="text-sm text-gray-500">
          Enter your email and we'll send you a reset link.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email */}
        <div>
          <label
            htmlFor="reset-email"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Email Address
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Mail className="h-5 w-5 text-gray-400" />
            </div>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base transition-all"
              placeholder="you@company.com"
            />
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 font-medium text-base transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Sending...
            </>
          ) : (
            "Send Reset Link"
          )}
        </button>

        {/* Back link */}
        <button
          type="button"
          onClick={onBack}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sign In
        </button>
      </form>
    </div>
  );
}
