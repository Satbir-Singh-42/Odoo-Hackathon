import type { Metadata } from "next";
import AppContainer from "@/components/AppContainer";
import { getAppContainerData } from "@/lib/data-access";

export const metadata: Metadata = { title: "Asset Verification & Audits" };

export default async function AuditsPage() {
  const serverData = await getAppContainerData();
  return <AppContainer initialView="audits" serverData={serverData} />;
}
