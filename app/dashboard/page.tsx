import { auth } from "@/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import AppContainer from "@/components/AppContainer";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/auth/sign-in");

  return <AppContainer initialView="dashboard" />;
}
