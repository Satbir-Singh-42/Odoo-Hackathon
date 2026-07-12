import type { Metadata } from "next";
import AppContainer from "@/components/AppContainer";

export const metadata: Metadata = { title: "Asset Verification & Audits" };

export default function AuditsPage() {
  return <AppContainer initialView="audits" />;
}
