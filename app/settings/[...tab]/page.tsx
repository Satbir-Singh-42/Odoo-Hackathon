import type { Metadata } from "next";
import AppContainer from "@/components/AppContainer";

export const metadata: Metadata = { title: "Settings & Administration" };

export default function SettingsSubPage() {
  return <AppContainer initialView="settings" />;
}
