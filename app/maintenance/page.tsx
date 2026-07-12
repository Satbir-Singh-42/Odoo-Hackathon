import type { Metadata } from "next";
import AppContainer from "@/components/AppContainer";

export const metadata: Metadata = { title: "Maintenance & Licenses" };

export default function MaintenancePage() {
  return <AppContainer initialView="maintenance" />;
}
