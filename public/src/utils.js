// src/utils.js
import { MAZE } from "./constants.js";

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function gridToWorld(gx, gy) {
  return {
    x: (gx - Math.floor(MAZE.W / 2)) * MAZE.CELL,
    z: (gy - Math.floor(MAZE.H / 2)) * MAZE.CELL,
  };
}

export function worldToGrid(wx, wz) {
  return {
    gx: Math.round(wx / MAZE.CELL + Math.floor(MAZE.W / 2)),
    gy: Math.round(wz / MAZE.CELL + Math.floor(MAZE.H / 2)),
  };
}
