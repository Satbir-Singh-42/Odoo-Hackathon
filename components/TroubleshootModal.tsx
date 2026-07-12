'use client';

import React, { useState, useCallback, useEffect } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface TroubleshootModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  assetName: string;
}

export function TroubleshootModal({
  isOpen,
  onClose,
  onSubmit,
  assetName,
}: TroubleshootModalProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setError(false);
    }
  }, [isOpen]);

  const handleSubmit = useCallback(() => {
    if (!reason.trim()) {
      setError(true);
      return;
    }
    onSubmit(reason);
    setReason("");
    setError(false);
  }, [reason, onSubmit]);

  return (
    <AnimatePresence>
      {!isOpen ? null : (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className="relative w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-100">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold leading-6 text-gray-900">
                  Report Issue
                </h3>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Report an issue with <strong>{assetName}</strong>. This will notify your manager or the system administrator to schedule maintenance.
              </p>

              <div>
                <label
                  htmlFor="reason"
                  className="block text-sm font-medium text-gray-700">
                  Describe the issue <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="reason"
                  rows={4}
                  className={`mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm border p-2.5 ${error ? "border-red-500" : ""}`}
                  placeholder="e.g., The screen is flickering, or the battery dies very quickly..."
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (e.target.value.trim()) setError(false);
                  }}
                />
                {error && (
                  <p className="mt-1 text-xs text-red-500 font-medium">
                    Please provide a description of the issue.
                  </p>
                )}
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 sm:px-6">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto justify-center rounded-lg bg-gray-100 border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="w-full sm:w-auto justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors bg-yellow-600 hover:bg-yellow-700">
                Submit Report
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
