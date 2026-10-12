"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { AgentEvent } from "./types";

/**
 * Live agent events for a run: loads the backlog, then streams new INSERTs
 * over Supabase Realtime. This is the drop-in replacement for the mock replay —
 * feed the resulting events into the same stage/log components.
 */
export function useAgentEvents(runId: string): AgentEvent[] {
  const [events, setEvents] = useState<AgentEvent[]>([]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !runId) return;
    let active = true;

    sb.from("agent_events")
      .select("*")
      .eq("run_id", runId)
      .order("seq", { ascending: true })
      .then(({ data }) => {
        if (active && data) setEvents(data as unknown as AgentEvent[]);
      });

    const channel = sb
      .channel(`run:${runId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_events", filter: `run_id=eq.${runId}` },
        (payload) => setEvents((prev) => [...prev, payload.new as unknown as AgentEvent]),
      )
      .subscribe();

    return () => {
      active = false;
      sb.removeChannel(channel);
    };
  }, [runId]);

  return events;
}
