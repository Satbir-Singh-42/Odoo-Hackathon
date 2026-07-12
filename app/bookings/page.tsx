import type { Metadata } from "next";
import AppContainer from "@/components/AppContainer";

export const metadata: Metadata = { title: "Resource Bookings" };

export default function BookingsPage() {
  return <AppContainer initialView="bookings" />;
}
