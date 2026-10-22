import type { RealtimeChannel } from "@supabase/supabase-js";

/** Broadcast events the café's social channel carries; anything else on it is ignored. */
export const BUS_EVENTS = ["react", "bet", "duel", "ttt", "chk", "chess", "four", "chat", "juke"] as const;
export type BusEvent = (typeof BUS_EVENTS)[number];

type Listener = (payload: unknown, mine: boolean) => void;

/**
 * One tab's end of the social channel. What this tab sends reaches its own listeners straight away, then everyone
 * else through Realtime; with no channel (a local Agent Lounge) it stays in the tab.
 */
export class Bus {
  private listeners = new Map<BusEvent, Set<Listener>>();
  private channel: RealtimeChannel | null = null;

  attach(c: RealtimeChannel | null) {
    this.channel = c;
  }

  get online(): boolean {
    return this.channel != null;
  }

  on(event: BusEvent, fn: Listener): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  emit(event: BusEvent, payload: unknown, mine = false) {
    this.listeners.get(event)?.forEach((fn) => fn(payload, mine));
  }

  send(event: BusEvent, payload: Record<string, unknown>) {
    this.emit(event, payload, true);
    this.channel?.send({ type: "broadcast", event, payload });
  }
}
