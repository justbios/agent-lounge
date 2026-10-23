import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HEXES } from "@/lib/arena/hex";
import { Dice, seedOf } from "@/lib/arena/rng";
import type { Two } from "@/lib/i18n";
import { HALF_D, HALF_W, R, TOP, hexXZ } from "./geo";

/*
 * Where a battle is fought: the sky and the light, the ground round the board with what grows and lies on it, the
 * grain of the tiles, and what drifts in the air. Each sprint battle has its own place; a quick battle or a spar
 * picks one from its id, so both screens of a battle see the same.
 */

export type PlaceId = "meadow" | "autumn" | "winter" | "desert" | "night" | "lava";

type Tree = "pine" | "snowpine" | "round" | "dead" | "cactus" | "spire";
type Prop = "flower" | "mushroom" | "stone" | "pumpkin" | "grave" | "drift" | "crystal" | "bush";
type Air = "fireflies" | "leaves" | "snow" | "dust" | "embers" | "wisps";

export interface Place {
  id: PlaceId;
  name: Two;
  /** the sky from the top down to the horizon */
  sky: [string, string, string, string];
  fog: string;
  hemi: [sky: string, ground: string, power: number];
  sun: [string, number];
  rim: [string, number];
  exposure: number;
  /** the ground round the board: the noise moves between these */
  ground: [string, string];
  /** the tiles' tops fall between these; the odd one is bare */
  tiles: [string, string];
  bare: [string, number];
  /** down the tiles' sides */
  earth: string;
  /** how much the tiles' grain stands out */
  grain: number;
  /** the rocks on the board: the stone, and the moss on some */
  stone: [string, string];
  trees: Tree[];
  leaves: string[];
  bark: string;
  /** the blades of grass on the tiles and round them; none on sand or snow */
  tuft: string | null;
  flowers: string[];
  /** what lies about round the board, and how many */
  props: [Prop, number][];
  /** a pond, a frozen one or lava beside the board */
  pool?: { color: string; glow: number; rough: number };
  air: Air;
  airColors: string[];
}

const s = (uk: string, en: string): Two => ({ uk, en });

export const PLACES: Record<PlaceId, Place> = {
  meadow: {
    id: "meadow",
    name: s("Луг надвечір", "A meadow at dusk"),
    sky: ["#0d1030", "#2a2350", "#6a3a5a", "#c8774a"],
    fog: "#2c2a3a",
    hemi: ["#b8c8ff", "#2a1c12", 0.85],
    sun: ["#ffd2a0", 2.3],
    rim: ["#7f9cff", 0.9],
    exposure: 1.05,
    ground: ["#22361a", "#36522a"],
    tiles: ["#4c7a30", "#6f9c3c"],
    bare: ["#7a5a3a", 0.08],
    earth: "#5b4130",
    grain: 0.22,
    stone: ["#7c7480", "#4f6b3a"],
    trees: ["pine", "pine", "round"],
    leaves: ["#2f5a3a", "#24493a", "#3c6b37"],
    bark: "#5a3b26",
    tuft: "#6fa040",
    flowers: ["#f2e86d", "#ff8fb1", "#f4f0ff", "#9fc6ff"],
    props: [
      ["flower", 90],
      ["stone", 12],
      ["mushroom", 10],
      ["bush", 18],
    ],
    pool: { color: "#1d3d5c", glow: 0.15, rough: 0.12 },
    air: "fireflies",
    airColors: ["#d9ff7a", "#fff0a0"],
  },
  autumn: {
    id: "autumn",
    name: s("Осінній ліс", "An autumn wood"),
    sky: ["#1e2a52", "#5a4a6a", "#c07a50", "#f0b070"],
    fog: "#3a2c24",
    hemi: ["#ffe2c0", "#3a2412", 0.8],
    sun: ["#ffc68a", 2.6],
    rim: ["#ffb070", 0.6],
    exposure: 1.0,
    ground: ["#3a2a14", "#52391a"],
    tiles: ["#7c7a34", "#a08a3c"],
    bare: ["#8a5a32", 0.07],
    earth: "#5a3e28",
    grain: 0.26,
    stone: ["#8a7c70", "#7a6a3a"],
    trees: ["round", "round", "pine", "dead"],
    leaves: ["#d9662a", "#e8a23a", "#b8402a", "#c8862a", "#5a6a2a"],
    bark: "#4a2e1e",
    tuft: "#9a8a3a",
    flowers: ["#e8702a", "#f0c040", "#c0402a"],
    props: [
      ["flower", 70],
      ["mushroom", 18],
      ["stone", 12],
      ["bush", 14],
    ],
    pool: { color: "#22303a", glow: 0.1, rough: 0.1 },
    air: "leaves",
    airColors: ["#e8742a", "#f0b03a", "#c8442a"],
  },
  winter: {
    id: "winter",
    name: s("Засніжений перевал", "A snowy pass"),
    sky: ["#16203f", "#344a7a", "#7a90c0", "#c8d4ec"],
    fog: "#5a6684",
    hemi: ["#cfdcff", "#3a4256", 0.75],
    sun: ["#e8eeff", 1.7],
    rim: ["#9fc0ff", 0.9],
    exposure: 0.92,
    ground: ["#9aa8be", "#c4cee0"],
    tiles: ["#b8c6d8", "#d8e2ee"],
    bare: ["#7a98b4", 0.1],
    earth: "#5a6272",
    grain: 0.12,
    stone: ["#6a7080", "#e6eef8"],
    trees: ["snowpine", "snowpine", "dead"],
    leaves: ["#1f4a3c", "#24443a"],
    bark: "#4a3628",
    tuft: null,
    flowers: [],
    props: [
      ["drift", 30],
      ["stone", 12],
      ["crystal", 6],
    ],
    pool: { color: "#a8c8e8", glow: 0.25, rough: 0.05 },
    air: "snow",
    airColors: ["#ffffff", "#e6f0ff"],
  },
  desert: {
    id: "desert",
    name: s("Пустеля", "The desert"),
    sky: ["#244a8a", "#4a7ab8", "#c8a070", "#f0c890"],
    fog: "#8a6a4a",
    hemi: ["#ffe8c8", "#6a4a2a", 0.75],
    sun: ["#fff0d0", 2.4],
    rim: ["#ffd0a0", 0.5],
    exposure: 0.95,
    ground: ["#a07a48", "#c49a5e"],
    tiles: ["#c49a5a", "#dcb472"],
    bare: ["#a0703e", 0.07],
    earth: "#8a6440",
    grain: 0.2,
    stone: ["#b08a60", "#9a6a42"],
    trees: ["cactus", "cactus", "dead"],
    leaves: ["#4f8a4a"],
    bark: "#6a4a30",
    tuft: null,
    flowers: [],
    props: [
      ["stone", 18],
      ["bush", 12],
    ],
    air: "dust",
    airColors: ["#f0d0a0", "#e0b880"],
  },
  night: {
    id: "night",
    name: s("Цвинтар опівночі", "The graveyard at midnight"),
    sky: ["#0a0614", "#1e0e30", "#46195a", "#8a3048"],
    fog: "#1c1226",
    hemi: ["#9a8ad0", "#20141a", 1.0],
    sun: ["#ffc080", 2.1],
    rim: ["#a070ff", 1.2],
    exposure: 1.2,
    ground: ["#1e2a18", "#2e3c20"],
    tiles: ["#4c6036", "#647840"],
    bare: ["#4a3a2a", 0.12],
    earth: "#3a2a24",
    grain: 0.24,
    stone: ["#5a5866", "#3a4a2e"],
    trees: ["dead", "dead", "pine"],
    leaves: ["#1e2e26"],
    bark: "#2e2228",
    tuft: "#3e5a2c",
    flowers: ["#b07aff", "#ff9a3a"],
    props: [
      ["pumpkin", 16],
      ["grave", 18],
      ["mushroom", 12],
      ["stone", 8],
    ],
    pool: { color: "#2a1a40", glow: 0.35, rough: 0.2 },
    air: "wisps",
    airColors: ["#9affc0", "#c09aff"],
  },
  lava: {
    id: "lava",
    name: s("Попелища", "The ash fields"),
    sky: ["#100606", "#2a0e0a", "#5a1c12", "#a03a1a"],
    fog: "#2a1210",
    hemi: ["#c09090", "#3a140a", 1.0],
    sun: ["#ffb080", 2.4],
    rim: ["#ff5a2a", 1.4],
    exposure: 1.15,
    ground: ["#221a18", "#342a26"],
    tiles: ["#605658", "#766a66"],
    bare: ["#6a3a2a", 0.1],
    earth: "#2a2224",
    grain: 0.3,
    stone: ["#3a3436", "#5a2a1a"],
    trees: ["spire", "spire", "dead"],
    leaves: ["#3a3436"],
    bark: "#1e1a1c",
    tuft: null,
    flowers: [],
    props: [
      ["crystal", 16],
      ["stone", 16],
    ],
    pool: { color: "#ff4a0a", glow: 2.2, rough: 0.6 },
    air: "embers",
    airColors: ["#ff8a2a", "#ffb04a", "#ff5a1a"],
  },
};

/** The sprint's battles each have their place. */
const SPRINT_PLACE: Record<string, PlaceId> = {
  "first-bug": "meadow",
  leak: "autumn",
  race: "desert",
  deadlock: "winter",
  monolith: "lava",
};

/** Where a battle is fought: a sprint battle's own place, or one picked from the id; Halloween's week adds the graveyard. */
export function placeFor(id: string, halloween: boolean, scenario?: string): PlaceId {
  // a dev build takes `?place=winter` on the address, to see one place in every battle
  if (process.env.NODE_ENV !== "production" && typeof location !== "undefined") {
    const forced = new URLSearchParams(location.search).get("place");
    if (forced && Object.hasOwn(PLACES, forced)) return forced as PlaceId;
  }
  if (scenario && SPRINT_PLACE[scenario]) return SPRINT_PLACE[scenario];
  const pool: PlaceId[] = halloween
    ? ["night", "night", "meadow", "autumn", "winter", "desert"]
    : ["meadow", "autumn", "winter", "desert"];
  return pool[seedOf(`${id}:place`) % pool.length];
}

// ---------- textures ----------

const textures = new Map<string, THREE.CanvasTexture>();

/**
 * A tile's top as a cylinder cap maps it: grain all over and a worn, darker rim along the six edges, so the board
 * reads as tiles without lines drawn on it. Grey, so each tile's own colour tints it.
 */
export function tileTexture(grain: number): THREE.CanvasTexture {
  const key = `tile:${grain}`;
  const had = textures.get(key);
  if (had) return had;
  const n = 128;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d")!;
  const img = g.createImageData(n, n);
  const dice = new Dice(seedOf(key));
  // the cap's corners sit at 0°, 60°, … on a circle of radius 0.5; its edges' normals halfway between
  const normals = Array.from({ length: 6 }, (_, k) => [Math.cos((k + 0.5) * (Math.PI / 3)), Math.sin((k + 0.5) * (Math.PI / 3))]);
  const apothem = 0.5 * Math.cos(Math.PI / 6);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n - 0.5;
      const v = (y + 0.5) / n - 0.5;
      const d = Math.max(...normals.map(([a, b]) => u * a + v * b)) / apothem;
      const speck = (dice.next() - 0.5) * grain;
      const blot = Math.sin(x * 0.21 + Math.sin(y * 0.13) * 2) * Math.cos(y * 0.17 + Math.sin(x * 0.11)) * grain * 0.35;
      const rim = d > 0.8 ? -Math.min(1, (d - 0.8) / 0.2) * 0.3 : d > 0.72 ? ((d - 0.72) / 0.08) * 0.06 : 0;
      const k = Math.max(0, Math.min(1, 0.9 + speck + blot + rim));
      const i = (y * n + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(k * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textures.set(key, tex);
  return tex;
}

/** Fine grain for the ground, tiled many times over it. */
function groundTexture(): THREE.CanvasTexture {
  const had = textures.get("ground");
  if (had) return had;
  const n = 256;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d")!;
  const img = g.createImageData(n, n);
  const dice = new Dice(seedOf("ground"));
  for (let i = 0; i < n * n; i++) {
    const k = Math.round((0.86 + (dice.next() - 0.5) * 0.24) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = k;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(90, 90);
  tex.anisotropy = 4;
  textures.set("ground", tex);
  return tex;
}

/** A soft round dot, for what drifts in the air. */
function dotTexture(): THREE.CanvasTexture {
  const had = textures.get("dot");
  if (had) return had;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.7)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  textures.set("dot", tex);
  return tex;
}

/** The sky behind everything, top to horizon. */
export function skyTexture(p: Place): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  p.sky.forEach((color, i) => grad.addColorStop([0, 0.45, 0.75, 1][i], color));
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- the ground ----------

/** How high the ground rises at a point: flat round the board, rolling further out. */
export function heightAt(x: number, z: number): number {
  const dx = Math.max(0, Math.abs(x) - (HALF_W + 1.5));
  const dz = Math.max(0, Math.abs(z) - (HALF_D + 1.5));
  const k = Math.min(1, Math.hypot(dx, dz) / 10);
  return k * k * (0.9 + 0.9 * Math.sin(x * 0.19 + 1.3) * Math.cos(z * 0.16 - 0.4)) * 1.6;
}

/** Whether a point is under the board's tiles, give or take. */
const onBoardArea = (x: number, z: number, pad = 0) => Math.abs(x) < HALF_W - 0.6 + pad && Math.abs(z) < HALF_D - 0.9 + pad;

/** Things tall enough to stand between the camera and the board are hidden on the side the camera looks from. */
function tall(o: THREE.Object3D, x: number, z: number) {
  o.name = "tree";
  o.userData.front = z > HALF_D - 0.5 && Math.abs(x) < HALF_W + 4;
  o.userData.left = x < -HALF_W + 0.5 && Math.abs(z) < HALF_D + 4;
}

const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true, ...extra });

function shadows(o: THREE.Object3D) {
  o.traverse((x) => {
    x.castShadow = true;
    x.receiveShadow = true;
  });
}

/**
 * Dresses the world for a place: the rolling ground, a pond, trees in a ring, what lies about, and the grass on the
 * tiles' edges. `dice` is the battle's look, so a battle looks the same each time it is shown.
 */
export function dress(world: THREE.Group, p: Place, dice: Dice) {
  // the ground: a wide plane, coloured and lifted by a slow noise
  const size = 260;
  const segs = 130;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs).rotateX(-Math.PI / 2);
  const pos = geo.getAttribute("position");
  const colors: number[] = [];
  const a = new THREE.Color(p.ground[0]);
  const b = new THREE.Color(p.ground[1]);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z) - 0.01);
    const n = Math.sin(x * 0.31) * Math.cos(z * 0.37) * 0.35 + Math.sin(x * 0.07 + z * 0.09) * 0.4 + 0.5;
    c.copy(a).lerp(b, Math.max(0, Math.min(1, n)));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: groundTexture() }));
  ground.receiveShadow = true;
  world.add(ground);

  // a pond, or lava, off the board's far corners where the camera never has it in front
  if (p.pool) {
    const spots: [number, number][] = [
      [-HALF_W - 4, -HALF_D - 2.5],
      [HALF_W + 5, -HALF_D - 1.5],
    ];
    const [px, pz] = spots[dice.int(0, 1)];
    const shape = new THREE.Shape();
    const rx = 3.2 + dice.next() * 1.5;
    const rz = 2 + dice.next();
    for (let k = 0; k <= 24; k++) {
      const t = (k / 24) * Math.PI * 2;
      const wob = 1 + Math.sin(t * 3 + px) * 0.12 + Math.sin(t * 5 + pz) * 0.06;
      const x = Math.cos(t) * rx * wob;
      const z = Math.sin(t) * rz * wob;
      if (k === 0) shape.moveTo(x, z);
      else shape.lineTo(x, z);
    }
    const pool = new THREE.Mesh(
      new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: p.pool.color,
        roughness: p.pool.rough,
        metalness: 0.4,
        emissive: p.pool.color,
        emissiveIntensity: p.pool.glow,
        side: THREE.DoubleSide,
      }),
    );
    pool.position.set(px, heightAt(px, pz) + 0.03, pz);
    pool.name = "pool";
    world.add(pool);
    // stones round its shore
    const shore = std(p.stone[0]);
    for (let k = 0; k < 9; k++) {
      const t = dice.next() * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + dice.next() * 0.25, 0), shore);
      const x = px + Math.cos(t) * rx * 1.05;
      const z = pz + Math.sin(t) * rz * 1.05;
      st.position.set(x, heightAt(x, z) + 0.05, z);
      st.scale.y = 0.6;
      st.castShadow = true;
      world.add(st);
    }
  }

  // trees in a ring round the board
  const bark = std(p.bark, { roughness: 1 });
  const leaves = p.leaves.map((l) => std(l, { roughness: 0.9 }));
  const snow = std("#f2f6ff", { roughness: 0.8 });
  const glowStone = (color: string) => std(color, { emissive: color, emissiveIntensity: 1.4, roughness: 0.4 });
  for (let i = 0; i < 52; i++) {
    const t = dice.next() * Math.PI * 2;
    const x = Math.cos(t) * (HALF_W + 2 + dice.next() * 13);
    const z = Math.sin(t) * (HALF_D + 2 + dice.next() * 10);
    const kind = p.trees[dice.int(0, p.trees.length - 1)];
    const tree = makeTree(kind, dice, bark, leaves[dice.int(0, leaves.length - 1)], snow);
    tree.position.set(x, heightAt(x, z), z);
    tree.scale.setScalar(0.8 + dice.next() * 0.9);
    tree.rotation.y = dice.next() * 6;
    tall(tree, x, z);
    shadows(tree);
    world.add(tree);
  }

  // what lies about round the board
  const spot = (pad: number): [number, number] => {
    for (;;) {
      const x = (dice.next() - 0.5) * 2 * (HALF_W + 11);
      const z = (dice.next() - 0.5) * 2 * (HALF_D + 9);
      if (!onBoardArea(x, z, pad)) return [x, z];
    }
  };
  const stoneMat = std(p.stone[0]);
  for (const [prop, count] of p.props) {
    if (prop === "flower") {
      if (!p.flowers.length) continue;
      const head = new THREE.IcosahedronGeometry(0.06, 0);
      const mesh = new THREE.InstancedMesh(
        head,
        new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: "#ffffff", emissiveIntensity: 0.08 }),
        count,
      );
      const m = new THREE.Matrix4();
      for (let k = 0; k < count; k++) {
        // half of them on the tiles' rims, out of the fighters' way
        if (k % 2 === 0) {
          const [hx, hz] = hexXZ(dice.int(0, HEXES - 1));
          const t = dice.next() * Math.PI * 2;
          const r = R * (0.62 + dice.next() * 0.2);
          m.makeTranslation(hx + Math.cos(t) * r, TOP + 0.09, hz + Math.sin(t) * r);
        } else {
          const [x, z] = spot(0.4);
          m.makeTranslation(x, heightAt(x, z) + 0.1, z);
        }
        mesh.setMatrixAt(k, m);
        mesh.setColorAt(k, c.set(p.flowers[dice.int(0, p.flowers.length - 1)]));
      }
      world.add(mesh);
      continue;
    }
    if (prop === "stone") {
      const mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.22, 0), stoneMat, count);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      for (let k = 0; k < count; k++) {
        const [x, z] = spot(0.6);
        const sc = 0.4 + dice.next() * 1.1;
        e.set(dice.next() * 3, dice.next() * 3, dice.next() * 3);
        m.compose(new THREE.Vector3(x, heightAt(x, z) + 0.06 * sc, z), q.setFromEuler(e), new THREE.Vector3(sc, sc * 0.6, sc));
        mesh.setMatrixAt(k, m);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      world.add(mesh);
      continue;
    }
    for (let k = 0; k < count; k++) {
      const [x, z] = spot(prop === "grave" || prop === "pumpkin" ? 1.2 : 0.6);
      const o = makeProp(prop, dice, p, { glowStone, bark });
      o.position.set(x, heightAt(x, z), z);
      o.rotation.y = prop === "pumpkin" ? (dice.next() - 0.5) * 1.2 : prop === "grave" ? (dice.next() - 0.5) * 0.5 : dice.next() * 6;
      if (prop === "grave" || prop === "crystal" || prop === "bush") tall(o, x, z);
      shadows(o);
      world.add(o);
    }
  }

  // blades of grass round the tiles' rims and over the ground
  if (p.tuft) {
    const blade = (t: number) =>
      new THREE.ConeGeometry(0.028, 0.2, 3)
        .translate(0, 0.1, 0)
        .rotateZ(Math.cos(t) * 0.35)
        .rotateX(Math.sin(t) * 0.35);
    const tuft = mergeGeometries([blade(0), blade(2.1), blade(4.2), blade(1)]);
    const onTiles = 150;
    const around = 520;
    const mesh = new THREE.InstancedMesh(
      tuft,
      new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, flatShading: true }),
      onTiles + around,
    );
    const m = new THREE.Matrix4();
    const base = new THREE.Color(p.tuft);
    const sc = new THREE.Vector3();
    for (let k = 0; k < onTiles + around; k++) {
      let x: number;
      let y: number;
      let z: number;
      if (k < onTiles) {
        const [hx, hz] = hexXZ(dice.int(0, HEXES - 1));
        const t = dice.next() * Math.PI * 2;
        const r = R * (0.64 + dice.next() * 0.22);
        x = hx + Math.cos(t) * r;
        z = hz + Math.sin(t) * r;
        y = TOP;
      } else {
        [x, z] = spot(0.2);
        y = heightAt(x, z);
      }
      const k2 = 0.9 + dice.next() * 0.8;
      m.makeRotationY(dice.next() * 6).scale(sc.set(k2, k2, k2)).setPosition(x, y, z);
      mesh.setMatrixAt(k, m);
      mesh.setColorAt(k, c.copy(base).multiplyScalar(0.75 + dice.next() * 0.5));
    }
    mesh.receiveShadow = true;
    world.add(mesh);
  }
}

function makeTree(kind: Tree, dice: Dice, bark: THREE.Material, leaf: THREE.Material, snow: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const trunk = (r: number, h: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.65, r, h, 6), bark);
    m.position.y = h / 2;
    g.add(m);
  };
  switch (kind) {
    case "pine":
    case "snowpine": {
      trunk(0.18, 0.8);
      for (let k = 0; k < 3; k++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1 - k * 0.24, 1.2, 7), leaf);
        cone.position.y = 1.0 + k * 0.62;
        g.add(cone);
        if (kind === "snowpine") {
          const cap = new THREE.Mesh(new THREE.ConeGeometry((1 - k * 0.24) * 0.62, 0.5, 7), snow);
          cap.position.y = 1.0 + k * 0.62 + 0.38;
          g.add(cap);
        }
      }
      break;
    }
    case "round": {
      trunk(0.16, 1.1);
      for (let k = 0; k < 3; k++) {
        const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62 + dice.next() * 0.25, 0), leaf);
        blob.position.set((dice.next() - 0.5) * 0.6, 1.4 + k * 0.38, (dice.next() - 0.5) * 0.6);
        blob.rotation.set(dice.next() * 3, dice.next() * 3, 0);
        g.add(blob);
      }
      break;
    }
    case "dead": {
      trunk(0.14, 1.9);
      for (let k = 0; k < 4; k++) {
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.06, 0.8, 4), bark);
        const t = (k / 4) * Math.PI * 2 + dice.next();
        br.position.set(Math.cos(t) * 0.25, 1.1 + k * 0.22, Math.sin(t) * 0.25);
        br.rotation.set(Math.sin(t) * 0.9, 0, -Math.cos(t) * 0.9);
        g.add(br);
      }
      break;
    }
    case "cactus": {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.7, 8), leaf);
      body.position.y = 0.85;
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), leaf);
      top.position.y = 1.7;
      g.add(body, top);
      for (const side of [-1, 1]) {
        if (dice.chance(0.25)) continue;
        const h = 0.4 + dice.next() * 0.4;
        const out = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 6), leaf);
        out.rotation.z = Math.PI / 2;
        out.position.set(side * 0.38, 0.7 + h * 0.4, 0);
        const up = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, h, 6), leaf);
        up.position.set(side * 0.56, 0.7 + h * 0.4 + h / 2, 0);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), leaf);
        cap.position.set(side * 0.56, 0.7 + h * 0.4 + h, 0);
        g.add(out, up, cap);
      }
      break;
    }
    case "spire": {
      const h = 1.6 + dice.next() * 1.8;
      const rock = new THREE.Mesh(new THREE.ConeGeometry(0.5 + dice.next() * 0.3, h, 5), leaf);
      rock.position.y = h / 2 - 0.1;
      rock.rotation.set((dice.next() - 0.5) * 0.25, dice.next() * 3, (dice.next() - 0.5) * 0.25);
      g.add(rock);
      if (dice.chance(0.5)) {
        const small = new THREE.Mesh(new THREE.ConeGeometry(0.3, h * 0.5, 5), leaf);
        small.position.set(0.5, h * 0.25 - 0.1, 0.2);
        g.add(small);
      }
      break;
    }
  }
  return g;
}

function makeProp(
  kind: Prop,
  dice: Dice,
  p: Place,
  m: { glowStone: (c: string) => THREE.Material; bark: THREE.Material },
): THREE.Object3D {
  const g = new THREE.Group();
  switch (kind) {
    case "mushroom": {
      const night = p.id === "night";
      const cap = std(night ? "#8a5aff" : dice.chance(0.6) ? "#c8402a" : "#d8a060", {
        emissive: night ? "#7a4aff" : "#000000",
        emissiveIntensity: night ? 0.8 : 0,
      });
      const stem = std("#efe4d0");
      const n = dice.int(1, 3);
      for (let k = 0; k < n; k++) {
        const sc = 0.6 + dice.next() * 0.7;
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 5), stem);
        st.position.set(k * 0.14 - 0.1, 0.08 * sc, (dice.next() - 0.5) * 0.15);
        st.scale.setScalar(sc);
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), cap);
        top.position.set(st.position.x, 0.15 * sc, st.position.z);
        top.scale.setScalar(sc);
        g.add(st, top);
      }
      break;
    }
    case "pumpkin": {
      const lit = dice.chance(0.6);
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 10, 7),
        std("#e8701a", { emissive: "#ff6a0a", emissiveIntensity: lit ? 0.25 : 0.05, roughness: 0.7 }),
      );
      body.scale.set(1, 0.72, 1);
      body.position.y = 0.21;
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.12, 5), m.bark);
      stalk.position.y = 0.46;
      g.add(body, stalk);
      if (lit) {
        const face = std("#ffd24a", { emissive: "#ffb21a", emissiveIntensity: 3 });
        for (const ex of [-0.1, 0.1]) {
          const eye = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.07, 3), face);
          eye.rotation.x = Math.PI / 2;
          eye.position.set(ex, 0.27, 0.27);
          g.add(eye);
        }
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.02), face);
        mouth.position.set(0, 0.15, 0.285);
        g.add(mouth);
      }
      g.scale.setScalar(0.7 + dice.next() * 0.6);
      break;
    }
    case "grave": {
      const stone = std(dice.chance(0.5) ? "#6a6878" : "#57566a");
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.12), stone);
      slab.position.y = 0.27;
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 0.12, 10, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2),
        stone,
      );
      top.position.y = 0.55;
      g.add(slab, top);
      if (dice.chance(0.4)) {
        const dark = std("#3a3846");
        const cross = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.02), dark);
        cross.position.set(0, 0.4, 0.065);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.02), dark);
        bar.position.set(0, 0.45, 0.065);
        g.add(cross, bar);
      }
      g.rotation.z = (dice.next() - 0.5) * 0.25;
      break;
    }
    case "drift": {
      const mound = new THREE.Mesh(new THREE.SphereGeometry(0.6 + dice.next() * 0.6, 9, 6), std("#eef3fb", { roughness: 0.85 }));
      mound.scale.y = 0.28;
      g.add(mound);
      break;
    }
    case "crystal": {
      const color = p.id === "lava" ? (dice.chance(0.6) ? "#ff7a2a" : "#c05aff") : "#9fd8ff";
      const mat = m.glowStone(color);
      const n = dice.int(2, 4);
      for (let k = 0; k < n; k++) {
        const h = 0.3 + dice.next() * 0.5;
        const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), mat);
        cr.scale.set(1, h / 0.12, 1);
        cr.position.set((dice.next() - 0.5) * 0.4, h * 0.6, (dice.next() - 0.5) * 0.4);
        cr.rotation.set((dice.next() - 0.5) * 0.6, dice.next() * 3, (dice.next() - 0.5) * 0.6);
        g.add(cr);
      }
      break;
    }
    case "bush": {
      const leaf = std(p.id === "desert" ? "#7a7a3a" : p.leaves[dice.int(0, p.leaves.length - 1)]);
      for (let k = 0; k < 3; k++) {
        const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + dice.next() * 0.2, 0), leaf);
        blob.position.set((dice.next() - 0.5) * 0.5, 0.25, (dice.next() - 0.5) * 0.5);
        blob.scale.y = 0.75;
        g.add(blob);
      }
      break;
    }
    case "flower":
    case "stone":
      break;
  }
  return g;
}

// ---------- the air ----------

const AIR: Record<Air, { n: number; size: number; glow: boolean; opacity: number }> = {
  fireflies: { n: 70, size: 0.16, glow: true, opacity: 1 },
  leaves: { n: 90, size: 0.14, glow: false, opacity: 0.95 },
  snow: { n: 520, size: 0.09, glow: false, opacity: 0.9 },
  dust: { n: 180, size: 0.07, glow: false, opacity: 0.5 },
  embers: { n: 150, size: 0.1, glow: true, opacity: 1 },
  wisps: { n: 46, size: 0.3, glow: true, opacity: 0.7 },
};

/** What drifts over the field: fireflies, falling leaves, snow, dust, embers, will-o'-the-wisps. */
export class Weather {
  readonly points: THREE.Points;
  private readonly kind: Air;
  private readonly pos: Float32Array;
  private readonly home: Float32Array;
  private readonly col: Float32Array;
  private readonly base: Float32Array;
  private readonly salt: Float32Array;
  private readonly n: number;
  private readonly box = { x: HALF_W + 6, y: 6, z: HALF_D + 5 };

  constructor(p: Place) {
    const spec = AIR[p.air];
    const dice = new Dice(seedOf(`air:${p.id}`));
    this.kind = p.air;
    this.n = spec.n;
    this.pos = new Float32Array(this.n * 3);
    this.home = new Float32Array(this.n * 3);
    this.col = new Float32Array(this.n * 3);
    this.base = new Float32Array(this.n * 3);
    this.salt = new Float32Array(this.n);
    const c = new THREE.Color();
    for (let i = 0; i < this.n; i++) {
      const x = (dice.next() * 2 - 1) * this.box.x;
      const z = (dice.next() * 2 - 1) * this.box.z;
      const y = this.kind === "fireflies" || this.kind === "wisps" ? 0.4 + dice.next() * 2.2 : dice.next() * this.box.y;
      this.home.set([x, y, z], i * 3);
      this.pos.set([x, y, z], i * 3);
      c.set(p.airColors[dice.int(0, p.airColors.length - 1)]);
      this.base.set([c.r, c.g, c.b], i * 3);
      this.col.set([c.r, c.g, c.b], i * 3);
      this.salt[i] = dice.next();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: spec.size,
        map: dotTexture(),
        vertexColors: true,
        transparent: true,
        opacity: spec.opacity,
        depthWrite: false,
        blending: spec.glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    this.points.frustumCulled = false;
  }

  update(dt: number, t: number) {
    const { x: bx, y: by, z: bz } = this.box;
    const wrap = (v: number, m: number) => (v > m ? v - 2 * m : v < -m ? v + 2 * m : v);
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      const s = this.salt[i];
      let light = 1;
      switch (this.kind) {
        case "snow":
          this.pos[k + 1] -= (0.45 + s * 0.4) * dt;
          this.pos[k] = wrap(this.pos[k] + (Math.sin(t * 0.8 + s * 10) * 0.3 + 0.12) * dt, bx);
          if (this.pos[k + 1] < 0) this.pos[k + 1] += by;
          break;
        case "leaves":
          this.pos[k + 1] -= (0.3 + s * 0.25) * dt;
          this.pos[k] = wrap(this.pos[k] + (Math.sin(t * 1.4 + s * 20) * 0.9 + 0.35) * dt, bx);
          this.pos[k + 2] = wrap(this.pos[k + 2] + Math.cos(t * 1.1 + s * 13) * 0.4 * dt, bz);
          if (this.pos[k + 1] < 0) this.pos[k + 1] += by;
          light = 0.75 + Math.sin(t * 5 + s * 30) * 0.25;
          break;
        case "dust":
          this.pos[k] = wrap(this.pos[k] + (0.25 + s * 0.4) * dt, bx);
          this.pos[k + 1] = Math.max(0.05, this.home[k + 1] * 0.5 + Math.sin(t * 0.6 + s * 10) * 0.3);
          break;
        case "embers":
          this.pos[k + 1] += (0.5 + s * 0.6) * dt;
          this.pos[k] = wrap(this.pos[k] + Math.sin(t * 2 + s * 9) * 0.35 * dt, bx);
          if (this.pos[k + 1] > by) this.pos[k + 1] -= by;
          light = Math.max(0, 1 - this.pos[k + 1] / by) * (0.7 + Math.sin(t * 9 + s * 40) * 0.3);
          break;
        case "fireflies":
        case "wisps": {
          const slow = this.kind === "wisps" ? 0.5 : 1;
          this.pos[k] = this.home[k] + Math.sin(t * 0.45 * slow * (0.6 + s) + s * 20) * 1.3;
          this.pos[k + 1] = this.home[k + 1] + Math.sin(t * 0.7 * slow + s * 11) * 0.4;
          this.pos[k + 2] = this.home[k + 2] + Math.cos(t * 0.38 * slow * (0.6 + s) + s * 7) * 1.1;
          light =
            this.kind === "wisps" ? 0.6 + Math.sin(t * 1.3 + s * 17) * 0.4 : Math.max(0, Math.sin(t * (1.2 + s) + s * 31)) ** 3;
          break;
        }
      }
      this.col[k] = this.base[k] * light;
      this.col[k + 1] = this.base[k + 1] * light;
      this.col[k + 2] = this.base[k + 2] * light;
    }
    this.points.geometry.getAttribute("position").needsUpdate = true;
    this.points.geometry.getAttribute("color").needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
