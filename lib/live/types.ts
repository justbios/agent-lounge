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
}

