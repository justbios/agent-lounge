// Plays a few hundred battles bot against bot and checks the rules hold: every battle ends, nobody shares a hex,
// health stays in bounds, and replaying the same commands gives the same battle. Prints how the sides fared.
// node --import ./scripts/ts-resolve.mjs scripts/arena-check.mjs [battles]
import assert from "node:assert/strict";
import { AGENT_KINDS, BUG_KINDS, LEADER_KINDS } from "../lib/arena/content.ts";
import { apply, options, startBattle } from "../lib/arena/rules.ts";
import { decide } from "../lib/arena/ai.ts";
import { Dice } from "../lib/arena/rng.ts";
import { SPRINT, scenarioSetup } from "../lib/arena/scenarios.ts";
import { NET_LEVEL, netGame, replay as replayNet, seatOf, squadFor } from "../lib/arena/net.ts";

const N = Number(process.argv[2] ?? 200);
const fighter = (k, level, leader = false) => ({ kind: k.id, name: k.name.en, body: k.body, color: "#8af", level, leader });

function check(b) {
  const seen = new Set();
  for (const u of b.units) {
    if (u.dead) {
      assert.equal(u.hp, 0, `dead ${u.name} has hp`);
      continue;
    }
    assert.ok(u.hp > 0 && u.hp <= u.maxHp, `${u.name} hp ${u.hp}/${u.maxHp}`);
    assert.ok(!seen.has(u.hex), `two units on hex ${u.hex}`);
    assert.ok(!b.rocks.includes(u.hex), `${u.name} on a rock`);
    seen.add(u.hex);
  }
  if (b.winner == null) {
    assert.ok(b.active != null, "no one to act");
    assert.ok(!b.units[b.active].dead, "a dead unit acts");
  }
}

function play(setup, levels, pick) {
  let { battle } = startBattle(setup);
  const cmds = [];
  let steps = 0;
  while (battle.winner == null) {
    assert.ok(++steps < 600, `battle ${setup.id} does not end`);
    const team = battle.units[battle.active].team;
    const cmd = pick ? pick(battle) : decide(battle, levels[team]);
    const r = apply(battle, cmd);
    assert.ok(r, `${setup.id}: refused ${JSON.stringify(cmd)}`);
    battle = r.battle;
    cmds.push(cmd);
    check(battle);
  }
  return { battle, cmds };
}

function replay(setup, cmds) {
  let { battle } = startBattle(setup);
  for (const c of cmds) battle = apply(battle, c).battle;
  return battle;
}

const dice = new Dice(7);
const pickN = (list, n) => Array.from({ length: n }, () => list[dice.int(0, list.length - 1)]);
const stats = { pvp: [0, 0, 0], bugs: [0, 0, 0], rounds: 0, capped: 0, ults: 0 };
const kindWins = new Map();
const t0 = Date.now();

for (let i = 0; i < N; i++) {
  const lead = () => fighter(LEADER_KINDS[dice.int(0, LEADER_KINDS.length - 1)], 3, true);
  const a = [lead(), ...pickN(AGENT_KINDS, 3).map((k) => fighter(k, 3))];
  const b = i % 2 ? [lead(), ...pickN(AGENT_KINDS, 3).map((k) => fighter(k, 3))] : pickN(BUG_KINDS.filter((k) => k.id !== "monolith" && k.id !== "leaklet"), 5).map((k) => fighter(k, 3));
  const setup = { id: `check-${i}`, teams: [a, b] };
  const { battle, cmds } = play(setup, ["normal", "normal"]);
  assert.deepEqual(replay(setup, cmds), battle, `replay of ${setup.id} differs`);
  stats[i % 2 ? "pvp" : "bugs"][battle.winner === "draw" ? 2 : battle.winner]++;
  stats.rounds += battle.round;
  if (battle.round > 12) stats.capped++;
  stats.ults += cmds.filter((c) => c.t === "ult").length;
  if (i % 2) for (const u of battle.units.filter((x) => !x.summoned)) {
    const w = kindWins.get(u.kind) ?? [0, 0];
    w[0] += battle.winner === u.team ? 1 : 0;
    w[1] += 1;
    kindWins.set(u.kind, w);
  }
}

// random legal commands: the rules must take any of them
for (let i = 0; i < Math.ceil(N / 4); i++) {
  const sq = () => [fighter(LEADER_KINDS[i % 6], 2, true), ...pickN([...AGENT_KINDS, ...BUG_KINDS], 4).map((k) => fighter(k, 2))];
  const setup = { id: `fuzz-${i}`, teams: [sq(), sq()] };
  play(setup, null, (b) => {
    const o = options(b);
    const all = [{ t: "defend" }, ...(o.canWait ? [{ t: "wait" }] : [])];
    for (const to of o.moves.keys()) all.push({ t: "move", to });
    for (const [target, from] of o.melee) for (const h of from) all.push({ t: "attack", target, from: h });
    for (const target of o.shots) all.push({ t: "attack", target });
    for (const c of [o.skill, o.ult]) if (c?.ready) for (const [at, from] of c.targets) {
      const t = c === o.ult ? "ult" : "skill";
      all.push(from && t === "skill" ? { t, at, from: from[0] } : { t, at });
    }
    return all[dice.int(0, all.length - 1)];
  });
}

console.log(`${N} bot battles + ${Math.ceil(N / 4)} random ones in ${Date.now() - t0} ms`);
console.log(`agents v agents: left ${stats.pvp[0]}, right ${stats.pvp[1]}, draws ${stats.pvp[2]}`);
console.log(`agents v bugs: agents ${stats.bugs[0]}, bugs ${stats.bugs[1]}, draws ${stats.bugs[2]}`);
console.log(`${(stats.rounds / N).toFixed(1)} rounds on average, ${stats.capped} ran out of rounds; ${stats.ults} ultimates`);
console.log([...kindWins].map(([k, [w, n]]) => `${k} ${Math.round((100 * w) / n)}% (${n})`).join(", "));

// the sprint, played by the bot for a squad of a leader and four classes: the first battles should be easy, the
// monolith not
const squad = ["claude", "coder", "tester", "guardian", "debugger"].map((id, i) => {
  const k = [...LEADER_KINDS, ...AGENT_KINDS].find((x) => x.id === id);
  return fighter(k, 3, i === 0);
});
const tries = Number(process.env.TRIES ?? Math.max(10, Math.ceil(N / 8)));
for (const sc of SPRINT) {
  let won = 0;
  let rounds = 0;
  for (let i = 0; i < tries; i++) {
    const setup = scenarioSetup(sc, squad, `${sc.id}-${i}`);
    const { battle, cmds } = play(setup, ["normal", "normal"]);
    assert.deepEqual(replay(setup, cmds), battle, `replay of ${setup.id} differs`);
    won += battle.winner === 0 ? 1 : 0;
    rounds += battle.round;
  }
  console.log(`${sc.id}: the squad wins ${Math.round((100 * won) / tries)}%, ${(rounds / tries).toFixed(1)} rounds`);
}

// battles between two people: only their commands travel, so replaying those, the bot's turns played in between, must
// give the very same battle; and a raid of two squads of three against the monolith should be a fight, not a walkover
for (const kind of ["arena", "raid"]) {
  const won = [0, 0, 0];
  let rounds = 0;
  for (let i = 0; i < tries; i++) {
    const sq = () => [fighter(LEADER_KINDS[dice.int(0, LEADER_KINDS.length - 1)], 3, true), ...pickN(AGENT_KINDS, 4).map((k) => fighter(k, 3))];
    const g = netGame(kind, `${kind}-${i}`, squadFor(kind, sq()), squadFor(kind, sq()));
    let { battle } = startBattle(g.setup);
    const moves = [];
    while (battle.winner == null) {
      const seat = seatOf(g, battle, battle.active);
      const cmd = decide(battle, seat === "bot" ? NET_LEVEL : "normal");
      if (seat !== "bot") moves.push(cmd);
      battle = apply(battle, cmd).battle;
    }
    const r = replayNet(g, moves);
    assert.ok(r && r.used === moves.length, `${g.setup.id}: replay refused a command`);
    assert.deepEqual(r.battle, battle, `replay of ${g.setup.id} differs`);
    const half = replayNet(g, moves.slice(0, moves.length >> 1));
    assert.ok(half && seatOf(g, half.battle, half.battle.active) !== "bot", `${g.setup.id}: a cut replay stops on the bot`);
    won[battle.winner === "draw" ? 2 : battle.winner]++;
    rounds += battle.round;
  }
  console.log(`${kind}: left ${Math.round((100 * won[0]) / tries)}%, right ${Math.round((100 * won[1]) / tries)}%, ${(rounds / tries).toFixed(1)} rounds`);
}
