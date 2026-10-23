import * as THREE from "three";
import { seedOf } from "@/lib/arena/rng";
import type { Unit } from "@/lib/arena/types";
import { disposeFigure, makeFigure } from "./figures";

/*
 * Fighters' portraits for the screen round the field: each figure rendered once, head and shoulders, three-quarters
 * from the front, by one small renderer of its own, and kept as an image for the turn queue, the cards and the
 * result. The same look number gives the same figure the field shows.
 */

const SIZE = 144;
const cache = new Map<string, string>();
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);

function setup(): [THREE.WebGLRenderer, THREE.Scene] {
  if (renderer && scene) return [renderer, scene];
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#e6ecff", "#4a3a3a", 1.7));
  const key = new THREE.DirectionalLight("#fff1dc", 2.6);
  key.position.set(2, 3, 3);
  const rim = new THREE.DirectionalLight("#8fb8ff", 1.8);
  rim.position.set(-2.5, 2, -2);
  scene.add(key, rim);
  return [renderer, scene];
}

/**
 * The number a unit's figure is made with: the field and its portrait agree on it. The squad's own agents go by their
 * names alone, so they look the same in the squad menu; the rest, many of one name, differ by their number too.
 */
export const lookOf = (u: Pick<Unit, "id" | "name" | "team" | "summoned">): number =>
  seedOf(u.name) + (u.team === 0 && !u.summoned ? 0 : u.id * 7);

/** A unit's portrait as an image address. */
export const faceOf = (u: Unit): string => portrait(u.body, u.color, lookOf(u));

/** A figure's portrait as an image address; `look` is the number its figure on the field was made with. */
export function portrait(body: string, color: string, look: number): string {
  const key = `${body}|${color}|${look}`;
  const had = cache.get(key);
  if (had) return had;
  const [r, s] = setup();
  const fig = makeFigure(body, color, look);
  s.add(fig.root);
  const h = fig.height;
  const at = new THREE.Vector3(0, h * (fig.hover ? 0.72 : 0.64), 0);
  const d = Math.max(0.78, h * 0.98);
  camera.position.set(Math.sin(0.45) * d, at.y + h * 0.1, Math.cos(0.45) * d);
  camera.lookAt(at);
  camera.updateProjectionMatrix();
  r.render(s, camera);
  const url = r.domElement.toDataURL("image/png");
  s.remove(fig.root);
  disposeFigure(fig);
  cache.set(key, url);
  return url;
}
