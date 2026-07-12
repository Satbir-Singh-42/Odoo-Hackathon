import type { Metadata } from "next";
import AppContainer from "@/components/AppContainer";
import { getAppContainerData } from "@/lib/data-access";

export const metadata: Metadata = { title: "Assets Inventory" };

export default async function AssetsPage() {
  const serverData = await getAppContainerData();
  return <AppContainer initialView="assets" serverData={serverData} />;
}
