import type { Metadata } from "next";
import AppContainer from "@/components/AppContainer";

export const metadata: Metadata = { title: "Assets Inventory" };

export default function AssetsPage() {
  return <AppContainer initialView="assets" />;
}
