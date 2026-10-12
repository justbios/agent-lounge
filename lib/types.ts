export type AgentEventType =
  | "start"
  | "thinking"
  | "tool_call"
  | "handoff"
  | "complete"
  | "error";

export interface AgentEvent {
  id: string;
  run_id: string;
  seq: number;
  /** milliseconds from run start. In Postgres this maps to a timestamptz column. */
  ts: number;
  agent_id: string;
  agent_role?: string;
  type: AgentEventType;
  from_agent?: string;
  to_agent?: string;
  payload?: {
    label?: string;
    summary?: string;
    tool?: string;
    tokens?: number;
  };
}

export type IconKey =
  | "inbox"
  | "search"
  | "clipboard"
  | "network"
  | "code"
  | "eye"
  | "flask"
  | "rocket"
  | "bot"
  | "cpu";

export interface AgentDef {
  id: string;
  name: string;
  role: string;
  /** hex accent, tuned for a dark canvas */
  color: string;
  icon: IconKey;
  /** replay/demo metadata — optional; sensible defaults are used when absent */
  workMs?: number;
  tool?: string;
  work?: string;
  handoff?: string;
  tokens?: number;
  /** index into the café's character looks; live agents keep the same face per agent type */
  look?: number;
}

/**
 * The default demo pipeline. In production the agent list comes from the run's
 * events (name, role, color, order), not from this constant — everything that
 * renders reads `run.agents`, so any names / any count arrange themselves.
 */
export const AGENTS: AgentDef[] = [
  { id: "intake", name: "Intake", role: "збирає запит", color: "#38bdf8", icon: "inbox", workMs: 1500, tool: "parse_brief", work: "розбирає бриф користувача", handoff: "передає завдання", tokens: 420 },
  { id: "research", name: "Research", role: "шукає контекст", color: "#22d3ee", icon: "search", workMs: 2300, tool: "web_search", work: "шукає джерела й приклади", handoff: "віддає знахідки", tokens: 1180 },
  { id: "planner", name: "Planner", role: "будує план", color: "#818cf8", icon: "clipboard", workMs: 1900, tool: "write_plan", work: "складає покроковий план", handoff: "передає план", tokens: 860 },
  { id: "architect", name: "Architect", role: "проектує", color: "#a78bfa", icon: "network", workMs: 2100, tool: "design_schema", work: "проектує схему й модулі", handoff: "віддає архітектуру", tokens: 940 },
  { id: "coder", name: "Coder", role: "пише код", color: "#34d399", icon: "code", workMs: 3300, tool: "edit_file", work: "пише і рефакторить код", handoff: "здає pull request", tokens: 3120 },
  { id: "reviewer", name: "Reviewer", role: "рев’ю коду", color: "#fbbf24", icon: "eye", workMs: 2000, tool: "run_review", work: "рев’ює зміни, шукає баги", handoff: "схвалює зміни", tokens: 1040 },
  { id: "tester", name: "Tester", role: "тестує", color: "#f472b6", icon: "flask", workMs: 2500, tool: "run_tests", work: "ганяє тести, збирає звіт", handoff: "віддає зелений білд", tokens: 780 },
  { id: "deployer", name: "Deployer", role: "деплой", color: "#fb923c", icon: "rocket", workMs: 1600, tool: "deploy", work: "викочує реліз на прод", handoff: "готово", tokens: 520 },
];
