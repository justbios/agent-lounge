import { COLS, ROWS, type Hex, colOf, hexAt, onBoard, rowOf } from "@/lib/arena/hex";

/*
 * Where the hexes are in the 3D scene: one unit from a hex's centre to a corner, rows down +z, columns along +x, the
 * board centred on the origin. The tiles' tops are at TOP, where the units stand.
 */

export const R = 1;
const W = Math.sqrt(3) * R;
const H = 1.5 * R;
export const TOP = 0.22;

const X0 = ((COLS - 0.5) * W) / 2;
const Z0 = ((ROWS - 1) * H) / 2;

/** The board's size in the scene, its half-width and half-depth with a hex to spare. */
export const HALF_W = X0 + W;
export const HALF_D = Z0 + H * 1.2;

export function hexXZ(h: Hex): [number, number] {
  const row = rowOf(h);
  return [(colOf(h) + (row & 1 ? 0.5 : 0)) * W - X0, row * H - Z0];
}

/** The hex under a point of the board, or null off it. */
export function hexAtXZ(x: number, z: number): Hex | null {
  // to axial, rounded through cube coordinates
  const px = x + X0;
  const pz = z + Z0;
  const q = ((Math.sqrt(3) / 3) * px - (1 / 3) * pz) / R;
  const r = ((2 / 3) * pz) / R;
  let rx = Math.round(q);
  let rz = Math.round(r);
  const ry = Math.round(-q - r);
  const dx = Math.abs(rx - q);
  const dy = Math.abs(ry - (-q - r));
  const dz = Math.abs(rz - r);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy <= dz) rz = -rx - ry;
  const col = rx + (rz - (rz & 1)) / 2;
  return onBoard(col, rz) ? hexAt(col, rz) : null;
}

/** The angle a unit at `a` turns to face `b`, about the y axis, 0 facing +z. */
export function facing(a: [number, number], b: [number, number]): number {
  return Math.atan2(b[0] - a[0], b[1] - a[1]);
}
