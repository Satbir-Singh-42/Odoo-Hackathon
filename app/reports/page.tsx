import type { Metadata } from "next";
import AppContainer from "@/components/AppContainer";

export const metadata: Metadata = { title: "Reports & Export" };

export default function ReportsPage() {
  return <AppContainer initialView="reports" />;
}
