import type { Metadata } from "next";
import AppContainer from "@/components/AppContainer";
import { getAppContainerData } from "@/lib/data-access";

export const metadata: Metadata = { title: "Settings & Administration" };

export default async function SettingsAppPage() {
  const serverData = await getAppContainerData();
  return <AppContainer initialView="settings" serverData={serverData} />;
}
