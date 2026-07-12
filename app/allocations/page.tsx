import type { Metadata } from "next";
import AppContainer from "@/components/AppContainer";

export const metadata: Metadata = { title: "Asset Allocations" };

export default function AllocationsPage() {
  return <AppContainer initialView="allocations" />;
}
