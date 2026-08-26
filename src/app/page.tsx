// Server Component: reads the source-of-truth files in /data and passes typed, serializable
// data to the client demo shell. No live connections — all data is local and demo-grade.

import { loadDemoData } from "@/lib/data";
import { DemoShell } from "@/components/demo/DemoShell";

export default function Home() {
  const data = loadDemoData();
  return <DemoShell data={data} />;
}
