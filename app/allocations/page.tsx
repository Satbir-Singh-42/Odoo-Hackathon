import type { Metadata } from "next";
import AppContainer from "@/components/AppContainer";
import { getAppContainerData } from "@/lib/data-access";

export const metadata: Metadata = { title: "Asset Allocations" };

export default async function AllocationsPage() {
  const serverData = await getAppContainerData();
  return <AppContainer initialView="allocations" serverData={serverData} />;
}
