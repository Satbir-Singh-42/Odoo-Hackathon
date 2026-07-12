import type { Metadata } from "next";
import AppContainer from "@/components/AppContainer";
import { getAppContainerData } from "@/lib/data-access";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const serverData = await getAppContainerData();
  return <AppContainer initialView="dashboard" serverData={serverData} />;
}
