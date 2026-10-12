"use client";

import { useState } from "react";
import { useHosted, useRelayKey } from "@/lib/live/relayKey";
import { useCloudFeed } from "@/lib/live/useCloudFeed";
import { useLiveFeed } from "@/lib/live/useLiveFeed";
import PipelineDashboard from "./PipelineDashboard";
import LiveDashboard from "./LiveDashboard";
import TopBar, { Mode } from "./TopBar";

export default function Home() {
  const hosted = useHosted();
  const key = useRelayKey();
  const local = useLiveFeed(hosted === false);
  const cloud = useCloudFeed(key, hosted === true);
  const feed = hosted ? cloud : local;
  const [chosen, setChosen] = useState<Mode | null>(null);
  const mode: Mode = chosen ?? (feed.events.length ? "live" : "demo");

  return (
    <div className="app">
      <TopBar mode={mode} onMode={setChosen} status={feed.status} />
      {mode === "live" ? <LiveDashboard feed={feed} cloud={!!hosted} hasKey={!!key} /> : <PipelineDashboard />}
    </div>
  );
}
