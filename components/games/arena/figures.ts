import * as THREE from "three";

/*
 * The fighters as painted miniatures: low-poly figures made of a few shapes each, flat-shaded like a tabletop set,
 * one silhouette per class so a glance tells a shooter from a tank. Every figure has the same named joints (a body
 * that bobs, a head, two arms that swing, a prop in hand) so one set of moves animates them all.
 */

export interface Figure {
  root: THREE.Group;
  /** what bobs, leans and lunges */
  body: THREE.Group;
  armR: THREE.Group;
  armL: THREE.Group;
  head: THREE.Object3D;
  /** where shots and spells leave from, in the root's space */
  muzzle: THREE.Vector3;
  /** the top of the figure, for its health bar */
  height: number;
  /** the figure's own materials, to flash and fade without touching anyone else's */
  mats: THREE.MeshStandardMaterial[];
  /** it floats rather than stands */
  hover: boolean;
}

const SKIN = ["#f1c7a5", "#d9a07a", "#a8714f", "#7a4b32"];
const METAL = "#b9c2cf";
const DARK = "#2b2633";
const WOOD = "#8a5a3b";
const GOLD = "#e8b84a";

type Mk = (color: string, opts?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial;

function kit(mats: THREE.MeshStandardMaterial[]): Mk {
  return (color, opts = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.05, flatShading: true, ...opts });
    mats.push(m);
    return m;
  };
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

const cyl = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const ball = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg);

/** An arm: a joint at the shoulder with the sleeve and hand hanging from it, so it swings from the top. */
function arm(m: THREE.Material, hand: THREE.Material, side: 1 | -1, y: number, x = 0.27): THREE.Group {
  const g = new THREE.Group();
  g.position.set(side * x, y, 0);
  g.add(mesh(cyl(0.065, 0.075, 0.3, 6), m, 0, -0.15, 0));
  g.add(mesh(ball(0.07, 6, 5), hand, 0, -0.32, 0));
  return g;
}

interface Shape {
  color: string;
  skin: string;
  m: Mk;
  body: THREE.Group;
  armR: THREE.Group;
  armL: THREE.Group;
  head: THREE.Object3D;
}

/** The common figure: legs, a tunic in the agent's colour, arms, a head; classes add their gear to it. */
function person(mk: Mk, color: string, skin: string, robe = false, scale = 1): Shape {
  const body = new THREE.Group();
  const cloth = mk(color);
  const dark = mk(DARK);
  const flesh = mk(skin);
  if (robe) body.add(mesh(cyl(0.2, 0.33, 0.5, 8), cloth, 0, 0.25, 0));
  else {
    body.add(mesh(cyl(0.07, 0.06, 0.3, 6), dark, -0.1, 0.15, 0));
    body.add(mesh(cyl(0.07, 0.06, 0.3, 6), dark, 0.1, 0.15, 0));
    body.add(mesh(box(0.1, 0.07, 0.17), dark, -0.1, 0.03, 0.03));
    body.add(mesh(box(0.1, 0.07, 0.17), dark, 0.1, 0.03, 0.03));
  }
  body.add(mesh(cyl(0.2, 0.24, 0.38, 8), cloth, 0, 0.48, 0));
  body.add(mesh(cyl(0.25, 0.25, 0.06, 8), mk(WOOD), 0, 0.33, 0));
  const head = mesh(ball(0.16, 12, 10), flesh, 0, 0.85, 0);
  body.add(head);
  body.add(mesh(ball(0.025, 4, 3), dark, -0.06, 0.87, 0.145));
  body.add(mesh(ball(0.025, 4, 3), dark, 0.06, 0.87, 0.145));
  const armR = arm(cloth, flesh, 1, 0.62);
  const armL = arm(cloth, flesh, -1, 0.62);
  body.add(armR, armL);
  body.scale.setScalar(scale);
  return { color, skin, m: mk, body, armR, armL, head };
}

function sword(mk: Mk, len = 0.55): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(box(0.05, len, 0.015), mk(METAL, { metalness: 0.6, roughness: 0.3 }), 0, -0.32 - len / 2, 0.06));
  g.add(mesh(box(0.18, 0.035, 0.05), mk(GOLD, { metalness: 0.5 }), 0, -0.32, 0.06));
  g.add(mesh(cyl(0.025, 0.025, 0.12, 5), mk(WOOD), 0, -0.26, 0.06));
  g.rotation.x = Math.PI;
  return g;
}

function shield(mk: Mk, color: string, r = 0.2, tall = 1): THREE.Mesh {
  const s = mesh(cyl(r, r, 0.05, 10), mk(color, { metalness: 0.3 }), 0, -0.25, 0.1);
  s.rotation.x = Math.PI / 2;
  s.scale.set(1, 1, tall);
  return s;
}

function hood(mk: Mk, color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(ball(0.19, 10, 8, ), mk(color), 0, 0.88, -0.02));
  g.add(mesh(cone(0.12, 0.2, 8), mk(color), 0, 1.06, -0.08));
  return g;
}

function staff(mk: Mk, orb: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.025, 0.03, 1.0, 6), mk(WOOD), 0, -0.05, 0.08));
  g.add(mesh(new THREE.IcosahedronGeometry(0.08, 0), mk(orb, { emissive: orb, emissiveIntensity: 2.2 }), 0, 0.48, 0.08));
  return g;
}

type Build = (mk: Mk, color: string, skin: string) => Shape & { muzzle?: THREE.Vector3; height?: number; hover?: boolean };

const BUILDS: Record<string, Build> = {
  knight(mk, color, skin) {
    const s = person(mk, color, skin);
    s.body.add(mesh(ball(0.18, 10, 8, ), mk(METAL, { metalness: 0.5, roughness: 0.35 }), 0, 0.9, 0));
    s.body.add(mesh(box(0.22, 0.05, 0.04), mk(DARK), 0, 0.86, 0.16));
    s.body.add(mesh(cone(0.05, 0.16, 6), mk(color), 0, 1.1, 0));
    s.armR.add(sword(mk));
    s.armL.add(shield(mk, color));
    return s;
  },
  ranger(mk, color, skin) {
    const s = person(mk, color, skin);
    s.body.add(hood(mk, "#3d5a3a"));
    const bow = mesh(new THREE.TorusGeometry(0.28, 0.022, 4, 12, Math.PI), mk(WOOD), 0, -0.3, 0.12);
    bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
    s.armL.add(bow);
    s.body.add(mesh(cyl(0.06, 0.06, 0.4, 6), mk("#6b4a2f"), 0.1, 0.55, -0.24));
    return { ...s, muzzle: new THREE.Vector3(0, 0.6, 0.4) };
  },
  duelist(mk, color, skin) {
    const s = person(mk, color, skin);
    s.body.add(mesh(cyl(0.2, 0.2, 0.05, 10), mk(DARK), 0, 1.0, 0));
    s.body.add(mesh(cyl(0.12, 0.15, 0.14, 10), mk(DARK), 0, 1.08, 0));
    s.body.add(mesh(box(0.05, 0.04, 0.28), mk("#d24b4b"), 0.14, 1.06, 0));
    s.armR.add(sword(mk, 0.62));
    const dagger = sword(mk, 0.3);
    s.armL.add(dagger);
    return s;
  },
  guardian(mk, color, skin) {
    const s = person(mk, color, skin, false, 1.12);
    s.body.add(mesh(cyl(0.3, 0.3, 0.14, 8), mk(METAL, { metalness: 0.5 }), 0, 0.66, 0));
    s.body.add(mesh(ball(0.19, 10, 8), mk(METAL, { metalness: 0.5, roughness: 0.3 }), 0, 0.9, 0));
    s.body.add(mesh(box(0.06, 0.2, 0.05), mk(DARK), 0, 0.88, 0.17));
    const tower = mesh(box(0.42, 0.62, 0.06), mk(color, { metalness: 0.35 }), 0.02, -0.2, 0.17);
    s.armL.add(tower);
    s.armL.add(mesh(box(0.1, 0.1, 0.03), mk(GOLD, { metalness: 0.6 }), 0.02, -0.15, 0.21));
    s.armR.add(sword(mk, 0.4));
    return s;
  },
  mage(mk, color, skin) {
    const s = person(mk, color, skin, true);
    s.body.add(mesh(cyl(0.3, 0.3, 0.03, 12), mk(color), 0, 0.98, 0));
    s.body.add(mesh(cone(0.17, 0.42, 10), mk(color), 0, 1.2, 0));
    s.body.add(mesh(cone(0.06, 0.12, 6), mk("#f3f0ff"), 0, 0.73, 0.15));
    s.armR.add(staff(mk, "#9fd7ff"));
    return { ...s, muzzle: new THREE.Vector3(0.27, 1.0, 0.1) };
  },
  rogue(mk, color, skin) {
    const s = person(mk, color, skin, false, 0.95);
    s.body.add(hood(mk, "#2a2a38"));
    s.body.add(mesh(box(0.18, 0.06, 0.03), mk("#2a2a38"), 0, 0.8, 0.15));
    const wing = (side: number) => {
      const w = mesh(new THREE.ConeGeometry(0.22, 0.6, 3), mk("#cfe8ff", { transparent: true, opacity: 0.75, emissive: "#6fb7ff", emissiveIntensity: 0.6 }), side * 0.22, 0.62, -0.18);
      w.rotation.set(0.3, 0, side * 1.1);
      w.name = side > 0 ? "wingR" : "wingL";
      return w;
    };
    s.body.add(wing(1), wing(-1));
    s.armR.add(sword(mk, 0.32));
    s.armL.add(sword(mk, 0.32));
    return { ...s, hover: true };
  },
  engineer(mk, color, skin) {
    const s = person(mk, color, skin);
    s.body.add(mesh(cyl(0.18, 0.2, 0.08, 10), mk(GOLD), 0, 0.98, 0));
    s.body.add(mesh(box(0.3, 0.06, 0.06), mk("#253040", { transparent: true, opacity: 0.85 }), 0, 0.92, 0.15));
    s.body.add(mesh(box(0.34, 0.36, 0.18), mk("#5b6470", { metalness: 0.4 }), 0, 0.55, -0.24));
    const tube = mesh(cyl(0.07, 0.08, 0.6, 8), mk("#444c58", { metalness: 0.6, roughness: 0.35 }), 0.24, 0.86, 0.02);
    tube.rotation.x = Math.PI / 2 - 0.15;
    s.body.add(tube);
    s.body.add(mesh(cyl(0.05, 0.05, 0.02, 8), mk("#ff9a3c", { emissive: "#ff7a1a", emissiveIntensity: 2 }), 0.24, 0.9, 0.33));
    return { ...s, muzzle: new THREE.Vector3(0.24, 0.92, 0.4) };
  },
  healer(mk, color, skin) {
    const s = person(mk, color, skin, true);
    s.body.add(mesh(new THREE.TorusGeometry(0.16, 0.02, 4, 16), mk("#fff6c9", { emissive: "#ffe27a", emissiveIntensity: 1.6 }), 0, 1.12, 0));
    s.body.children[s.body.children.length - 1].rotation.x = Math.PI / 2;
    s.body.add(mesh(box(0.06, 0.2, 0.02), mk("#5fe3a1", { emissive: "#2fc27a", emissiveIntensity: 0.8 }), 0, 0.5, 0.25));
    s.body.add(mesh(box(0.16, 0.06, 0.02), mk("#5fe3a1", { emissive: "#2fc27a", emissiveIntensity: 0.8 }), 0, 0.52, 0.25));
    s.armR.add(staff(mk, "#7dffb9"));
    return { ...s, muzzle: new THREE.Vector3(0.27, 1.0, 0.1) };
  },
  hero(mk, color, skin) {
    const s = person(mk, color, skin, false, 1.18);
    const cape = mesh(new THREE.PlaneGeometry(0.5, 0.7, 1, 3), mk(color, { side: THREE.DoubleSide }), 0, 0.42, -0.25);
    cape.rotation.x = 0.18;
    cape.name = "cape";
    s.body.add(cape);
    s.body.add(mesh(cyl(0.3, 0.27, 0.12, 8), mk(GOLD, { metalness: 0.6, roughness: 0.3 }), 0, 0.66, 0));
    const crown = new THREE.Group();
    crown.add(mesh(cyl(0.15, 0.15, 0.07, 8, ), mk(GOLD, { metalness: 0.7, roughness: 0.25 }), 0, 0, 0));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      crown.add(mesh(cone(0.03, 0.09, 4), mk(GOLD, { metalness: 0.7 }), Math.sin(a) * 0.13, 0.07, Math.cos(a) * 0.13));
    }
    crown.position.y = 1.02;
    s.body.add(crown);
    s.body.add(mesh(new THREE.OctahedronGeometry(0.07), mk(color, { emissive: color, emissiveIntensity: 2.5 }), 0, 0.52, 0.24));
    s.armR.add(sword(mk, 0.66));
    return s;
  },
  minion(mk, color, skin) {
    const s = person(mk, color, skin, false, 0.72);
    s.body.add(mesh(new THREE.OctahedronGeometry(0.05), mk(color, { emissive: color, emissiveIntensity: 2 }), 0, 1.08, 0));
    s.armR.add(sword(mk, 0.36));
    return { ...s, height: 0.95 };
  },
  ghost(mk, color) {
    const body = new THREE.Group();
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector2(0.06 + Math.sin(t * Math.PI * 0.9) * 0.32 * (1 - t * 0.25), t * 1.0));
    }
    const sheet = mk("#e8ecff", { transparent: true, opacity: 0.82, emissive: "#8fa3ff", emissiveIntensity: 0.35 });
    body.add(mesh(new THREE.LatheGeometry(pts, 10), sheet, 0, 0.15, 0));
    body.add(mesh(ball(0.26, 10, 8), sheet, 0, 1.05, 0));
    const eye = mk("#20103a", { emissive: color, emissiveIntensity: 1.2 });
    body.add(mesh(ball(0.05, 6, 5), eye, -0.09, 1.08, 0.22), mesh(ball(0.05, 6, 5), eye, 0.09, 1.08, 0.22));
    const armR = new THREE.Group();
    armR.position.set(0.3, 0.75, 0);
    armR.add(mesh(cone(0.07, 0.35, 6), sheet, 0, -0.15, 0.05));
    const armL = armR.clone();
    armL.position.x = -0.3;
    body.add(armR, armL);
    return { color, skin: "", m: mk, body, armR, armL, head: body.children[1], hover: true, height: 1.45 };
  },
  slime(mk, color) {
    const body = new THREE.Group();
    const goo = mk(color, { transparent: true, opacity: 0.85, roughness: 0.15, metalness: 0.1, emissive: color, emissiveIntensity: 0.25, flatShading: false });
    const blob = mesh(ball(0.48, 16, 12), goo, 0, 0.36, 0);
    blob.scale.set(1, 0.75, 1);
    body.add(blob);
    body.add(mesh(ball(0.14, 10, 8), mk("#ffffff", { roughness: 0.1 }), -0.15, 0.5, 0.38));
    body.add(mesh(ball(0.14, 10, 8), mk("#ffffff", { roughness: 0.1 }), 0.15, 0.5, 0.38));
    body.add(mesh(ball(0.06, 6, 5), mk(DARK), -0.15, 0.5, 0.5), mesh(ball(0.06, 6, 5), mk(DARK), 0.15, 0.5, 0.5));
    for (let i = 0; i < 4; i++) body.add(mesh(ball(0.06, 6, 5), goo, Math.sin(i * 1.7) * 0.3, 0.1 + i * 0.12, Math.cos(i * 2.1) * 0.3));
    const armR = new THREE.Group();
    const armL = new THREE.Group();
    body.add(armR, armL);
    return { color, skin: "", m: mk, body, armR, armL, head: blob, height: 0.95 };
  },
  slimeSmall(mk, color, skin) {
    const s = BUILDS.slime(mk, color, skin);
    s.body.scale.setScalar(0.62);
    return { ...s, height: 0.65 };
  },
  imp(mk, color) {
    const s = person(mk, "#c0392b", "#e0533f", false, 0.85);
    s.body.add(mesh(cone(0.05, 0.18, 5), mk(DARK), -0.1, 1.0, 0), mesh(cone(0.05, 0.18, 5), mk(DARK), 0.1, 1.0, 0));
    const eye = mk("#ffe066", { emissive: "#ffcc00", emissiveIntensity: 2 });
    s.body.add(mesh(ball(0.03, 4, 3), eye, -0.06, 0.88, 0.15), mesh(ball(0.03, 4, 3), eye, 0.06, 0.88, 0.15));
    const tail = mesh(cyl(0.02, 0.04, 0.5, 5), mk("#c0392b"), 0, 0.3, -0.28);
    tail.rotation.x = -0.9;
    s.body.add(tail);
    s.armR.add(mesh(cone(0.03, 0.5, 4), mk(color, { emissive: color, emissiveIntensity: 0.8 }), 0, -0.45, 0.05));
    return s;
  },
  mushroom(mk) {
    const body = new THREE.Group();
    body.add(mesh(cyl(0.16, 0.22, 0.55, 10), mk("#efe4cf"), 0, 0.3, 0));
    const cap = mesh(ball(0.42, 14, 8), mk("#b23a48"), 0, 0.68, 0);
    cap.scale.set(1, 0.55, 1);
    body.add(cap);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      body.add(mesh(ball(0.06, 6, 5), mk("#fff6e6"), Math.sin(a) * 0.27, 0.8, Math.cos(a) * 0.27));
    }
    const eye = mk(DARK);
    body.add(mesh(ball(0.035, 5, 4), eye, -0.07, 0.4, 0.18), mesh(ball(0.035, 5, 4), eye, 0.07, 0.4, 0.18));
    const armR = new THREE.Group();
    armR.position.set(0.2, 0.4, 0);
    const armL = armR.clone();
    armL.position.x = -0.2;
    body.add(armR, armL);
    return { color: "", skin: "", m: mk, body, armR, armL, head: cap, muzzle: new THREE.Vector3(0, 0.75, 0.3), height: 1.1 };
  },
  tentacle(mk, color) {
    const body = new THREE.Group();
    const flesh = mk("#d9a441", { roughness: 0.4 });
    body.add(mesh(ball(0.36, 12, 8), mk("#9c6b2a"), 0, 0.12, 0));
    const armR = new THREE.Group();
    const armL = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const t = new THREE.Group();
      t.position.set(Math.sin(a) * 0.22, 0.2, Math.cos(a) * 0.22);
      let y = 0;
      for (let k = 0; k < 4; k++) {
        const r = 0.09 - k * 0.018;
        t.add(mesh(ball(r, 6, 5), flesh, Math.sin(k + i) * 0.06, y, 0));
        y += r * 1.6;
      }
      t.rotation.z = Math.sin(a) * 0.4;
      t.rotation.x = Math.cos(a) * 0.4;
      t.name = `tentacle${i}`;
      (i % 2 ? armL : armR).add(t);
    }
    body.add(armR, armL);
    body.add(mesh(ball(0.05, 6, 5), mk("#fff", { emissive: color, emissiveIntensity: 1 }), 0, 0.36, 0.3));
    return { color, skin: "", m: mk, body, armR, armL, head: body.children[0], height: 1.0 };
  },
  golem(mk, color) {
    const body = new THREE.Group();
    const stone = mk("#7d7a73");
    body.add(mesh(box(0.62, 0.62, 0.46), stone, 0, 0.62, 0));
    body.add(mesh(box(0.34, 0.3, 0.32), stone, 0, 1.08, 0.02));
    const glow = mk("#ff6a3a", { emissive: "#ff4a1a", emissiveIntensity: 2.4 });
    body.add(mesh(box(0.08, 0.04, 0.02), glow, -0.08, 1.1, 0.19), mesh(box(0.08, 0.04, 0.02), glow, 0.08, 1.1, 0.19));
    body.add(mesh(box(0.22, 0.32, 0.26), stone, -0.17, 0.16, 0), mesh(box(0.22, 0.32, 0.26), stone, 0.17, 0.16, 0));
    const chain = mk(METAL, { metalness: 0.7, roughness: 0.3 });
    for (let i = 0; i < 5; i++) {
      const link = mesh(new THREE.TorusGeometry(0.06, 0.018, 4, 8), chain, -0.3 + i * 0.15, 0.7 - Math.abs(i - 2) * 0.05, 0.25);
      link.rotation.y = i % 2 ? Math.PI / 2 : 0;
      body.add(link);
    }
    const fist = (side: number) => {
      const g = new THREE.Group();
      g.position.set(side * 0.45, 0.85, 0);
      g.add(mesh(box(0.2, 0.42, 0.2), stone, 0, -0.2, 0));
      g.add(mesh(box(0.26, 0.24, 0.26), stone, 0, -0.48, 0));
      return g;
    };
    const armR = fist(1);
    const armL = fist(-1);
    body.add(armR, armL);
    void color;
    return { color, skin: "", m: mk, body, armR, armL, head: body.children[1], height: 1.4 };
  },
  boss(mk, color) {
    const body = new THREE.Group();
    const stone = mk("#4a4458", { roughness: 0.8 });
    const tower = mesh(cyl(0.45, 0.62, 2.1, 6), stone, 0, 1.05, 0);
    body.add(tower);
    body.add(mesh(cone(0.46, 0.5, 6), stone, 0, 2.35, 0));
    const lava = mk("#ff5a2a", { emissive: "#ff3a0a", emissiveIntensity: 2.6 });
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9;
      const c = mesh(box(0.04, 0.5 + (i % 3) * 0.2, 0.02), lava, Math.sin(a) * 0.53, 0.5 + i * 0.22, Math.cos(a) * 0.53);
      c.rotation.y = a;
      c.rotation.z = 0.3 * (i % 2 ? 1 : -1);
      body.add(c);
    }
    const eye = mesh(ball(0.16, 12, 10), mk("#fff1c2", { emissive: color || "#ffb23a", emissiveIntensity: 3 }), 0, 1.75, 0.45);
    body.add(eye);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const shard = mesh(new THREE.OctahedronGeometry(0.22, 0), stone, Math.sin(a) * 0.95, 1.4 + (i % 2) * 0.35, Math.cos(a) * 0.95);
      shard.name = `shard${i}`;
      body.add(shard);
    }
    const armR = new THREE.Group();
    const armL = new THREE.Group();
    body.add(armR, armL);
    return { color, skin: "", m: mk, body, armR, armL, head: eye, height: 2.75, muzzle: new THREE.Vector3(0, 1.75, 0.6) };
  },
  server(mk) {
    const body = new THREE.Group();
    body.add(mesh(box(0.7, 1.2, 0.6), mk("#2c3340", { metalness: 0.5, roughness: 0.4 }), 0, 0.6, 0));
    for (let i = 0; i < 5; i++) {
      body.add(mesh(box(0.6, 0.12, 0.02), mk("#3d4656", { metalness: 0.5 }), 0, 0.25 + i * 0.2, 0.31));
      const led = mk(i % 2 ? "#5dff9a" : "#5ac8ff", { emissive: i % 2 ? "#2bff73" : "#2aa8ff", emissiveIntensity: 2.5 });
      body.add(mesh(box(0.05, 0.04, 0.02), led, 0.22, 0.25 + i * 0.2, 0.33));
    }
    const armR = new THREE.Group();
    const armL = new THREE.Group();
    body.add(armR, armL);
    return { color: "", skin: "", m: mk, body, armR, armL, head: body.children[0], height: 1.35 };
  },
};

/** A figure for a body, in an agent's colour and one of a few skin tones; unknown bodies get the common one. */
export function makeFigure(bodyName: string, color: string, look = 0): Figure {
  const mats: THREE.MeshStandardMaterial[] = [];
  const mk = kit(mats);
  const skin = SKIN[Math.abs(look) % SKIN.length];
  const build = BUILDS[bodyName] ?? ((m: Mk, c: string, s: string) => person(m, c, s));
  const s = build(mk, color, skin);
  const root = new THREE.Group();
  root.add(s.body);
  const bounds = new THREE.Box3().setFromObject(s.body);
  return {
    root,
    body: s.body,
    armR: s.armR,
    armL: s.armL,
    head: s.head,
    muzzle: s.muzzle ?? new THREE.Vector3(0.25, 0.7, 0.3),
    height: s.height ?? bounds.max.y,
    mats,
    hover: !!s.hover,
  };
}

export function disposeFigure(f: Figure) {
  f.root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
  for (const m of f.mats) m.dispose();
}
