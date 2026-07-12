import type { Metadata } from "next";
import AppContainer from "@/components/AppContainer";
import { getAppContainerData } from "@/lib/data-access";

export const metadata: Metadata = { title: "Maintenance & Licenses" };

export default async function MaintenancePage() {
  const serverData = await getAppContainerData();
  return <AppContainer initialView="maintenance" serverData={serverData} />;
}
