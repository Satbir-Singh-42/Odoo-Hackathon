import type { Metadata } from "next";
import AppContainer from "@/components/AppContainer";
import { getAppContainerData } from "@/lib/data-access";

export const metadata: Metadata = { title: "Reports & Export" };

export default async function ReportsPage() {
  const serverData = await getAppContainerData();
  return <AppContainer initialView="reports" serverData={serverData} />;
}
