"use client";

import { useState } from "react";
import { useAccess } from "@/lib/live/access";
import { useAnswerKeys } from "@/lib/live/answerKeys";
import { useHosted, useRelayKey, useViewRoom } from "@/lib/live/relayKey";
import { useCloudFeed } from "@/lib/live/useCloudFeed";
import { useLiveFeed } from "@/lib/live/useLiveFeed";
import PipelineDashboard from "./PipelineDashboard";
import LiveDashboard from "./LiveDashboard";
import KeyLost from "./live/KeyLost";
import TopBar, { Mode } from "./TopBar";

export default function Home() {
  const hosted = useHosted();
  const key = useRelayKey();
  const view = useViewRoom();
  // a pairing link from `relay.sh pair` lands here: its answer key is filed and leaves the address bar
  useAnswerKeys();
  const local = useLiveFeed(hosted === false);
  const cloud = useCloudFeed({ key, room: hosted ? view : null }, hosted === true);
  const feed = hosted ? cloud : local;
  const [chosen, setChosen] = useState<Mode | null>(null);
  const viewing = !!(hosted && view);
  const access = useAccess(hosted && !viewing ? key : null);
  const mode: Mode = chosen ?? (viewing || feed.events.length ? "live" : "demo");

  return (
    <div className="app">
      <TopBar
        mode={mode}
        onMode={setChosen}
        status={feed.status}
        connected={hosted ? !!key && !viewing : local.events.length > 0}
      />
      {access?.lost && key && <KeyLost kind={access.lost} current={key} />}
      {mode === "live" ? <LiveDashboard feed={feed} cloud={!!hosted} roomKey={key} viewing={viewing} /> : <PipelineDashboard />}
    </div>
  );
}
