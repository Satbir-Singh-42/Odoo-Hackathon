import { auth } from "@/auth";
import { redirect } from "next/navigation";

// Root redirect — send users straight to the dashboard
export default async function RootPage() {
  const session = await auth();
  if (!session) redirect("/auth/sign-in");
  redirect("/dashboard");
}
