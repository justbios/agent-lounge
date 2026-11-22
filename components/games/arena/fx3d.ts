import * as THREE from "three";
import type { Clock } from "./tween";

/*
 * The arena's effects: sparks and dust as one pool of glowing points, chips that fly off and bounce, rings that spread
 * over the ground, a blade's arc, things that fly from a shooter to its target, and the numbers that pop over a
 * fighter's head.
 */

const POOL = 1600;

export interface Burst {
  color: THREE.ColorRepresentation;
  n?: number;
  /** how fast they fly out, units a second */
  speed?: number;
  /** seconds */
  life?: number;
  size?: number;
  /** pulls them down; negative lifts them, like sparks off a heal */
  gravity?: number;
  /** how much they head upward rather than every way */
  up?: number;
  /** a flat ring of them, out along the ground */
  flat?: boolean;
  /** start spread over a disc this wide */
  spread?: number;
  /** they fly this way, as off a blow, rather than every way; `cone` is how far they stray from it, 0–1 */
  dir?: THREE.Vector3;
  cone?: number;
}

export class Particles {
  readonly points: THREE.Points;
  private readonly pos = new Float32Array(POOL * 3);
  private readonly vel = new Float32Array(POOL * 3);
  private readonly col = new Float32Array(POOL * 3);
  private readonly size = new Float32Array(POOL);
  private readonly alpha = new Float32Array(POOL);
  private readonly life = new Float32Array(POOL);
  private readonly max = new Float32Array(POOL);
  private readonly grav = new Float32Array(POOL);
  private readonly base = new Float32Array(POOL);
  private next = 0;
  private readonly mat: THREE.ShaderMaterial;
  private readonly c = new THREE.Color();

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uScale;
        void main() {
          vColor = color;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d) * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor * 2.2, a);
        }`,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }

  /** How big a point of size 1 is on the screen, set when the canvas or the camera changes. */
  setScale(viewportHeight: number, fov: number) {
    this.mat.uniforms.uScale.value = viewportHeight / (2 * Math.tan((fov * Math.PI) / 360));
  }

  burst(at: THREE.Vector3, o: Burst) {
    const n = o.n ?? 16;
    this.c.set(o.color);
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % POOL;
      const a = Math.random() * Math.PI * 2;
      const r = (o.spread ?? 0) * Math.sqrt(Math.random());
      this.pos[i * 3] = at.x + Math.cos(a) * r;
      this.pos[i * 3 + 1] = at.y;
      this.pos[i * 3 + 2] = at.z + Math.sin(a) * r;
      const sp = (o.speed ?? 2.5) * (0.4 + Math.random() * 0.8);
      let vx: number, vy: number, vz: number;
      if (o.dir) {
        const c = (o.cone ?? 0.5) * sp;
        vx = o.dir.x * sp + (Math.random() - 0.5) * 2 * c;
        vy = o.dir.y * sp + (Math.random() - 0.2) * 2 * c;
        vz = o.dir.z * sp + (Math.random() - 0.5) * 2 * c;
      } else if (o.flat) {
        vx = Math.cos(a) * sp;
        vz = Math.sin(a) * sp;
        vy = Math.random() * 0.4;
      } else {
        const u = Math.random() * 2 - 1 + (o.up ?? 0.4);
        const t = Math.random() * Math.PI * 2;
        const s = Math.sqrt(Math.max(0, 1 - Math.min(1, u * u)));
        vx = Math.cos(t) * s * sp;
        vz = Math.sin(t) * s * sp;
        vy = Math.min(1, u) * sp;
      }
      this.vel[i * 3] = vx;
      this.vel[i * 3 + 1] = vy;
      this.vel[i * 3 + 2] = vz;
      const tint = 0.8 + Math.random() * 0.4;
      this.col[i * 3] = this.c.r * tint;
      this.col[i * 3 + 1] = this.c.g * tint;
      this.col[i * 3 + 2] = this.c.b * tint;
      this.base[i] = (o.size ?? 0.18) * (0.6 + Math.random() * 0.8);
      this.size[i] = this.base[i];
      this.max[i] = (o.life ?? 0.7) * (0.6 + Math.random() * 0.6);
      this.life[i] = this.max[i];
      this.grav[i] = o.gravity ?? 4;
      this.alpha[i] = 1;
    }
  }

  update(dt: number) {
    for (let i = 0; i < POOL; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) {
          this.alpha[i] = 0;
          this.size[i] = 0;
        }
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const drag = 1 - 1.6 * dt;
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.05, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = k < 0.3 ? k / 0.3 : 1;
      this.size[i] = this.base[i] * (0.5 + 0.5 * k);
    }
    const g = this.points.geometry;
    for (const name of ["position", "color", "aSize", "aAlpha"]) g.getAttribute(name).needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

const CHIPS = 280;

export interface Chips {
  /** each chip takes one of these */
  colors: THREE.ColorRepresentation[];
  n?: number;
  speed?: number;
  /** a chip's side, units */
  size?: number;
  life?: number;
  /** they fly mostly this way */
  dir?: THREE.Vector3;
  /** how much they head upward */
  up?: number;
  /** start spread through a ball this wide */
  spread?: number;
  /** how hard they fall: rubble drops, paper drifts */
  gravity?: number;
}

/**
 * Chips of whatever was hit: small flat-shaded cubes, one instanced mesh of them, that fly off, fall, bounce once or
 * twice on the tiles and shrink away. A fallen fighter breaks into these; a heavy blow knocks a few loose.
 */
export class Debris {
  readonly mesh: THREE.InstancedMesh;
  private readonly pos = new Float32Array(CHIPS * 3);
  private readonly vel = new Float32Array(CHIPS * 3);
  private readonly rot = new Float32Array(CHIPS * 3);
  private readonly spin = new Float32Array(CHIPS * 3);
  private readonly size = new Float32Array(CHIPS);
  private readonly life = new Float32Array(CHIPS);
  private readonly max = new Float32Array(CHIPS);
  private readonly grav = new Float32Array(CHIPS);
  private next = 0;
  private live = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor() {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }),
      CHIPS,
    );
    const none = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < CHIPS; i++) {
      this.mesh.setMatrixAt(i, none);
      this.mesh.setColorAt(i, this.c.set("#ffffff"));
    }
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
  }

  burst(at: THREE.Vector3, o: Chips) {
    const n = o.n ?? 10;
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % CHIPS;
      const r = (o.spread ?? 0.25) * Math.cbrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(Math.random() * 2 - 1);
      this.pos[i * 3] = at.x + Math.sin(b) * Math.cos(a) * r;
      this.pos[i * 3 + 1] = at.y + Math.abs(Math.cos(b)) * r;
      this.pos[i * 3 + 2] = at.z + Math.sin(b) * Math.sin(a) * r;
      const sp = (o.speed ?? 3) * (0.45 + Math.random() * 0.75);
      const t = Math.random() * Math.PI * 2;
      let vx = Math.cos(t) * sp * 0.75;
      let vz = Math.sin(t) * sp * 0.75;
      if (o.dir) {
        vx = vx * 0.55 + o.dir.x * sp;
        vz = vz * 0.55 + o.dir.z * sp;
      }
      this.vel[i * 3] = vx;
      this.vel[i * 3 + 1] = sp * (o.up ?? 0.9) * (0.6 + Math.random() * 0.8);
      this.vel[i * 3 + 2] = vz;
      for (let j = 0; j < 3; j++) {
        this.rot[i * 3 + j] = Math.random() * 6.28;
        this.spin[i * 3 + j] = (Math.random() - 0.5) * 16;
      }
      this.size[i] = (o.size ?? 0.1) * (0.6 + Math.random() * 0.8);
      this.max[i] = (o.life ?? 1.1) * (0.7 + Math.random() * 0.6);
      this.life[i] = this.max[i];
      this.grav[i] = o.gravity ?? 13;
      this.c.set(o.colors[Math.floor(Math.random() * o.colors.length)]);
      this.mesh.setColorAt(i, this.c);
    }
    this.live = Math.max(this.live, (o.life ?? 1.1) * 1.4);
    this.mesh.instanceColor!.needsUpdate = true;
  }

  /** `floor` is the height the chips land on. */
  update(dt: number, floor: number) {
    if (this.live <= 0) return;
    this.live -= dt;
    for (let i = 0; i < CHIPS; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      if (this.life[i] <= 0) {
        this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        continue;
      }
      this.vel[k + 1] -= this.grav[i] * dt;
      if (this.grav[i] < 6) {
        // paper: the air holds it back and it flutters down
        const drag = Math.exp(-dt * 1.6);
        this.vel[k] *= drag;
        this.vel[k + 2] *= drag;
        this.vel[k + 1] = Math.max(this.vel[k + 1], -2.2);
      }
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const rest = floor + this.size[i] / 2;
      if (this.pos[k + 1] < rest) {
        this.pos[k + 1] = rest;
        this.vel[k + 1] = this.vel[k + 1] < -1.2 ? -this.vel[k + 1] * 0.38 : 0;
        this.vel[k] *= 0.6;
        this.vel[k + 2] *= 0.6;
        for (let j = 0; j < 3; j++) this.spin[k + j] *= 0.5;
      }
      for (let j = 0; j < 3; j++) this.rot[k + j] += this.spin[k + j] * dt;
      const left = this.life[i] / this.max[i];
      const sz = this.size[i] * (left < 0.3 ? left / 0.3 : 1);
      this.q.setFromEuler(this.e.set(this.rot[k], this.rot[k + 1], this.rot[k + 2]));
      this.m.compose(this.p.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]), this.q, this.s.setScalar(sz));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** A blade's arc: a crescent lying flat, thick in the middle and gone at its ends, opening along +x. */
const ARC = (() => {
  const n = 18;
  const half = 1.15;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -half + (2 * half * i) / n;
    const w = Math.cos((a / half) * (Math.PI / 2)) ** 0.8;
    const inner = 1 - 0.36 * w;
    pos.push(Math.cos(a), 0, -Math.sin(a), Math.cos(a) * inner, 0, -Math.sin(a) * inner);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
})();

/**
 * A blade's arc through the air in front of whoever swings it: at `at`, opening the way `face` looks (about y, 0
 * towards +z), sweeping across as it fades.
 */
export function slash(
  scene: THREE.Scene,
  clock: Clock,
  at: THREE.Vector3,
  face: number,
  color: THREE.ColorRepresentation,
  size = 1,
  secs = 0.2,
): Promise<void> {
  // drawn plainly rather than added to what is behind it: over snow or sand an added arc is only more white
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide });
  const o = new THREE.Mesh(ARC, m);
  o.position.copy(at);
  o.rotation.order = "YXZ";
  o.rotation.x = 0.28;
  scene.add(o);
  return clock
    .tween(
      secs,
      (k) => {
        o.rotation.y = face - Math.PI / 2 - 1.0 + k * 1.5;
        o.scale.setScalar(size * (0.8 + k * 0.45));
        m.opacity = k < 0.3 ? 0.95 : 0.95 * (1 - (k - 0.3) / 0.7);
      },
      (t) => 1 - (1 - t) ** 3,
    )
    .then(() => {
      scene.remove(o);
      m.dispose();
    });
}

const RING = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
const DISC = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);

/** A ring that spreads out over the ground from `at`, from radius `from` to `to`, fading as it goes. */
export function ring(
  scene: THREE.Scene,
  clock: Clock,
  at: THREE.Vector3,
  color: THREE.ColorRepresentation,
  from: number,
  to: number,
  secs: number,
  filled = false,
): Promise<void> {
  const m = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const o = new THREE.Mesh(filled ? DISC : RING, m);
  o.position.copy(at);
  scene.add(o);
  return clock
    .tween(
      secs,
      (k) => {
        o.scale.setScalar(from + (to - from) * k);
        m.opacity = 0.9 * (1 - k);
      },
      (t) => 1 - (1 - t) ** 2,
    )
    .then(() => {
      scene.remove(o);
      m.dispose();
    });
}

export type Missile = "arrow" | "bolt" | "shell" | "spore" | "orb";

const ARROW = (() => {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 5), new THREE.MeshStandardMaterial({ color: "#8a5a3b" }));
  shaft.rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 5), new THREE.MeshStandardMaterial({ color: "#d8dee8", metalness: 0.6 }));
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.36;
  g.add(shaft, head);
  return g;
})();

/**
 * Sends something from `a` to `b`: an arrow or a shell on an arc, a bolt or an orb straight, each trailing sparks.
 * Resolves as it lands.
 */
export function fly(
  scene: THREE.Scene,
  clock: Clock,
  fx: Particles,
  kind: Missile,
  a: THREE.Vector3,
  b: THREE.Vector3,
  color: THREE.ColorRepresentation,
): Promise<void> {
  const dist = a.distanceTo(b);
  const lob = kind === "shell" || kind === "spore";
  const arc = kind === "arrow" ? dist * 0.07 : kind === "shell" ? 1 + dist * 0.2 : kind === "spore" ? 0.6 + dist * 0.14 : 0;
  // a shot is over in a blink however far it goes: nobody waits two seconds for a spore to cross the field
  const speed = kind === "arrow" ? 30 : lob ? 17 : 24;
  const secs = Math.min(lob ? 0.56 : 0.4, Math.max(0.15, dist / speed));
  let o: THREE.Object3D;
  let mat: THREE.Material | null = null;
  if (kind === "arrow") {
    o = ARROW.clone();
    o.scale.setScalar(1.7);
  } else {
    const r = kind === "shell" ? 0.16 : kind === "spore" ? 0.15 : 0.13;
    mat =
      kind === "shell"
        ? new THREE.MeshStandardMaterial({ color: "#2b2b33", metalness: 0.5, emissive: "#ff7a1a", emissiveIntensity: 1.4 })
        : new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3 });
    o = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
  }
  scene.add(o);
  const p = new THREE.Vector3();
  const prev = a.clone();
  const ahead = new THREE.Vector3();
  const tail = kind === "shell" ? "#ff9a3c" : kind === "arrow" ? "#fff3d6" : color;
  return clock
    .run((age) => {
      const t = Math.min(1, age / secs);
      p.lerpVectors(a, b, t);
      p.y += Math.sin(t * Math.PI) * arc;
      o.position.copy(p);
      if (p.distanceToSquared(prev) > 1e-6) {
        o.lookAt(ahead.copy(p).add(p).sub(prev));
        // a streak, not a ball: it stretches along the way it flies
        if (kind === "bolt" || kind === "orb") o.scale.set(0.8, 0.8, 2.4);
        // the trail is laid between where it was and where it is, so a fast one leaves no gaps
        const steps = Math.max(1, Math.min(6, Math.ceil(p.distanceTo(prev) / 0.14)));
        for (let i = 1; i <= steps; i++) {
          ahead.lerpVectors(prev, p, i / steps);
          fx.burst(ahead, { color: tail, n: 1, speed: 0.15, life: kind === "arrow" ? 0.22 : 0.38, size: kind === "arrow" ? 0.11 : 0.19, gravity: lob ? 0.6 : 0 });
        }
      }
      prev.copy(p);
      return t >= 1;
    })
    .then(() => {
      scene.remove(o);
      if (o instanceof THREE.Mesh) o.geometry.dispose();
      mat?.dispose();
    });
}

/** The numbers over the fighters: a pool of absolutely placed labels on the overlay, each floating up and away. */
export class Numbers {
  private readonly layer: HTMLElement;

  constructor(layer: HTMLElement) {
    this.layer = layer;
  }

  /**
   * `lean` is the way it is thrown, −1 left to 1 right (away from whoever struck); `weight`, 0–1, is how heavy the
   * blow was, and sizes it.
   */
  pop(
    x: number,
    y: number,
    text: string,
    kind: "hit" | "hurt" | "crit" | "heal" | "miss" | "shield" | "word",
    lean = 0,
    weight = 0,
  ) {
    const el = document.createElement("div");
    el.className = `ar-num ar-num-${kind}`;
    const b = document.createElement("b");
    b.textContent = text;
    el.appendChild(b);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty("--dx", `${Math.round(lean * 46 + (Math.random() - 0.5) * 22)}px`);
    el.style.setProperty("--s", (1 + weight * 0.55).toFixed(2));
    this.layer.appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }
}
