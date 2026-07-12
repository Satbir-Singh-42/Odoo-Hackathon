import type { Metadata } from "next";
import AppContainer from "@/components/AppContainer";
import { getAppContainerData } from "@/lib/data-access";

export const metadata: Metadata = { title: "Resource Bookings" };

export default async function BookingsPage() {
  const serverData = await getAppContainerData();
  return <AppContainer initialView="bookings" serverData={serverData} />;
}
