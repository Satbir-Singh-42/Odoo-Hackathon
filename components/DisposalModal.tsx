'use client';

import React, { useState, useCallback, useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ASSET_CONDITIONS_ARRAY,
  ASSET_CONDITIONS,
} from '@/config/constants';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Asset } from '@/types';

interface DisposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, condition?: string) => void;
  asset?: any; // Kept for backwards compatibility but entirely unused in this component
  warnings?: string[];
  isConfirmDisabled?: boolean;
  confirmDisabledTooltip?: string;
}

export function DisposalModal({
  isOpen,
  onClose,
  onConfirm,
  warnings = [],
  isConfirmDisabled = false,
  confirmDisabledTooltip = "",
}: DisposalModalProps) {
  const [reason, setReason] = useState("");
  const [condition, setCondition] = useState<string>(ASSET_CONDITIONS.POOR);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setCondition(ASSET_CONDITIONS.POOR);
      setError(false);
    }
  }, [isOpen]);

  const handleConfirm = useCallback(() => {
    if (!reason.trim()) {
      setError(true);
      return;
    }
    onConfirm(reason, condition);
  }, [reason, condition, onConfirm]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Confirm Asset Disposal</h2>
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <p className="text-gray-600 mb-6">
                Are you sure you want to dispose of this asset? This action will set its status to "Disposed" permanently.
              </p>

              {warnings.length > 0 && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex gap-3">
                  <div className="bg-white p-1.5 rounded-lg h-fit border border-red-100 shadow-sm shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-red-900 mb-1">
                      Disposal Warning{warnings.length > 1 ? "s" : ""}
                    </h4>
                    <ul className="text-xs text-red-800 leading-relaxed list-none space-y-1">
                      {warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Reason for Disposal *
                  </label>
                  <textarea
                    rows={4}
                    className={`w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none outline-none ${error ? "border-red-500 bg-red-50" : "border-gray-200 bg-gray-50/30"
                      }`}
                    placeholder="e.g. End of life, damaged beyond repair, license expired..."
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      if (e.target.value.trim()) setError(false);
                    }}
                  />
                  {error && (
                    <p className="mt-1 text-xs text-red-500 font-medium ml-1">
                      Reason is required to proceed.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Condition at Disposal *
                  </label>
                  <SearchableSelect
                    value={condition}
                    onChange={(val) => setCondition(val)}
                    options={[...ASSET_CONDITIONS_ARRAY]}
                    placeholder="Select condition..."
                  />
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={isConfirmDisabled}
                title={confirmDisabledTooltip}
                className={`px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition-all shadow-md active:scale-[0.98] ${isConfirmDisabled
                    ? "bg-gray-400 cursor-not-allowed shadow-none"
                    : "bg-red-500 hover:bg-red-600 shadow-red-200"
                  }`}
              >
                Confirm Disposal
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
