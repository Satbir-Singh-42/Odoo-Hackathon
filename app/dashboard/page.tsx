import type { Metadata } from "next";
import AppContainer from "@/components/AppContainer";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return <AppContainer initialView="dashboard" />;
}
