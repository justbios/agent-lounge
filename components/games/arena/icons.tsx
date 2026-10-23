import { createElement } from "react";
import {
  Activity,
  Bandage,
  BrickWall,
  Brain,
  Bug,
  ClipboardList,
  Cloud,
  Coins,
  Compass,
  Crosshair,
  Crown,
  Eye,
  GitFork,
  GitPullRequest,
  HeartPulse,
  Keyboard,
  type LucideIcon,
  Map as MapIcon,
  Plane,
  Rocket,
  ScanSearch,
  Server,
  ServerCog,
  Shield,
  Sparkles,
  Swords,
  Users,
  UsersRound,
  Wrench,
} from "lucide-react";
import { isLeaderKind, kindOf } from "@/lib/arena/content";

/** Each skill's picture on its button and in the log. */
const SKILLS: Record<string, LucideIcon> = {
  refactor: Wrench,
  findBug: Bug,
  requestChanges: GitPullRequest,
  firewall: BrickWall,
  plan: MapIcon,
  deepSearch: ScanSearch,
  fridayDeploy: Rocket,
  hotfix: Bandage,
  ultrathink: Brain,
  subagents: UsersRound,
  cloudTask: Cloud,
  millionTokens: Coins,
  autopilot: Plane,
  tabTab: Keyboard,
  fork: GitFork,
  quake: Activity,
};

/** Each class's badge on its portrait and card. */
const KINDS: Record<string, LucideIcon> = {
  coder: Swords,
  tester: Crosshair,
  reviewer: Eye,
  guardian: Shield,
  planner: ClipboardList,
  scout: Compass,
  devops: ServerCog,
  debugger: HeartPulse,
  subagent: Users,
  prod: Server,
};

function kindIcon(kind: string): LucideIcon {
  if (KINDS[kind]) return KINDS[kind];
  if (isLeaderKind(kind)) return Crown;
  return kindOf(kind)?.bug ? Bug : Sparkles;
}

/** A skill's picture. */
export function SkillIcon({ id, size }: { id: string; size: number }) {
  return createElement(SKILLS[id] ?? Sparkles, { size });
}

/** A class's badge: a crown for a leader, a bug for a bug. */
export function KindIcon({ kind, size }: { kind: string; size: number }) {
  return createElement(kindIcon(kind), { size });
}
