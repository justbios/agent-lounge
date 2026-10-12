"use client";

import { useState } from "react";
import { useLiveFeed } from "@/lib/live/useLiveFeed";
import PipelineDashboard from "./PipelineDashboard";
import LiveDashboard from "./LiveDashboard";
import TopBar, { Mode } from "./TopBar";

export default function Home() {
  const feed = useLiveFeed();
  const [chosen, setChosen] = useState<Mode | null>(null);
  const mode: Mode = chosen ?? (feed.events.length ? "live" : "demo");

  return (
    <div className="app">
      <TopBar mode={mode} onMode={setChosen} status={feed.status} />
      {mode === "live" ? <LiveDashboard feed={feed} /> : <PipelineDashboard />}
    </div>
  );
}
