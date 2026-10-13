"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ChatMsg, cleanMsgs, markRead, mergeMsgs, useReadUpTo } from "./chat";
import { Social } from "./useSocial";

const REFRESH_MS = 60 * 1000;
const NONE: ChatMsg[] = [];

export type SendResult = "ok" | "fast" | "fail";

export interface Chat {
  /** the café has a chat at all: a hosted one, opened by key or view link */
  on: boolean;
  msgs: ChatMsg[];
  unread: number;
  error: boolean;
  canWrite: boolean;
  send: (author: string, body: string) => Promise<SendResult>;
}

/**
 * The café's group chat. Messages live in Relay under the room; a new one pings the social channel and every open page
 * reads them again from Relay, so a forged broadcast can never put words in someone's mouth.
 */
export function useChat({
  cloud,
  key,
  room,
  social,
  open,
}: {
  cloud: boolean;
  key: string | null;
  room: string | null;
  social: Social;
  open: boolean;
}): Chat {
  const id = room ? `v:${room}` : key ? `k:${key}` : null;
  const slot = id ? id.slice(0, 14) : null;
  const on = cloud && !!id && !!supabase;
  const [state, setState] = useState<{ id: string | null; msgs: ChatMsg[]; error: boolean }>({
    id: null,
    msgs: [],
    error: false,
  });
  const upTo = useReadUpTo(slot);
  const { bus } = social;

  useEffect(() => {
    const sb = supabase;
    if (!on || !sb) return;
    let live = true;
    const load = async () => {
      const { data, error } = room
        ? await sb.rpc("relay_chat_room", { p_room: room })
        : await sb.rpc("relay_chat_get", { p_key: key });
      if (!live) return;
      setState((s) => {
        const base = s.id === id ? s.msgs : [];
        return { id, msgs: error ? base : mergeMsgs(base, cleanMsgs(data)), error: !!error };
      });
    };
    const refresh = () => document.visibilityState === "visible" && void load();
    void load();
    const off = bus.on("chat", () => void load());
    const t = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      live = false;
      off();
      clearInterval(t);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [on, id, key, room, bus]);

  const msgs = state.id === id ? state.msgs : NONE;
  const last = msgs.length ? msgs[msgs.length - 1].id : 0;
  const loaded = state.id === id && !state.error;

  useEffect(() => {
    if (slot && loaded && (open || upTo == null)) markRead(slot, last);
  }, [slot, loaded, open, upTo, last]);

  const send = useCallback(
    async (author: string, body: string): Promise<SendResult> => {
      const sb = supabase;
      if (!on || !sb || !key || room) return "fail";
      const { data, error } = await sb.rpc("relay_chat_add", { p_key: key, p_author: author, p_body: body });
      if (error) return /too fast/.test(error.message) ? "fast" : "fail";
      const sent = cleanMsgs([data]);
      setState((s) => (s.id === id ? { ...s, msgs: mergeMsgs(s.msgs, sent) } : s));
      if (slot && sent[0]) markRead(slot, sent[0].id);
      return "ok";
    },
    [on, key, room, id, slot],
  );

  const unread = upTo == null || open ? 0 : msgs.filter((m) => m.id > upTo).length;
  return { on, msgs, unread, error: state.id === id && state.error, canWrite: on && !!key && !room, send };
}
