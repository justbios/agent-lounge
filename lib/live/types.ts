export type LiveKind =
  | "prompt"
  | "tool"
  | "fail"
  | "dispatch"
  | "sub_start"
  | "sub_stop"
  | "stop"
  | "notify"
  | "session_end"
  | "roster"
  /** a tool Claude asked about went through: you answered; nothing to show, it only clears «чекає на тебе» */
  | "answered";

/** The coding agent a chat runs in when it isn't Claude Code, which has none (`lib/live/source.ts`). */
export type AgentSrc = "codex" | "copilot" | "gemini" | "opencode" | "cursor";

/** Tokens one report adds: fresh input, cache writes, cache reads and output. */
export interface Usage {
  in: number;
  cw: number;
  cr: number;
  out: number;
}

export interface LimitWindow {
  /** share of the window already used, 0–100 */
  pct: number;
  /** when the window resets, epoch seconds */
  reset: number;
}

/** How full a chat's context is: the last reply's whole input in tokens, and the window when the status line said. */
export interface ContextFill {
  used: number;
  /** 200k, or 1M for models with the long window */
  size?: number;
}

/** The subscription's usage limits as Claude Code's status line last saw them; `at` is epoch seconds. */
export interface Limits {
  at: number;
  five?: LimitWindow;
  week?: LimitWindow;
}

/** What an agent is doing in words anyone follows; the page puts it in the viewer's language (`lib/live/speech.ts`). */
export interface Say {
  /** the action: "edit", "test", "commit", "task_look", … */
  a: string;
  /** what kind of thing it works on: "screen", "test", "db", … */
  k?: string;
  /** its name, a search phrase or a site */
  o?: string;
}

/**
 * What Claude itself said about its whole job in a check-in line, `⏱ 95m · 6/10 · QA on iOS`: the minutes until all
 * of it is done, rounds it hasn't started yet included, how far it has got, and what runs now.
 */
export interface Checkin {
  /** when Claude wrote the line, ms since epoch */
  at: number;
  /** ms left by Claude's own estimate; 0 means the job is done */
  left: number;
  done?: number;
  total?: number;
  now?: string;
}

/** One Claude Code hook call, boiled down to what the café shows. */
export interface LiveEvent {
  seq: number;
  /** server receive time, ms since epoch */
  at: number;
  session: string;
  cwd?: string;
  kind: LiveKind;
  /** subagent instance id; absent for the main session */
  agent?: string;
  agentType?: string;
  tool?: string;
  text?: string;
  say?: Say;
  /** `text` as its parts, for the café's own lines: technical mode shows them in the viewer's language */
  tech?: Say;
  /** dispatch only: the subagent type being launched */
  target?: string;
  /** TodoWrite: how much of the agent's whole task list is done; counts only, the steps' words never leave the hook */
  todo?: { done: number; total: number };
  /** TaskCreate and TaskUpdate change the list one step at a time: a step added, finished or dropped */
  todoStep?: "add" | "done" | "drop";
  /** roster only: agent names from the project's .claude/agents */
  agents?: string[];
  /** notify only: a permission prompt, or Claude idling until you write */
  need?: "permission" | "input";
  /** notify only: Claude Code's own words when the café has no phrase for them; shown in the event log alone */
  message?: string;
  /** team café: whose Claude this is, from the hook URL's &m= */
  member?: string;
  /** the chat's name in Claude Code, sent with prompts, answers and notifications */
  title?: string;
  /** answers, finished subagents and closed chats: the tokens spent since the last report */
  usage?: Usage;
  /** with `usage`: the model of the last reply those tokens came from (relay.sh 8), to price them */
  model?: string;
  /** answers and finished subagents: how full the context was after the last reply */
  ctx?: ContextFill;
  /** roster only: Claude Code has just compacted the chat */
  compact?: boolean;
  /** prompts and answers: the 5-hour and weekly limits, when the status line has seen them */
  limits?: Limits;
  /** the main chat's latest check-in line, sent once after Claude writes it */
  checkin?: Checkin;
  /** a turn that broke off instead of finishing: "rate_limit", "overloaded", "server_error", … */
  err?: string;
  /** the relay.sh version that sent it; absent from older installs and from the bare curl hooks before relay.sh */
  hv?: number;
  /** Claude Code's own HTTP hook sent it, with no script: no chat names, tokens or limits ride along */
  via?: "http";
  /** another coding agent sent it through the same hooks: Codex, Copilot, Gemini, OpenCode or Cursor */
  src?: AgentSrc;
}

