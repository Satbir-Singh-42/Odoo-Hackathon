import type { Metadata } from "next";
import DataViewPage from "@/components/DataViewPage";

export const metadata: Metadata = { title: "Data Viewer - Report Preview" };

export default function StandaloneDataView() {
  return <DataViewPage />;
}
