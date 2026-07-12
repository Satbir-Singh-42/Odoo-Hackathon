'use client';

import { motion } from "framer-motion";
import { Package } from "lucide-react";

export function LoadingScreen() {
  return (
    <div 
      className="fixed inset-0 bg-gray-50 flex flex-col items-center justify-center overflow-hidden z-[9999]"
      style={{ backgroundColor: '#f9fafb' }}
    >
      {/* Background Pattern */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: `linear-gradient(to right, #9ca3af 1px, transparent 1px),
            linear-gradient(to bottom, #9ca3af 1px, transparent 1px)`,
          backgroundSize: '24px 24px'
        }}
      />
      
      <div className="relative z-10 flex flex-col items-center p-4 max-w-sm w-full">
        {/* Logo Animation */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative"
        >
          {/* <div className="w-20 h-20 bg-blue-600 rounded-2xl shadow-xl flex items-center justify-center mb-8 relative z-10">
            <Package className="w-10 h-10 text-white" />
          </div> */}
          <div className="w-20 h-20 bg-white rounded-2xl shadow-xl overflow-hidden flex items-center justify-center mb-8 relative z-10">
            <img src="/logo.svg" alt="Logo" className="w-full h-full object-cover" />
          </div>
          

        </motion.div>

        {/* Text Animation */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Inventory System</h2>
          <div className="flex items-center justify-center gap-1">
            <span className="text-blue-600 text-sm font-medium">Loading resources</span>
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-blue-600"
            >
              ...
            </motion.span>
          </div>
        </motion.div>

        {/* Progress Bar */}
        <motion.div 
          className="mt-8 w-48 h-1 bg-gray-200 rounded-full overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <motion.div
            className="h-full bg-blue-600 rounded-full"
            animate={{ x: ["-100%", "100%"] }}
            transition={{ 
              duration: 1.5, 
              repeat: Infinity, 
              ease: "linear" 
            }}
          />
        </motion.div>
      </div>
    </div>
  );
}