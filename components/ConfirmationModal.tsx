'use client';

import React, { useState, useCallback, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ASSET_CONDITIONS_ARRAY,
  DEFAULT_ASSET_CONDITION,
} from '@/config/constants';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, condition?: string) => void;
  title: string;
  message: string;
  confirmText?: string;
  confirmColor?: string;
  requireReason?: boolean;
  /** Show a condition dropdown for deletions/disposals */
  showCondition?: boolean;
  /** Initial condition value */
  initialCondition?: string;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Delete",
  confirmColor = "bg-red-600 hover:bg-red-700",
  requireReason = true,
  showCondition = false,
  initialCondition,
}: ConfirmationModalProps) {
  const [reason, setReason] = useState("");
  const [condition, setCondition] = useState(
    initialCondition || DEFAULT_ASSET_CONDITION,
  );
  const [error, setError] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setReason("");
      setCondition(initialCondition || DEFAULT_ASSET_CONDITION);
      setError(false);
    }
  }, [isOpen, initialCondition]);

  const handleConfirm = useCallback(() => {
    if (requireReason && !reason.trim()) {
      setError(true);
      return;
    }
    onConfirm(reason, showCondition ? condition : undefined);
  }, [requireReason, reason, onConfirm, showCondition, condition]);

  return (
    <AnimatePresence>
      {!isOpen ? null : (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-3 sm:p-4">
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
            className="relative w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${confirmColor.includes("red") ? "bg-red-100" : "bg-blue-100"}`}>
                  <AlertTriangle
                    className={`h-5 w-5 ${confirmColor.includes("red") ? "text-red-600" : "text-blue-600"}`}
                  />
                </div>
                <h3 className="text-base sm:text-lg font-semibold leading-6 text-gray-900">
                  {title}
                </h3>
              </div>
              <p className="text-sm text-gray-500 mb-4">{message}</p>

              {requireReason && (
                <div className="mt-2">
                  <label
                    htmlFor="reason"
                    className="block text-sm font-medium text-gray-700">
                    Reason for {confirmText.toLowerCase()}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="reason"
                    rows={3}
                    className={`mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm border p-2.5 ${error ? "border-red-500" : ""}`}
                    placeholder="Please provide a mandatory reason..."
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      if (e.target.value.trim()) setError(false);
                    }}
                  />
                  {error && (
                    <p className="mt-1 text-xs text-red-500 font-medium">
                      Reason is required to proceed.
                    </p>
                  )}
                </div>
              )}

              {showCondition && (
                <div className="mt-4">
                  <label
                    htmlFor="condition"
                    className="block text-sm font-medium text-gray-700">
                    Condition at Deletion{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1">
                    <SearchableSelect
                      value={condition}
                      onChange={(value) => setCondition(value)}
                      options={[...ASSET_CONDITIONS_ARRAY]}
                      placeholder="Select condition..."
                    />
                  </div>
                </div>
              )}
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
                onClick={handleConfirm}
                className={`w-full sm:w-auto justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${confirmColor}`}>
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
