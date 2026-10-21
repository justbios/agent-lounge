import type { Two, Ui } from "./i18n";
import type { Usage } from "./live/types";

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

/** How full an agent's context was from `ts` on, 0–1. */
export interface PotLevel {
  ts: number;
  fill: number;
}

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
  /** live only: what the café's names and looks hang on, the agent's type, so it keeps them at any desk and in any chat */
  key?: string;
  /** live only: the second or third agent of one type working at once */
  twin?: number;
  /** live only: the context over time, shown as the coffee pot on the desk */
  pot?: PotLevel[];
  /** live only: the context window's size, as the status line said or guessed from how much was used */
  ctxSize?: number;
  /** live only: the tokens by kind, and what they would cost on the API */
  usage?: Usage;
  cost?: number;
  /** some tokens came without their model (relay.sh before 8), so `cost` covers only the rest */
  costPart?: boolean;
  /** the model of the latest reply */
  model?: string;
  /** live only: the desk that handed this agent its latest task */
  parent?: number;
}

/** A demo agent with its words in both languages: its role, what it works on, what it says when it hands over. */
export interface DemoAgent extends Omit<AgentDef, "role" | "work" | "handoff"> {
  role: Two;
  work: Two;
  handoff: Two;
}

/** A demo agent as the viewer reads it. */
export const demoAgent = (a: DemoAgent, ui: Ui): AgentDef => ({ ...a, role: a.role[ui], work: a.work[ui], handoff: a.handoff[ui] });

/**
 * The default demo pipeline. In production the agent list comes from the run's
 * events (name, role, color, order), not from this constant — everything that
 * renders reads `run.agents`, so any names / any count arrange themselves.
 */
export const DEMO_AGENTS: DemoAgent[] = [
  { id: "intake", name: "Intake", role: { uk: "збирає запит", en: "gathers the request" }, color: "#38bdf8", icon: "inbox", workMs: 1500, tool: "parse_brief", work: { uk: "розбирає бриф користувача", en: "reading the user's brief" }, handoff: { uk: "передає завдання", en: "passing the task" }, tokens: 420 },
  { id: "research", name: "Research", role: { uk: "шукає контекст", en: "finds context" }, color: "#22d3ee", icon: "search", workMs: 2300, tool: "web_search", work: { uk: "шукає джерела й приклади", en: "looking for sources and examples" }, handoff: { uk: "віддає знахідки", en: "handing over findings" }, tokens: 1180 },
  { id: "planner", name: "Planner", role: { uk: "будує план", en: "builds the plan" }, color: "#818cf8", icon: "clipboard", workMs: 1900, tool: "write_plan", work: { uk: "складає покроковий план", en: "drafting a step-by-step plan" }, handoff: { uk: "передає план", en: "passing the plan" }, tokens: 860 },
  { id: "architect", name: "Architect", role: { uk: "проектує", en: "designs" }, color: "#a78bfa", icon: "network", workMs: 2100, tool: "design_schema", work: { uk: "проектує схему й модулі", en: "designing the schema and modules" }, handoff: { uk: "віддає архітектуру", en: "handing over the architecture" }, tokens: 940 },
  { id: "coder", name: "Coder", role: { uk: "пише код", en: "writes code" }, color: "#34d399", icon: "code", workMs: 3300, tool: "edit_file", work: { uk: "пише і рефакторить код", en: "writing and refactoring code" }, handoff: { uk: "здає pull request", en: "submitting a pull request" }, tokens: 3120 },
  { id: "reviewer", name: "Reviewer", role: { uk: "рев’ю коду", en: "code review" }, color: "#fbbf24", icon: "eye", workMs: 2000, tool: "run_review", work: { uk: "рев’ює зміни, шукає баги", en: "reviewing changes, hunting bugs" }, handoff: { uk: "схвалює зміни", en: "approving the changes" }, tokens: 1040 },
  { id: "tester", name: "Tester", role: { uk: "тестує", en: "tests" }, color: "#f472b6", icon: "flask", workMs: 2500, tool: "run_tests", work: { uk: "ганяє тести, збирає звіт", en: "running tests, writing a report" }, handoff: { uk: "віддає зелений білд", en: "handing over a green build" }, tokens: 780 },
  { id: "deployer", name: "Deployer", role: { uk: "деплой", en: "deploy" }, color: "#fb923c", icon: "rocket", workMs: 1600, tool: "deploy", work: { uk: "викочує реліз на прод", en: "shipping the release to prod" }, handoff: { uk: "готово", en: "done" }, tokens: 520 },
];

export const AGENTS: AgentDef[] = DEMO_AGENTS.map((a) => demoAgent(a, "uk"));
