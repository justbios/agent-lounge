import * as THREE from "three";
import type { Clock } from "./tween";

/*
 * The arena's effects: sparks and dust as one pool of glowing points, rings that spread over the ground, things that
 * fly from a shooter to its target, and the numbers that pop over a fighter's head.
 */

const POOL = 1200;

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
      if (o.flat) {
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
  const arc = kind === "arrow" ? dist * 0.12 : kind === "shell" ? 1.2 + dist * 0.25 : kind === "spore" ? dist * 0.2 : 0;
  const speed = kind === "arrow" ? 16 : kind === "shell" ? 9 : kind === "spore" ? 8 : 12;
  const secs = Math.max(0.18, dist / speed);
  let o: THREE.Object3D;
  let mat: THREE.Material | null = null;
  if (kind === "arrow") o = ARROW.clone();
  else {
    const r = kind === "shell" ? 0.13 : kind === "spore" ? 0.12 : 0.11;
    mat =
      kind === "shell"
        ? new THREE.MeshStandardMaterial({ color: "#2b2b33", metalness: 0.5, emissive: "#ff7a1a", emissiveIntensity: 0.6 })
        : new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3 });
    o = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
  }
  scene.add(o);
  const p = new THREE.Vector3();
  const prev = a.clone();
  let trail = 0;
  return clock
    .run((age, dt) => {
      const t = Math.min(1, age / secs);
      p.lerpVectors(a, b, t);
      p.y += Math.sin(t * Math.PI) * arc;
      o.position.copy(p);
      if (kind === "arrow" && p.distanceToSquared(prev) > 1e-6) o.lookAt(p.clone().add(p.clone().sub(prev)));
      prev.copy(p);
      trail += dt;
      if (kind !== "arrow" && trail > 0.02) {
        trail = 0;
        fx.burst(p, { color: kind === "shell" ? "#ff9a3c" : color, n: 2, speed: 0.3, life: 0.35, size: 0.16, gravity: -0.5 });
      }
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

  pop(x: number, y: number, text: string, kind: "hit" | "crit" | "heal" | "miss" | "shield" | "word") {
    const el = document.createElement("div");
    el.className = `ar-num ar-num-${kind}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty("--dx", `${(Math.random() - 0.5) * 30}px`);
    this.layer.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }
}
