"use client";

import { useEffect, useState } from "react";
import { LiveEvent } from "./types";

export type FeedStatus = "connecting" | "open" | "offline";

export interface LiveFeed {
  status: FeedStatus;
  events: LiveEvent[];
}

/** Streams every hook event the local Agent Lounge server has seen, across all Claude Code sessions. */
export function useLiveFeed(enabled = true): LiveFeed {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [status, setStatus] = useState<FeedStatus>("connecting");

  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource("/api/live");
    es.addEventListener("open", () => setStatus("open"));
    es.addEventListener("error", () => setStatus(es.readyState === EventSource.CLOSED ? "offline" : "connecting"));
    es.addEventListener("snapshot", (m) => {
      setStatus("open");
      setEvents(JSON.parse((m as MessageEvent).data) as LiveEvent[]);
    });
    es.addEventListener("event", (m) => {
      const e = JSON.parse((m as MessageEvent).data) as LiveEvent;
      setEvents((prev) => (prev.length && prev[prev.length - 1].seq >= e.seq ? prev : [...prev, e]));
    });
    return () => es.close();
  }, [enabled]);

  return { status, events };
}
