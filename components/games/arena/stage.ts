import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { HEXES, type Hex } from "@/lib/arena/hex";
import { Dice, seedOf } from "@/lib/arena/rng";
import type { Battle, Beat, Strike, Team, Unit } from "@/lib/arena/types";
import { sfx } from "@/lib/live/sfx";
import { type Figure, disposeFigure, makeFigure } from "./figures";
import { type Missile, Numbers, Particles, fly, ring } from "./fx3d";
import { HALF_D, HALF_W, R, TOP, facing, hexAtXZ, hexXZ } from "./geo";
import { lookOf } from "./portraits";
import { PLACES, type Place, type PlaceId, Weather, dress, skyTexture, tileTexture } from "./scenery";
import { Clock, backOut, easeIn, easeInOut, easeOut } from "./tween";

/*
 * The battlefield in 3D: a board of raised hex tiles in a place of its own (scenery.ts), rocks, the fighters as
 * painted miniatures. It shows a battle and plays its beats one after another (a walk, a swing, a shot, a spell, the
 * numbers), and tells the screen around it which hex the pointer is over. It knows nothing of the rules.
 */

export interface Words {
  miss: string;
  saved: string;
  wait: string;
  defend: string;
  stunned: string;
}

export interface StageOptions {
  host: HTMLElement;
  words: Words;
  /** the two sides' colours: their rings, banners and health bars */
  colors: [string, string];
  /** `sx`, `sy`: the pointer on the canvas, px */
  onHover(h: Hex | null, x: number, z: number, sx: number, sy: number): void;
  onClick(h: Hex | null, x: number, z: number, right: boolean, sx: number, sy: number): void;
}

/** What the screen wants shown on the board right now. */
export interface Marks {
  moves?: Hex[];
  path?: Hex[];
  foes?: Hex[];
  friends?: Hex[];
  area?: Hex[];
  from?: Hex | null;
  hover?: Hex | null;
}

interface View {
  id: number;
  team: Team;
  kind: string;
  body: string;
  fig: Figure;
  /** how much bigger than its model it stands: a tactics game's fighters fill their hexes */
  size: number;
  hex: Hex;
  x: number;
  z: number;
  y: number;
  hp: number;
  max: number;
  max0: number;
  shield: number;
  dead: boolean;
  face: number;
  phase: number;
  lunge: number;
  lean: number;
  swingR: number;
  swingL: number;
  raise: number;
  hop: number;
  flash: number;
  tint: THREE.Color;
  fall: number;
  fade: number;
  grow: number;
  shake: number;
  label: HTMLDivElement;
  bar: HTMLElement;
  /** the part of the bar a blow being aimed would take */
  barHit: HTMLElement;
  barShield: HTMLElement;
  hpText: HTMLElement;
  proxy: THREE.Mesh;
  base: THREE.Mesh;
  extras: Map<string, THREE.Object3D>;
  emissive: { c: THREE.Color; i: number }[];
}

const SKILL_COLOR: Record<string, string> = {
  refactor: "#6fb7ff",
  requestChanges: "#ff5a5a",
  findBug: "#ff8a3c",
  deepSearch: "#b38cf5",
  fridayDeploy: "#ffb23a",
  firewall: "#ff7a2a",
  plan: "#ffd25a",
  hotfix: "#5fe3a1",
  ultrathink: "#c08cff",
  quake: "#ff5a2a",
  subagents: "#ff9a62",
  cloudTask: "#7ff0ff",
  millionTokens: "#5b9cf5",
  autopilot: "#a77bf3",
  tabTab: "#7fd3e6",
  fork: "#e8e2d4",
};

const MISSILES: Record<string, [Missile, string]> = {
  ranger: ["arrow", "#ffffff"],
  mage: ["bolt", "#9fd7ff"],
  healer: ["bolt", "#7dffb9"],
  engineer: ["shell", "#ff9a3c"],
  mushroom: ["spore", "#c7ff6b"],
};

// laid over the tiles half see-through, with a bright rim, so they read on grass, sand and snow alike
type MarkKind = "moves" | "path" | "foes" | "friends" | "area" | "from";
const MARK: Record<MarkKind, [fill: THREE.Color, rim: THREE.Color]> = {
  moves: [new THREE.Color("#2f6fd6"), new THREE.Color("#7fb4ff")],
  path: [new THREE.Color("#4aa8ff"), new THREE.Color("#d6ecff")],
  foes: [new THREE.Color("#d62f2f"), new THREE.Color("#ff8a7a")],
  friends: [new THREE.Color("#2fbf5a"), new THREE.Color("#8affa8")],
  area: [new THREE.Color("#e8801a"), new THREE.Color("#ffc46a")],
  from: [new THREE.Color("#e8c02a"), new THREE.Color("#fff0a0")],
};
const DANGER = { mine: new THREE.Color("#ff2a3a"), both: new THREE.Color("#ff8a1a") };
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

const WHITE = new THREE.Color(1, 1, 1);
const tmpV = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Stage {
  private readonly o: StageOptions;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
  private readonly camHome = new THREE.Vector3();
  private readonly camAt = new THREE.Vector3();
  /** the opening sweep, while it lasts: the camera comes down round the field to its place */
  private sweep: { age: number; secs: number } | null = null;
  private readonly look = new THREE.Vector3(0, 0, 0.6);
  private readonly overlay: HTMLDivElement;
  private readonly numbers: Numbers;
  private readonly fx = new Particles();
  readonly clock = new Clock();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP);
  private readonly world = new THREE.Group();
  private readonly views = new Map<number, View>();
  private marks: THREE.InstancedMesh | null = null;
  private markRims: THREE.InstancedMesh | null = null;
  private danger: THREE.InstancedMesh | null = null;
  private dangerHexes = new Map<Hex, Team | "both">();
  private readonly hoverRing: THREE.Mesh;
  private readonly activeRing: THREE.Mesh;
  private active: number | null = null;
  private raf = 0;
  private last = 0;
  private time = 0;
  private shakeAmp = 0;
  private readonly hemi = new THREE.HemisphereLight();
  private readonly sun = new THREE.DirectionalLight();
  private readonly rim = new THREE.DirectionalLight();
  private weather: Weather | null = null;
  private readonly watch: ResizeObserver;
  private width = 1;
  private height = 1;
  private disposed = false;

  constructor(o: StageOptions) {
    this.o = o;
    const small = Math.min(innerWidth, innerHeight) < 700;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // filmic rather than AgX: AgX greys the greens out, and a painted board wants them rich
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "ar-canvas";
    o.host.appendChild(this.renderer.domElement);
    this.overlay = document.createElement("div");
    this.overlay.className = "ar-overlay";
    o.host.appendChild(this.overlay);
    this.numbers = new Numbers(this.overlay);

    // the post-processing renders off screen, where the canvas's own antialiasing does not reach: smooth it there
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: small ? 2 : 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.scene.add(this.world);
    this.scene.add(this.fx.points);
    this.scene.fog = new THREE.Fog("#2c2a3a", 34, 80);
    this.camera.far = 400;
    this.setupLights(small);

    this.hoverRing = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 0.95, 6, 1, Math.PI / 6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#fff6dc", transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.hoverRing.visible = false;
    this.scene.add(this.hoverRing);
    this.activeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.8, 6, 1, Math.PI / 6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#ffd25a", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.activeRing.visible = false;
    this.scene.add(this.activeRing);

    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("click", this.onTap);
    el.addEventListener("contextmenu", this.onRight);
    this.watch = new ResizeObserver(() => this.resize());
    this.watch.observe(o.host);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  set speed(v: number) {
    this.clock.speed = v;
  }

  // ---------- the world ----------

  private setupLights(small: boolean) {
    this.scene.add(this.hemi);
    const sun = this.sun;
    sun.position.set(-9, 16, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -HALF_W - 2;
    sc.right = HALF_W + 2;
    sc.top = HALF_D + 4;
    sc.bottom = -HALF_D - 4;
    sc.near = 1;
    sc.far = 50;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.rim.position.set(8, 6, -12);
    this.scene.add(this.rim);
  }

  /** The sky, the fog and the light of a place. */
  private light(p: Place) {
    const old = this.scene.background;
    if (old instanceof THREE.Texture) old.dispose();
    this.scene.background = skyTexture(p);
    (this.scene.fog as THREE.Fog).color.set(p.fog);
    this.hemi.color.set(p.hemi[0]);
    this.hemi.groundColor.set(p.hemi[1]);
    this.hemi.intensity = p.hemi[2];
    this.sun.color.set(p.sun[0]);
    this.sun.intensity = p.sun[1];
    this.rim.color.set(p.rim[0]);
    this.rim.intensity = p.rim[1];
    this.renderer.toneMappingExposure = p.exposure;
  }

  private buildBoard(b: Battle, p: Place) {
    const dice = new Dice(seedOf(`${b.id}:look`));
    const c = new THREE.Color();
    dress(this.world, p, dice);

    // the tiles: one hex prism each, grass on top and earth down the sides
    const tileGeo = new THREE.CylinderGeometry(R * 0.955, R * 0.99, TOP, 6);
    tileGeo.translate(0, TOP / 2, 0);
    const top = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.92, map: tileTexture(p.grain) });
    const side = new THREE.MeshStandardMaterial({ color: p.earth, roughness: 1 });
    const tiles = new THREE.InstancedMesh(tileGeo, [side, top, side], HEXES);
    const m = new THREE.Matrix4();
    const lo = new THREE.Color(p.tiles[0]);
    const hi = new THREE.Color(p.tiles[1]);
    const bare = new THREE.Color(p.bare[0]);
    for (let h = 0; h < HEXES; h++) {
      const [x, z] = hexXZ(h);
      m.makeTranslation(x, (dice.next() - 0.5) * 0.012, z);
      tiles.setMatrixAt(h, m);
      const v = dice.next();
      if (dice.chance(p.bare[1])) c.copy(bare).multiplyScalar(0.9 + v * 0.2);
      else c.copy(lo).lerp(hi, v);
      tiles.setColorAt(h, c);
    }
    tiles.receiveShadow = true;
    tiles.castShadow = true;
    this.world.add(tiles);

    // the marks over the tiles: what can be reached, hit, aimed at; an unmarked hex has its mark shrunk to nothing
    const flat = new THREE.CircleGeometry(R * 0.86, 6).rotateX(-Math.PI / 2).rotateY(Math.PI / 6);
    const edge = new THREE.RingGeometry(R * 0.74, R * 0.86, 6, 1, Math.PI / 6).rotateX(-Math.PI / 2);
    const markMat = (opacity: number) =>
      new THREE.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false, toneMapped: false });
    this.marks = new THREE.InstancedMesh(flat, markMat(0.26), HEXES);
    this.markRims = new THREE.InstancedMesh(edge, markMat(0.9), HEXES);
    this.danger = new THREE.InstancedMesh(flat, markMat(0.5), HEXES);
    for (const mesh of [this.marks, this.markRims, this.danger]) {
      for (let h = 0; h < HEXES; h++) {
        mesh.setMatrixAt(h, HIDDEN);
        mesh.setColorAt(h, WHITE);
      }
      // its bounds would be worked out once, from marks shrunk to nothing, and it would never be drawn again
      mesh.frustumCulled = false;
    }
    this.marks.renderOrder = 1;
    this.markRims.renderOrder = 2;
    this.danger.renderOrder = 1;
    this.world.add(this.marks, this.markRims, this.danger);

    // rocks on the blocked hexes
    const stone = new THREE.MeshStandardMaterial({ color: p.stone[0], roughness: 0.95, flatShading: true });
    const moss = new THREE.MeshStandardMaterial({ color: p.stone[1], roughness: 1, flatShading: true });
    for (const h of b.rocks) {
      const [x, z] = hexXZ(h);
      const n = 2 + dice.int(0, 2);
      for (let i = 0; i < n; i++) {
        const geo = new THREE.DodecahedronGeometry(0.3 + dice.next() * 0.32, 0);
        const p = geo.getAttribute("position");
        // each corner is shared by three faces stored apart: move it by its place, not per copy, or the faces split
        const salt = dice.next() * 100;
        const bump = (x: number, y: number, z: number) => {
          const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + salt) * 43758.5453;
          return v - Math.floor(v);
        };
        for (let k = 0; k < p.count; k++) {
          const [x, y, z] = [p.getX(k), p.getY(k), p.getZ(k)];
          const f = 0.78 + bump(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100)) * 0.44;
          p.setXYZ(k, x * f, y * f * 0.85, z * f);
        }
        geo.computeVertexNormals();
        const rock = new THREE.Mesh(geo, i === 0 && dice.chance(0.5) ? moss : stone);
        const a = dice.next() * Math.PI * 2;
        const r = i === 0 ? 0 : 0.35 + dice.next() * 0.2;
        rock.position.set(x + Math.cos(a) * r, TOP + 0.15 + (i === 0 ? 0.15 : 0), z + Math.sin(a) * r);
        rock.rotation.set(dice.next() * 3, dice.next() * 3, dice.next() * 3);
        rock.castShadow = true;
        rock.receiveShadow = true;
        this.world.add(rock);
      }
    }

    // two banners with torches on each side
    const bark = new THREE.MeshStandardMaterial({ color: "#4a3020", roughness: 1, flatShading: true });
    for (const team of [0, 1] as Team[]) {
      const sideX = (team === 0 ? -1 : 1) * (HALF_W + 0.6);
      for (const z of [-HALF_D + 1.2, HALF_D - 1.6]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 6), bark);
        pole.position.set(sideX, 1.3, z);
        const flag = new THREE.Mesh(
          new THREE.PlaneGeometry(0.9, 0.6),
          new THREE.MeshStandardMaterial({ color: this.o.colors[team], side: THREE.DoubleSide, emissive: this.o.colors[team], emissiveIntensity: 0.25 }),
        );
        flag.position.set(sideX + (team === 0 ? 0.47 : -0.47), 2.25, z);
        flag.name = "flag";
        const flame = new THREE.Mesh(
          new THREE.ConeGeometry(0.12, 0.3, 6),
          new THREE.MeshStandardMaterial({ color: "#ffb347", emissive: "#ff8a1a", emissiveIntensity: 3 }),
        );
        flame.position.set(sideX, 2.75, z);
        flame.name = "flame";
        pole.castShadow = true;
        this.world.add(pole, flag, flame);
      }
    }
  }

  // ---------- fighters ----------

  private makeView(u: Unit): View {
    const fig = makeFigure(u.body, u.color, lookOf(u));
    const team = this.o.colors[u.team];
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.56, 0.08, 24),
      new THREE.MeshStandardMaterial({ color: "#2a2430", roughness: 0.5, metalness: 0.3, emissive: team, emissiveIntensity: 0.35 }),
    );
    base.position.y = 0.04;
    base.receiveShadow = true;
    base.castShadow = true;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.53, 0.025, 6, 32).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: team, emissive: team, emissiveIntensity: 1.6 }),
    );
    rim.position.y = 0.08;
    base.add(rim);
    if (u.kind !== "monolith") fig.root.add(base);
    const size = u.kind === "monolith" ? 1.5 : 1.34;
    fig.root.scale.setScalar(size);
    const proxy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, fig.height + 0.3, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    proxy.position.y = (fig.height + 0.3) / 2;
    proxy.userData.unit = u.id;
    fig.root.add(proxy);
    fig.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o !== proxy) o.castShadow = true;
    });

    const label = document.createElement("div");
    label.className = `ar-unit ar-t${u.team}${u.leader ? " ar-lead" : ""}`;
    label.innerHTML = `<span class="ar-lv">${u.level}</span><span class="ar-bar"><i class="ar-hp"></i><i class="ar-fc"></i><i class="ar-sh"></i></span><b></b>`;
    this.overlay.appendChild(label);
    const [x, z] = hexXZ(u.hex);
    const v: View = {
      id: u.id,
      team: u.team,
      kind: u.kind,
      body: u.body,
      fig,
      size,
      hex: u.hex,
      x,
      z,
      y: 0,
      hp: u.hp,
      max: u.maxHp,
      max0: u.maxHp,
      shield: 0,
      dead: u.dead,
      face: u.team === 0 ? Math.PI / 2 : -Math.PI / 2,
      phase: (u.id * 1.37) % 6.28,
      lunge: 0,
      lean: 0,
      swingR: 0,
      swingL: 0,
      raise: 0,
      hop: 0,
      flash: 0,
      tint: new THREE.Color(1, 1, 1),
      fall: 0,
      fade: 0,
      grow: 1,
      shake: 0,
      label,
      bar: label.querySelector(".ar-hp")!,
      barHit: label.querySelector(".ar-fc")!,
      barShield: label.querySelector(".ar-sh")!,
      hpText: label.querySelector("b")!,
      proxy,
      base,
      extras: new Map(),
      emissive: fig.mats.map((m) => ({ c: m.emissive.clone(), i: m.emissiveIntensity })),
    };
    this.world.add(fig.root);
    this.views.set(u.id, v);
    this.paintBar(v);
    return v;
  }

  private dropView(v: View) {
    this.world.remove(v.fig.root);
    disposeFigure(v.fig);
    v.label.remove();
    this.views.delete(v.id);
  }

  private paintBar(v: View) {
    const k = Math.max(0, v.hp) / v.max;
    v.bar.style.width = `${k * 100}%`;
    v.bar.style.background = k > 0.5 ? "" : k > 0.25 ? "#f2b84b" : "#e5484d";
    v.barShield.style.width = `${Math.min(1, v.shield / v.max) * 100}%`;
    v.hpText.textContent = String(Math.max(0, v.hp));
    v.label.style.display = v.dead ? "none" : "";
  }

  /** Shows a battle from scratch, in its place: the board, its rocks and its fighters as they stand. */
  load(b: Battle, place: PlaceId = "meadow") {
    for (const v of [...this.views.values()]) this.dropView(v);
    this.world.clear();
    const p = PLACES[place];
    this.light(p);
    if (this.weather) {
      this.scene.remove(this.weather.points);
      this.weather.dispose();
    }
    this.weather = new Weather(p);
    this.scene.add(this.weather.points);
    this.buildBoard(b, p);
    for (const u of b.units) if (!u.dead) this.makeView(u);
    this.sync(b);
    this.fit();
  }

  /** Puts every fighter where the battle says it is, after the beats played or skipped. */
  sync(b: Battle) {
    for (const u of b.units) {
      let v = this.views.get(u.id);
      if (u.dead) {
        if (v && !v.dead) {
          v.dead = true;
          v.fall = 1;
          v.fade = 1;
        }
        if (v && v.fade >= 1) this.dropView(v);
        continue;
      }
      v ??= this.makeView(u);
      v.hex = u.hex;
      [v.x, v.z] = hexXZ(u.hex);
      v.hp = u.hp;
      v.max = u.maxHp;
      v.shield = u.statuses.find((s) => s.id === "shield")?.power ?? 0;
      v.dead = false;
      v.fall = 0;
      v.fade = 0;
      v.lunge = v.lean = v.swingR = v.swingL = v.raise = v.hop = 0;
      v.grow = u.kind === "memoryLeak" ? Math.cbrt(u.maxHp / v.max0) : 1;
      const want = new Set<string>(u.statuses.map((s) => s.id));
      if (u.defending) want.add("defending");
      for (const id of [...v.extras.keys()]) if (!want.has(id)) this.unmark(v, id);
      for (const id of want) if (!v.extras.has(id)) this.markStatus(v, id);
      this.paintBar(v);
    }
    this.dangerHexes = new Map();
    for (const s of b.strikes) this.addDanger(s);
    this.setActive(b.active);
  }

  /**
   * Shows on the health bars what a blow being aimed would take, `min` for sure and up to `max`, and marks whoever it
   * would surely kill; an empty list clears it.
   */
  forecast(list: { id: number; min: number; max: number }[]) {
    for (const v of this.views.values()) {
      const f = list.find((x) => x.id === v.id);
      v.label.classList.toggle("ar-aimed", !!f);
      v.label.classList.toggle("ar-dies", !!f && f.min >= v.hp + v.shield);
      if (!f) {
        v.barHit.style.width = "0";
        continue;
      }
      const hp = Math.max(0, v.hp);
      const take = Math.min(hp, Math.max(0, f.max - v.shield));
      v.barHit.style.left = `${((hp - take) / v.max) * 100}%`;
      v.barHit.style.width = `${(take / v.max) * 100}%`;
    }
  }

  setActive(id: number | null) {
    this.active = id;
    this.activeRing.visible = id != null && !!this.views.get(id);
  }

  // ---------- statuses on the figures ----------

  private markStatus(v: View, id: string) {
    const h = v.fig.height;
    let o: THREE.Object3D | null = null;
    const glow = (color: string, k = 1.6) =>
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, transparent: true, opacity: 0.9 });
    switch (id) {
      case "shield": {
        o = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.62 + h * 0.25, 2),
          new THREE.MeshStandardMaterial({
            color: "#7fd8ff",
            emissive: "#3aa8ff",
            emissiveIntensity: 0.9,
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
            side: THREE.DoubleSide,
            flatShading: true,
          }),
        );
        o.position.y = h * 0.5;
        sfx("shield");
        break;
      }
      case "marked": {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 24), glow("#ff4a3a", 2.4)));
        for (let i = 0; i < 4; i++) {
          const tick = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), glow("#ff4a3a", 2.4));
          const a = (i / 4) * Math.PI * 2;
          tick.position.set(Math.cos(a) * 0.27, Math.sin(a) * 0.27, 0);
          tick.rotation.z = a + Math.PI / 2;
          g.add(tick);
        }
        g.position.y = h + 0.45;
        o = g;
        break;
      }
      case "stun": {
        const g = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), glow("#ffe066", 2.5));
          const a = (i / 3) * Math.PI * 2;
          star.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3);
          g.add(star);
        }
        g.position.y = h + 0.1;
        o = g;
        break;
      }
      case "slow":
      case "hasted":
      case "inspired": {
        const color = id === "slow" ? "#4f8cff" : id === "hasted" ? "#5ff0ff" : "#ffcf4a";
        o = new THREE.Mesh(
          new THREE.RingGeometry(0.58, 0.68, 6, 1, Math.PI / 6).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        o.position.y = 0.11;
        break;
      }
      case "root": {
        const g = new THREE.Group();
        for (let i = 0; i < 7; i++) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.35, 4), glow("#6bd16b", 0.6));
          const a = (i / 7) * Math.PI * 2;
          spike.position.set(Math.cos(a) * 0.45, 0.17, Math.sin(a) * 0.45);
          spike.rotation.z = Math.cos(a) * 0.4;
          spike.rotation.x = -Math.sin(a) * 0.4;
          g.add(spike);
        }
        o = g;
        break;
      }
      case "silence": {
        const g = new THREE.Group();
        const bar = (r: number) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.05), glow("#c08cff", 2.2));
          m.rotation.z = r;
          return m;
        };
        g.add(bar(Math.PI / 4), bar(-Math.PI / 4));
        g.position.y = h + 0.42;
        o = g;
        break;
      }
      case "taunted": {
        o = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 4), glow("#ff6a3a", 2.4));
        o.rotation.x = Math.PI;
        o.position.y = h + 0.45;
        break;
      }
      case "enraged":
        v.tint.set("#ff6a5a");
        o = new THREE.Object3D();
        break;
      case "defending": {
        o = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.42, 0.6, 6, 1, true, -Math.PI / 3, (Math.PI * 2) / 3),
          new THREE.MeshStandardMaterial({
            color: "#8fc8ff",
            emissive: "#4a9cff",
            emissiveIntensity: 1.2,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        o.position.y = 0.5;
        break;
      }
    }
    if (!o) return;
    o.name = id;
    v.fig.root.add(o);
    v.extras.set(id, o);
  }

  private unmark(v: View, id: string) {
    const o = v.extras.get(id);
    if (!o) return;
    v.fig.root.remove(o);
    o.traverse((x) => {
      if (x instanceof THREE.Mesh) {
        x.geometry.dispose();
        (x.material as THREE.Material).dispose();
      }
    });
    v.extras.delete(id);
    if (id === "enraged") v.tint.set(1, 1, 1);
  }

  // ---------- marks on the board ----------

  setMarks(m: Marks) {
    const fills = this.marks;
    const rims = this.markRims;
    if (!fills || !rims) return;
    const paint = new Array<MarkKind | null>(HEXES).fill(null);
    for (const h of m.moves ?? []) paint[h] = "moves";
    for (const h of m.area ?? []) paint[h] = "area";
    for (const h of m.friends ?? []) paint[h] = "friends";
    for (const h of m.foes ?? []) paint[h] = "foes";
    for (const h of m.path ?? []) paint[h] = "path";
    if (m.from != null) paint[m.from] = "from";
    const at = new THREE.Matrix4();
    for (let h = 0; h < HEXES; h++) {
      const kind = paint[h];
      if (!kind) {
        fills.setMatrixAt(h, HIDDEN);
        rims.setMatrixAt(h, HIDDEN);
        continue;
      }
      const [x, z] = hexXZ(h);
      fills.setMatrixAt(h, at.makeTranslation(x, TOP + 0.02, z));
      rims.setMatrixAt(h, at.makeTranslation(x, TOP + 0.022, z));
      fills.setColorAt(h, MARK[kind][0]);
      rims.setColorAt(h, MARK[kind][1]);
    }
    for (const mesh of [fills, rims]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    }
    if (m.hover != null) {
      const [x, z] = hexXZ(m.hover);
      this.hoverRing.position.set(x, TOP + 0.034, z);
      this.hoverRing.visible = true;
    } else this.hoverRing.visible = false;
  }

  private addDanger(s: Strike) {
    for (const h of s.hexes) {
      const was = this.dangerHexes.get(h);
      this.dangerHexes.set(h, was != null && was !== s.team ? "both" : s.friendly ? "both" : s.team);
    }
  }

  // ---------- the loop ----------

  private frame = (t: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, this.last ? (t - this.last) / 1000 : 0.016);
    this.last = t;
    this.time += dt;
    this.clock.tick(dt);
    this.fx.update(dt * this.clock.speed);
    this.weather?.update(dt, this.time);
    for (const v of this.views.values()) this.pose(v, dt);
    this.animateWorld(dt);
    this.placeLabels();
    // the camera shakes on heavy blows and settles back
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 1.8);
    const s = this.shakeAmp * this.shakeAmp;
    const home = this.sweep ? this.swept(this.sweep, dt) : this.camHome;
    this.camera.position.set(
      home.x + (Math.random() - 0.5) * s,
      home.y + (Math.random() - 0.5) * s,
      home.z + (Math.random() - 0.5) * s * 0.5,
    );
    this.camera.lookAt(this.look);
    this.composer.render(dt);
  };

  private animateWorld(dt: number) {
    const t = this.time;
    this.world.traverse((o) => {
      if (o.name === "flame") o.scale.set(1 + Math.sin(t * 13 + o.position.x) * 0.12, 1 + Math.sin(t * 17 + o.position.z) * 0.2, 1);
      else if (o.name === "flag") o.rotation.y = Math.sin(t * 2 + o.position.z) * 0.25;
    });
    if (this.danger) {
      (this.danger.material as THREE.MeshBasicMaterial).opacity = 0.32 + Math.sin(t * 6) * 0.22;
      const at = new THREE.Matrix4();
      for (let h = 0; h < HEXES; h++) {
        const d = this.dangerHexes.get(h);
        if (d == null) {
          this.danger.setMatrixAt(h, HIDDEN);
          continue;
        }
        const [x, z] = hexXZ(h);
        this.danger.setMatrixAt(h, at.makeTranslation(x, TOP + 0.026, z));
        this.danger.setColorAt(h, d === "both" ? DANGER.both : DANGER.mine);
      }
      this.danger.instanceMatrix.needsUpdate = true;
      this.danger.instanceColor!.needsUpdate = true;
    }
    const a = this.active != null ? this.views.get(this.active) : undefined;
    if (a && !a.dead) {
      this.activeRing.visible = true;
      this.activeRing.position.set(a.x, TOP + 0.03, a.z);
      this.activeRing.scale.setScalar(1 + Math.sin(t * 4) * 0.05);
      (this.activeRing.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(t * 4) * 0.3;
    } else this.activeRing.visible = false;
    void dt;
  }

  /** Sets a figure from its pose numbers and the time: breathing, floating, leaning into a swing, falling over. */
  private pose(v: View, dt: number) {
    const f = v.fig;
    const t = this.time + v.phase;
    v.flash = Math.max(0, v.flash - dt * 6);
    v.shake = Math.max(0, v.shake - dt * 5);
    const float = f.hover ? 0.32 + Math.sin(t * 2.2) * 0.07 : 0;
    const jitter = v.shake > 0 ? Math.sin(this.time * 80) * v.shake * 0.08 : 0;
    f.root.position.set(v.x + jitter, TOP + v.y + v.hop + float - v.fall * 0.25 - v.fade * 0.4, v.z);
    f.root.rotation.y = v.face;
    f.root.rotation.x = 0;
    f.body.rotation.x = v.lean - v.fall * 1.35;
    f.body.position.z = v.lunge * 0.42;
    const breathe = v.dead ? 0 : Math.sin(t * 2.4) * 0.018;
    const g = v.grow * (v.kind === "monolith" ? 1 : 1);
    f.body.scale.set(g * (1 - breathe * 0.5), g * (1 + breathe), g * (1 - breathe * 0.5));
    f.armR.rotation.x = v.swingR - v.raise * 2.3 + Math.sin(t * 2.4) * 0.05;
    f.armL.rotation.x = v.swingL - v.raise * 2.3 - Math.sin(t * 2.4) * 0.05;
    f.armR.rotation.z = v.raise * 0.35;
    f.armL.rotation.z = -v.raise * 0.35;
    // a ghost's sheet and the tentacles sway, the boss's shards circle
    f.body.traverse((o) => {
      if (o.name.startsWith("tentacle")) o.rotation.y = Math.sin(t * 2 + o.id) * 0.4;
      else if (o.name.startsWith("shard")) {
        const i = Number(o.name.slice(5));
        const a = t * 0.6 + (i * Math.PI) / 2;
        o.position.set(Math.cos(a) * 0.95, 1.4 + Math.sin(t * 1.3 + i) * 0.2, Math.sin(a) * 0.95);
        o.rotation.y += dt;
      } else if (o.name === "wingR" || o.name === "wingL") o.rotation.y = Math.sin(t * 14) * 0.35 * (o.name === "wingR" ? 1 : -1);
      else if (o.name === "cape") o.rotation.x = 0.18 + Math.sin(t * 1.7) * 0.06 + v.lunge * 0.4;
    });
    const fl = v.flash;
    const fade = v.fade;
    f.mats.forEach((m, i) => {
      const e = v.emissive[i];
      m.emissive.copy(e.c).lerp(fl > 0 ? WHITE : v.tint.equals(WHITE) ? e.c : v.tint, fl > 0 ? fl : v.tint.equals(WHITE) ? 0 : 0.35);
      m.emissiveIntensity = fl > 0 ? Math.max(e.i, fl * 1.4) : v.tint.equals(WHITE) ? e.i : Math.max(e.i, 0.6);
      if (fade > 0) {
        m.transparent = true;
        m.opacity = Math.min(m.userData.opacity ?? (m.userData.opacity = m.opacity), 1 - fade);
      }
    });
    for (const [id, o] of v.extras) {
      if (id === "stun" || id === "marked") o.rotation.y += dt * 2.4;
      if (id === "hasted") o.rotation.y += dt * 6;
      if (id === "shield") o.rotation.y += dt * 0.5;
      if (id === "marked") o.lookAt(this.camera.position.x, o.getWorldPosition(tmpV).y, this.camera.position.z);
    }
  }

  private placeLabels() {
    const w = this.width;
    const h = this.height;
    for (const v of this.views.values()) {
      if (v.dead) continue;
      tmpV.set(v.x, TOP + v.y + v.hop + v.fig.height * v.size * v.grow + 0.28 + (v.fig.hover ? 0.32 : 0), v.z);
      tmpV.project(this.camera);
      v.label.style.transform = `translate(${((tmpV.x + 1) / 2) * w}px, ${((1 - tmpV.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  }

  /** Where a fighter's head is on the screen, for the cards and the numbers over it. */
  screenOf(id: number, up = 0.2): [number, number] | null {
    const v = this.views.get(id);
    if (!v) return null;
    tmpV.set(v.x, TOP + v.fig.height * v.size * v.grow + up + (v.fig.hover ? 0.32 : 0), v.z).project(this.camera);
    return [((tmpV.x + 1) / 2) * this.width, ((1 - tmpV.y) / 2) * this.height];
  }

  private resize() {
    const r = this.o.host.getBoundingClientRect();
    this.width = Math.max(1, r.width);
    this.height = Math.max(1, r.height);
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setSize(this.width, this.height);
    this.bloom.resolution.set(this.width / 2, this.height / 2);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.fit();
    this.fx.setScale(this.height * Math.min(devicePixelRatio || 1, 2), this.camera.fov);
  }

  /**
   * Backs the camera off until the whole board and the fighters on its edges fit between the screen's panels: the
   * bars along the top and the fighter's card and buttons along the bottom. The view is shifted so the board sits in
   * the middle of what is left, and the fog starts behind it.
   */
  private fit() {
    const w = this.width;
    const h = this.height;
    const narrow = w < 760;
    const top = Math.min(narrow ? 120 : 96, h * 0.2);
    const bottom = Math.min(narrow ? 150 : 170, h * 0.26);
    const side = Math.min(54, w * 0.08);
    this.camera.setViewOffset(w, h, 0, (bottom - top) / 2, w, h);
    // a tall screen looks along the board from the person's side, so its long side runs up the screen
    const portrait = h > w * 1.15;
    const yaw = portrait ? -Math.PI / 2 : 0;
    const tilt = portrait ? 1.05 : 0.98;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(tilt), Math.sin(tilt), Math.cos(yaw) * Math.cos(tilt));
    if (portrait) this.look.set(-0.5, 0, 0);
    else this.look.set(0, 0, 0.6);
    for (const o of this.world.children) if (o.name === "tree") o.visible = !(portrait ? o.userData.left : o.userData.front);
    const corners: THREE.Vector3[] = [];
    for (const x of [-HALF_W, HALF_W]) for (const z of [-HALF_D, HALF_D]) for (const y of [0, 1.8]) corners.push(new THREE.Vector3(x, y, z));
    const maxX = 1 - (2 * side) / w;
    const maxY = 1 - (2 * top) / h;
    const minY = -1 + (2 * bottom) / h;
    let lo = 8;
    let hi = 160;
    for (let i = 0; i < 26; i++) {
      const d = (lo + hi) / 2;
      this.camera.position.copy(this.look).addScaledVector(dir, d);
      this.camera.lookAt(this.look);
      this.camera.updateMatrixWorld();
      const fits = corners.every((c) => {
        const p = c.clone().project(this.camera);
        return Math.abs(p.x) < maxX && p.y < maxY && p.y > minY;
      });
      if (fits) hi = d;
      else lo = d;
    }
    this.camHome.copy(this.look).addScaledVector(dir, hi);
    this.camera.position.copy(this.camHome);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = hi * 1.25;
    fog.far = hi * 2.8;
  }

  /** Sweeps the camera in from high up and off to one side, as a battle opens. */
  flyIn(secs = 2.4) {
    this.sweep = { age: 0, secs };
  }

  /** Where the opening sweep has the camera now: round the field, further out and higher, closing in as it ends. */
  private swept(sw: { age: number; secs: number }, dt: number): THREE.Vector3 {
    sw.age += dt;
    const k = Math.min(1, sw.age / sw.secs);
    const left = (1 - k) ** 3;
    const off = this.camAt.copy(this.camHome).sub(this.look);
    const d = off.length();
    off.applyAxisAngle(UP, left * 1.1).multiplyScalar(1 + left * 0.8);
    off.y += left * d * 0.45;
    if (k >= 1) this.sweep = null;
    return off.add(this.look);
  }

  // ---------- the pointer ----------

  private pick(e: PointerEvent | MouseEvent): { hex: Hex | null; x: number; z: number; sx: number; sy: number } {
    const r = this.renderer.domElement.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const ndc = new THREE.Vector2((sx / r.width) * 2 - 1, -(sy / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const proxies = [...this.views.values()].filter((v) => !v.dead).map((v) => v.proxy);
    const hit = this.raycaster.intersectObjects(proxies, false)[0];
    const p = new THREE.Vector3();
    const onGround = this.raycaster.ray.intersectPlane(this.ground, p);
    if (hit) {
      const v = this.views.get(hit.object.userData.unit as number);
      if (v) return { hex: v.hex, x: onGround ? p.x : v.x, z: onGround ? p.z : v.z, sx, sy };
    }
    if (!onGround) return { hex: null, x: 0, z: 0, sx, sy };
    return { hex: hexAtXZ(p.x, p.z), x: p.x, z: p.z, sx, sy };
  }

  private onMove = (e: PointerEvent) => {
    const p = this.pick(e);
    this.o.onHover(p.hex, p.x, p.z, p.sx, p.sy);
  };

  private onLeave = () => this.o.onHover(null, 0, 0, -1, -1);

  private onTap = (e: MouseEvent) => {
    const p = this.pick(e);
    this.o.onClick(p.hex, p.x, p.z, false, p.sx, p.sy);
  };

  private onRight = (e: MouseEvent) => {
    e.preventDefault();
    const p = this.pick(e);
    this.o.onClick(p.hex, p.x, p.z, true, p.sx, p.sy);
  };

  // ---------- playing beats ----------

  /** Plays what happened, beat by beat; `seen` hears each beat as it starts, for the log and the banners. */
  async play(beats: Beat[], seen?: (b: Beat) => void) {
    for (let i = 0; i < beats.length; i++) {
      if (this.disposed) return;
      seen?.(beats[i]);
      await this.beat(beats[i], beats, i);
    }
  }

  /** Ends whatever is playing at once. */
  skip() {
    this.clock.flush();
  }

  private chest(v: View): THREE.Vector3 {
    return new THREE.Vector3(v.x, TOP + v.y + v.fig.height * v.size * v.grow * 0.55 + (v.fig.hover ? 0.32 : 0), v.z);
  }

  private muzzle(v: View): THREE.Vector3 {
    const m = v.fig.muzzle.clone().multiplyScalar(v.size);
    m.applyAxisAngle(new THREE.Vector3(0, 1, 0), v.face);
    return m.add(new THREE.Vector3(v.x, TOP + (v.fig.hover ? 0.32 : 0), v.z));
  }

  private turnTo(v: View, x: number, z: number, secs = 0.12): Promise<void> {
    const to = facing([v.x, v.z], [x, z]);
    let from = v.face;
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) < 0.01) return Promise.resolve();
    from = v.face;
    return this.clock.tween(secs, (k) => (v.face = from + d * k), easeOut);
  }

  private shake(amp: number) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
  }

  private pop(v: View, text: string, kind: Parameters<Numbers["pop"]>[3]) {
    const s = this.screenOf(v.id, 0.35);
    if (s) this.numbers.pop(s[0], s[1], text, kind);
  }

  private async beat(b: Beat, all: Beat[], i: number): Promise<void> {
    const V = (id: number) => this.views.get(id);
    switch (b.e) {
      case "round":
        sfx("gong");
        return this.clock.wait(0.35);
      case "turn":
        this.setActive(b.unit);
        return;
      case "move":
        return this.walk(V(b.unit), b.path, b.fly);
      case "blink":
        return this.blink(V(b.unit), b.to);
      case "push":
        return this.push(V(b.unit), b.path, b.bump);
      case "hit":
        return this.hit(V(b.unit), V(b.target), b.shot, b.skill, b.answer);
      case "cast":
        return this.cast(V(b.unit), b.skill, b.at, b.hexes, all, i);
      case "damage":
        return this.damage(V(b.unit), b.amount, !!b.crit, !!b.miss, b.soaked ?? 0);
      case "heal": {
        const v = V(b.unit);
        if (!v) return;
        v.hp = Math.min(v.max, v.hp + b.amount);
        this.paintBar(v);
        this.pop(v, `+${b.amount}`, "heal");
        this.fx.burst(this.chest(v), { color: "#7dffb9", n: 22, speed: 1.2, gravity: -2.5, life: 1, size: 0.2, spread: 0.4 });
        void ring(this.scene, this.clock, new THREE.Vector3(v.x, TOP + 0.05, v.z), "#5fe3a1", 0.3, 0.9, 0.6);
        sfx("heal");
        return this.clock.wait(0.2);
      }
      case "status": {
        const v = V(b.unit);
        if (!v) return;
        if (b.on) {
          this.markStatus(v, b.status);
          if (b.status === "shield") v.shield = Math.max(v.shield, 1);
        } else {
          this.unmark(v, b.status);
          if (b.status === "shield") v.shield = 0;
        }
        this.paintBar(v);
        return;
      }
      case "die":
        return this.die(V(b.unit));
      case "saved": {
        const v = V(b.unit);
        if (!v) return;
        v.hp = 1;
        this.paintBar(v);
        this.pop(v, this.o.words.saved, "word");
        this.fx.burst(this.chest(v), { color: "#ffe27a", n: 40, speed: 2.4, life: 0.9, size: 0.22 });
        void ring(this.scene, this.clock, new THREE.Vector3(v.x, TOP + 0.05, v.z), "#ffe27a", 0.2, 1.6, 0.7);
        sfx("heal");
        return this.clock.wait(0.45);
      }
      case "spawn":
        return this.spawn(b.unit);
      case "grow": {
        const v = V(b.unit);
        if (!v) return;
        v.max += 10;
        v.hp += 10;
        this.paintBar(v);
        const from = v.grow;
        const to = Math.cbrt(v.max / v.max0);
        this.fx.burst(this.chest(v), { color: "#b8ff6a", n: 12, speed: 1, gravity: -1, life: 0.6 });
        return this.clock.tween(0.35, (k) => (v.grow = from + (to - from) * k + Math.sin(k * Math.PI) * 0.12), easeOut);
      }
      case "strike":
        this.addDanger(b.strike);
        sfx("zap");
        return this.clock.wait(0.3);
      case "blast":
        return this.blast(b.strike);
      case "wait": {
        const v = V(b.unit);
        if (v) this.pop(v, this.o.words.wait, "word");
        return this.clock.wait(0.15);
      }
      case "defend": {
        const v = V(b.unit);
        if (!v) return;
        this.markStatus(v, "defending");
        this.pop(v, this.o.words.defend, "word");
        sfx("shield");
        await this.clock.tween(0.18, (k) => (v.raise = 0.35 * k));
        return this.clock.tween(0.2, (k) => (v.raise = 0.35 * (1 - k)));
      }
      case "stunned": {
        const v = V(b.unit);
        if (v) this.pop(v, this.o.words.stunned, "word");
        return this.clock.wait(0.4);
      }
      case "meter":
        return;
      case "phase": {
        const v = V(b.unit);
        this.shake(0.9);
        sfx("boom");
        if (v) {
          this.fx.burst(this.chest(v), { color: "#ff4a1a", n: 60, speed: 4, life: 1, size: 0.3 });
          void ring(this.scene, this.clock, new THREE.Vector3(v.x, TOP + 0.05, v.z), "#ff4a1a", 0.5, 4, 0.8);
        }
        return this.clock.wait(0.7);
      }
      case "over": {
        for (const v of this.views.values()) {
          if (v.dead || v.team !== b.winner) continue;
          void this.clock
            .tween(0.3, (k) => {
              v.hop = Math.sin(k * Math.PI) * 0.5;
              v.raise = Math.sin(k * Math.PI) * 0.7;
            })
            .then(() =>
              this.clock.tween(0.3, (k) => {
                v.hop = Math.sin(k * Math.PI) * 0.35;
                v.raise = Math.sin(k * Math.PI) * 0.7;
              }),
            );
        }
        return this.clock.wait(0.8);
      }
    }
  }

  private async walk(v: View | undefined, path: Hex[], flying: boolean) {
    if (!v || !path.length) return;
    sfx("move");
    if (flying) {
      const pts = [new THREE.Vector3(v.x, 0, v.z), ...path.map((h) => new THREE.Vector3(...[hexXZ(h)[0], 0, hexXZ(h)[1]] as [number, number, number]))];
      const curve = new THREE.CatmullRomCurve3(pts);
      const secs = 0.25 + path.length * 0.11;
      const end = pts[pts.length - 1];
      await this.turnTo(v, end.x, end.z);
      await this.clock.tween(
        secs,
        (k) => {
          const p = curve.getPoint(k);
          v.x = p.x;
          v.z = p.z;
          v.y = Math.sin(k * Math.PI) * 0.7;
          v.lean = Math.sin(k * Math.PI) * 0.35;
        },
        easeInOut,
      );
      v.y = 0;
      v.lean = 0;
    } else {
      for (const h of path) {
        const [x, z] = hexXZ(h);
        const x0 = v.x;
        const z0 = v.z;
        void this.turnTo(v, x, z, 0.08);
        await this.clock.tween(
          0.17,
          (k) => {
            v.x = x0 + (x - x0) * k;
            v.z = z0 + (z - z0) * k;
            v.hop = Math.sin(k * Math.PI) * 0.16;
            v.lean = 0.12;
          },
          linear01,
        );
        this.fx.burst(new THREE.Vector3(x, TOP + 0.05, z), { color: "#8a7a62", n: 3, speed: 0.6, life: 0.4, size: 0.14, gravity: 0.5, flat: true });
      }
      v.lean = 0;
    }
    v.hex = path[path.length - 1];
  }

  private async blink(v: View | undefined, to: Hex) {
    if (!v) return;
    const [x, z] = hexXZ(to);
    this.fx.burst(this.chest(v), { color: "#b38cf5", n: 26, speed: 2, life: 0.6, size: 0.2 });
    sfx("zap");
    await this.clock.tween(0.14, (k) => (v.fade = k * 0.95), easeIn);
    v.x = x;
    v.z = z;
    v.hex = to;
    this.fx.burst(this.chest(v), { color: "#b38cf5", n: 26, speed: 2, life: 0.6, size: 0.2 });
    await this.clock.tween(0.14, (k) => (v.fade = 0.95 * (1 - k)), easeOut);
    v.fade = 0;
  }

  private async push(v: View | undefined, path: Hex[], bump: boolean) {
    if (!v) return;
    for (const h of path) {
      const [x, z] = hexXZ(h);
      const x0 = v.x;
      const z0 = v.z;
      await this.clock.tween(0.1, (k) => {
        v.x = x0 + (x - x0) * k;
        v.z = z0 + (z - z0) * k;
      }, easeOut);
      this.fx.burst(new THREE.Vector3(v.x, TOP + 0.05, v.z), { color: "#8a7a62", n: 6, speed: 1.2, life: 0.4, size: 0.16, flat: true });
    }
    if (path.length) v.hex = path[path.length - 1];
    if (bump) {
      v.shake = 1;
      this.shake(0.35);
      this.fx.burst(this.chest(v), { color: "#d8c8a8", n: 18, speed: 2.2, life: 0.5, size: 0.18 });
      sfx("wall");
    }
  }

  /** The swing or the shot, up to the moment it lands; the damage beats after it show the landing. */
  private async hit(v: View | undefined, t: View | undefined, shot: boolean, skill?: string, answer?: boolean) {
    if (!v || !t) return;
    await this.turnTo(v, t.x, t.z, answer ? 0.06 : 0.12);
    if (shot) {
      const [missile, color] =
        skill === "findBug"
          ? (["arrow", "#ff8a3c"] as [Missile, string])
          : (MISSILES[v.body] ?? (["bolt", "#ffd25a"] as [Missile, string]));
      if (skill === "cloudTask") return this.lightning(t);
      await this.clock.tween(0.14, (k) => {
        v.raise = 0.45 * k;
        v.lean = -0.1 * k;
      });
      sfx("shoot");
      const from = this.muzzle(v);
      void this.clock.tween(0.25, (k) => {
        v.raise = 0.45 * (1 - k);
        v.lean = -0.1 * (1 - k);
      });
      await fly(this.scene, this.clock, this.fx, missile, from, this.chest(t), color);
      return;
    }
    const color = skill ? (SKILL_COLOR[skill] ?? "#ffffff") : "#ffffff";
    // wind up, then lunge
    await this.clock.tween(answer ? 0.1 : 0.16, (k) => {
      v.swingR = 0.9 * k;
      v.lean = -0.18 * k;
    }, easeOut);
    sfx("slash");
    await this.clock.tween(0.08, (k) => {
      v.swingR = 0.9 - 2.6 * k;
      v.lunge = k;
      v.lean = -0.18 + 0.45 * k;
    }, easeIn);
    if (skill) this.fx.burst(this.chest(t), { color, n: 30, speed: 3.2, life: 0.5, size: 0.22 });
    void this.clock.tween(0.3, (k) => {
      v.swingR = -1.7 * (1 - k);
      v.lunge = 1 - k;
      v.lean = 0.27 * (1 - k);
    }, easeInOut);
  }

  private async lightning(t: View) {
    const top = this.chest(t).add(new THREE.Vector3(0, 9, 0));
    const pts: THREE.Vector3[] = [];
    const target = this.chest(t);
    for (let i = 0; i <= 8; i++) {
      const p = top.clone().lerp(target, i / 8);
      if (i > 0 && i < 8) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.7, 0, (Math.random() - 0.5) * 0.7));
      pts.push(p);
    }
    const bolt = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.06, 5),
      new THREE.MeshStandardMaterial({ color: "#dffcff", emissive: "#7ff0ff", emissiveIntensity: 5, transparent: true }),
    );
    this.scene.add(bolt);
    sfx("boom");
    this.shake(0.8);
    this.fx.burst(target, { color: "#7ff0ff", n: 50, speed: 4, life: 0.7, size: 0.26 });
    void ring(this.scene, this.clock, new THREE.Vector3(t.x, TOP + 0.05, t.z), "#7ff0ff", 0.3, 2.2, 0.5);
    await this.clock.tween(0.35, (k) => ((bolt.material as THREE.MeshStandardMaterial).opacity = 1 - k), easeIn);
    this.scene.remove(bolt);
    bolt.geometry.dispose();
    (bolt.material as THREE.Material).dispose();
  }

  private async damage(t: View | undefined, amount: number, crit: boolean, miss: boolean, soaked: number) {
    if (!t) return;
    const at = this.chest(t);
    if (miss) {
      sfx("miss");
      this.pop(t, this.o.words.miss, "miss");
      const x0 = t.x;
      await this.clock.tween(0.18, (k) => (t.x = x0 + Math.sin(k * Math.PI) * 0.3));
      return;
    }
    t.hp -= amount;
    if (soaked) {
      t.shield = Math.max(0, t.shield - soaked);
      this.pop(t, `−${soaked}`, "shield");
      this.fx.burst(at, { color: "#7fd8ff", n: 16, speed: 2, life: 0.4, size: 0.2 });
      sfx("shield");
    }
    if (amount > 0) {
      this.pop(t, crit ? `${amount}!` : String(amount), crit ? "crit" : "hit");
      t.flash = 1;
      t.shake = crit ? 1.2 : 0.7;
      this.fx.burst(at, { color: crit ? "#ffd25a" : "#ff8a6a", n: crit ? 40 : 18, speed: crit ? 3.6 : 2.4, life: 0.5, size: crit ? 0.26 : 0.2 });
      if (crit) {
        sfx("crit");
        this.shake(0.6);
        this.clock.freeze(0.08);
      } else if (amount >= t.max * 0.25) this.shake(0.3);
    }
    this.paintBar(t);
    await this.clock.wait(0.12);
  }

  private async die(v: View | undefined) {
    if (!v) return;
    v.dead = true;
    v.label.style.display = "none";
    sfx("fall");
    this.fx.burst(this.chest(v), { color: v.kind === "nullPointer" || v.kind.startsWith("leak") ? "#b8ff6a" : "#cfc6e6", n: 30, speed: 2, life: 0.8, size: 0.2 });
    await this.clock.tween(0.45, (k) => (v.fall = k), easeIn);
    this.fx.burst(new THREE.Vector3(v.x, TOP + 0.1, v.z), { color: "#8a7a62", n: 14, speed: 1.4, life: 0.5, size: 0.2, flat: true });
    void this.clock.tween(0.6, (k) => (v.fade = k)).then(() => {
      if (this.views.get(v.id) === v && v.dead) this.dropView(v);
    });
  }

  private async spawn(id: number) {
    // the fighter is in the battle the screen syncs to next; until then it is made from what the beat's battle knows
    const u = this.pending?.units[id];
    if (!u || this.views.has(id)) return;
    const v = this.makeView(u);
    v.grow = 0;
    const at = new THREE.Vector3(v.x, TOP + 0.05, v.z);
    sfx("summon");
    void ring(this.scene, this.clock, at, SKILL_COLOR.subagents, 0.2, 1.2, 0.5);
    this.fx.burst(at, { color: u.color, n: 30, speed: 1.6, gravity: -2, life: 0.8, size: 0.2, spread: 0.5 });
    const to = u.kind === "memoryLeak" ? Math.cbrt(u.maxHp / v.max0) : 1;
    await this.clock.tween(0.35, (k) => (v.grow = to * k), backOut);
  }

  /** The battle the beats being played lead to, for fighters that appear in them. */
  private pending: Battle | null = null;

  /** Plays the beats of one command and then settles on the battle they lead to. */
  async show(beats: Beat[], after: Battle, seen?: (b: Beat) => void) {
    this.pending = after;
    await this.play(beats, seen);
    if (this.disposed) return;
    this.pending = null;
    this.sync(after);
  }

  private async cast(v: View | undefined, skill: string, at: Hex | null, hexes: Hex[] | undefined, all: Beat[], i: number) {
    if (!v) return;
    const color = SKILL_COLOR[skill] ?? "#ffffff";
    const [ax, az] = at != null ? hexXZ(at) : [v.x, v.z];
    if (at != null && at !== v.hex) await this.turnTo(v, ax, az);
    const foot = new THREE.Vector3(v.x, TOP + 0.04, v.z);
    const ult = ["subagents", "cloudTask", "millionTokens", "autopilot", "tabTab", "fork"].includes(skill);
    if (ult) {
      sfx("ult");
      this.shake(0.4);
      void ring(this.scene, this.clock, foot, color, 0.4, 3.2, 0.9);
    } else sfx("zap");
    void ring(this.scene, this.clock, foot, color, 0.3, 1.1, 0.55, true);
    this.fx.burst(foot, { color, n: ult ? 50 : 24, speed: 1.2, gravity: -3, life: 0.9, size: 0.2, spread: 0.5 });
    await this.clock.tween(ult ? 0.35 : 0.22, (k) => (v.raise = k * 0.75), easeOut);
    void this.clock.tween(0.3, (k) => (v.raise = 0.75 * (1 - k)));

    const next = all[i + 1];
    const target = at != null ? [...this.views.values()].find((x) => !x.dead && x.hex === at) : undefined;
    switch (skill) {
      case "firewall":
        for (const h of hexes ?? []) {
          const [x, z] = hexXZ(h);
          this.fx.burst(new THREE.Vector3(x, TOP + 0.05, z), { color: "#ff7a2a", n: 10, speed: 0.8, gravity: -3, life: 0.9, size: 0.24, spread: 0.6 });
        }
        await ring(this.scene, this.clock, foot, "#ff7a2a", 0.4, 2.6, 0.45);
        return;
      case "plan":
      case "hotfix":
      case "ultrathink":
        if (target) await this.beam(v, target, color);
        return;
      case "fridayDeploy":
      case "quake":
        if (skill === "quake") {
          await this.clock.tween(0.2, (k) => (v.hop = Math.sin(k * Math.PI) * 0.4));
          this.shake(0.5);
          sfx("boom");
          void ring(this.scene, this.clock, foot, "#ff5a2a", 0.5, 3.4, 0.6);
        }
        return;
      case "millionTokens":
      case "autopilot":
      case "tabTab": {
        const enemies = skill === "millionTokens";
        for (const x of this.views.values()) {
          if (x.dead || (x.team === v.team) === enemies) continue;
          this.fx.burst(this.chest(x), { color, n: 24, speed: 1.6, gravity: -1.5, life: 0.8, size: 0.2 });
          void ring(this.scene, this.clock, new THREE.Vector3(x.x, TOP + 0.05, x.z), color, 0.3, 1.2, 0.6);
        }
        return this.clock.wait(0.35);
      }
      default:
        if (next?.e !== "hit" && target) this.fx.burst(this.chest(target), { color, n: 20, speed: 2, life: 0.6 });
    }
  }

  /** A stream of light from one fighter to another, for spells cast on a friend. */
  private async beam(a: View, b: View, color: string) {
    const from = this.chest(a).add(new THREE.Vector3(0, 0.3, 0));
    const to = this.chest(b);
    await this.clock.run((age) => {
      const k = Math.min(1, age / 0.35);
      const p = from.clone().lerp(to, k);
      p.y += Math.sin(k * Math.PI) * 0.8;
      this.fx.burst(p, { color, n: 3, speed: 0.4, life: 0.5, size: 0.22, gravity: 0 });
      return k >= 1;
    });
    this.fx.burst(to, { color, n: 30, speed: 1.8, gravity: -2, life: 0.8, size: 0.22 });
    void ring(this.scene, this.clock, new THREE.Vector3(b.x, TOP + 0.05, b.z), color, 0.3, 1.1, 0.5);
  }

  private async blast(s: Strike) {
    for (const h of s.hexes) this.dangerHexes.delete(h);
    const quake = s.skill === "quake";
    const order = [...s.hexes];
    const center = order.reduce(
      (acc, h) => {
        const [x, z] = hexXZ(h);
        return [acc[0] + x / order.length, acc[1] + z / order.length];
      },
      [0, 0],
    );
    if (!quake) {
      // shells fall from the sky onto the middle, then the whole area goes up
      const shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.22, 1),
        new THREE.MeshStandardMaterial({ color: "#2b2b33", emissive: "#ff7a1a", emissiveIntensity: 1.2 }),
      );
      this.scene.add(shell);
      await this.clock.tween(0.4, (k) => shell.position.set(center[0], TOP + 10 * (1 - k), center[1]), easeIn);
      this.scene.remove(shell);
      shell.geometry.dispose();
      (shell.material as THREE.Material).dispose();
    }
    sfx("boom");
    this.shake(quake ? 0.9 : 1.1);
    this.clock.freeze(0.06);
    for (const h of order) {
      const [x, z] = hexXZ(h);
      const p = new THREE.Vector3(x, TOP + 0.1, z);
      if (quake) {
        this.fx.burst(p, { color: "#ff5a2a", n: 10, speed: 2.2, life: 0.6, size: 0.24, up: 0.9 });
        this.fx.burst(p, { color: "#8a7a62", n: 8, speed: 1.6, life: 0.6, size: 0.24, flat: true });
      } else {
        this.fx.burst(p, { color: "#ffb23a", n: 14, speed: 3, life: 0.7, size: 0.3, up: 0.7 });
        this.fx.burst(p, { color: "#4a4040", n: 6, speed: 1, life: 1.2, size: 0.4, gravity: -0.8 });
      }
    }
    void ring(this.scene, this.clock, new THREE.Vector3(center[0], TOP + 0.08, center[1]), quake ? "#ff5a2a" : "#ffb23a", 0.5, quake ? 3.6 : 2.6, 0.6);
    await this.clock.wait(0.25);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.watch.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("click", this.onTap);
    el.removeEventListener("contextmenu", this.onRight);
    this.clock.flush();
    for (const v of [...this.views.values()]) this.dropView(v);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.LineLoop) {
        o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      }
    });
    this.fx.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    // a browser keeps only a handful of WebGL contexts: give this one back now, not when it is collected
    this.renderer.forceContextLoss();
    el.remove();
    this.overlay.remove();
  }
}

const linear01 = (t: number) => t;
