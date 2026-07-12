"use client";

import { Suspense } from "react";
import { ResetPassword } from "@/components/ResetPassword";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center" />}>
      <ResetPassword />
    </Suspense>
  );
}
