"use client";

import { useState } from "react";
import { useHosted, useRelayKey, useViewRoom } from "@/lib/live/relayKey";
import { useCloudFeed } from "@/lib/live/useCloudFeed";
import { useLiveFeed } from "@/lib/live/useLiveFeed";
import PipelineDashboard from "./PipelineDashboard";
import LiveDashboard from "./LiveDashboard";
import TopBar, { Mode } from "./TopBar";

export default function Home() {
  const hosted = useHosted();
  const key = useRelayKey();
  const view = useViewRoom();
  const local = useLiveFeed(hosted === false);
  const cloud = useCloudFeed({ key, room: hosted ? view : null }, hosted === true);
  const feed = hosted ? cloud : local;
  const [chosen, setChosen] = useState<Mode | null>(null);
  const viewing = !!(hosted && view);
  const mode: Mode = chosen ?? (viewing || feed.events.length ? "live" : "demo");

  return (
    <div className="app">
      <TopBar mode={mode} onMode={setChosen} status={feed.status} />
      {mode === "live" ? <LiveDashboard feed={feed} cloud={!!hosted} roomKey={key} viewing={viewing} /> : <PipelineDashboard />}
    </div>
  );
}
