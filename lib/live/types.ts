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
  | "roster";

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

/** The subscription's usage limits as Claude Code's status line last saw them; `at` is epoch seconds. */
export interface Limits {
  at: number;
  five?: LimitWindow;
  week?: LimitWindow;
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
  /** dispatch only: the subagent type being launched */
  target?: string;
  /** roster only: agent names from the project's .claude/agents */
  agents?: string[];
  /** notify only: a permission prompt, or Claude idling until you write */
  need?: "permission" | "input";
  /** team café: whose Claude this is, from the hook URL's &m= */
  member?: string;
  /** the chat's name in Claude Code, sent with prompts, answers and notifications */
  title?: string;
  /** answers, finished subagents and closed chats: the tokens spent since the last report */
  usage?: Usage;
  /** prompts and answers: the 5-hour and weekly limits, when the status line has seen them */
  limits?: Limits;
}

